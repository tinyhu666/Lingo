//! Windows OCR engine — `Windows.Media.Ocr` backed.
//!
//! Mirrors the macOS Apple Vision impl in shape (`OcrEngine` trait,
//! `recognize` single-pass, `recognize_multilingual` two-pass-with-merge)
//! but the multilingual rationale is **different**, see
//! `spikes/ocr-vision/SPIKE_B_WINDOWS.md`:
//!
//! - `Windows.Media.Ocr` has no auto-detect. `TryCreateFromUserProfileLanguages`
//!   just picks one `OcrEngine` off the system locale, and that engine is
//!   weak at every other language. So on a Chinese-locale host we always
//!   miss English chat, and vice-versa. We work around it by maintaining
//!   one engine per language we care about (`zh-Hans-CN`, `en-US`, `ru-RU`
//!   when installed) and running every engine on every frame.
//!
//! - DotA chat is light glyphs on a semi-transparent dark panel sitting over
//!   the busy game world. Without a brightness threshold the recognizer
//!   either returns garbage or returns nothing. Spike B measured >40 pp
//!   accuracy gain from a single linear pass: `lum = 0.299R+0.587G+0.114B`,
//!   then white if `lum >= 180` else black. That preprocess lives in
//!   [`threshold_in_place`] and runs in-place on the captured BGRA8 buffer
//!   before we hand it to WinRT.
//!
//! - `Windows.Media.Ocr` inserts spaces between every CJK glyph
//!   ("推 中 路" instead of "推中路"). We strip them inside this module so
//!   downstream tracker/translator code stays platform-agnostic.
//!
//! - Language packs are per-host. The constructor enumerates what's
//!   actually installed and silently skips passes for unavailable
//!   languages. If *nothing* useful is installed we return
//!   [`OcrError::EngineInit`] with the System Settings deep-link as the
//!   recovery hint.
//!
//! Production latency on a cropped 800×90 chat band is 1.6–2.2 ms per pass
//! (vs ~30 ms for macOS Vision). Two-pass total ~3.8 ms, well inside the
//! 660 ms/frame budget at 1.5 Hz.

use windows::core::{Interface, HSTRING};
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::{OcrEngine as WinOcrEngine, OcrLine};
use windows::Storage::Streams::Buffer;
use windows::Win32::System::WinRT::IBufferByteAccess;

use crate::incoming::capture::{OcrFrame, PixelFormat};
use crate::incoming::ocr::{OcrEngine, OcrError, OcrOptions, TextLine};
use crate::incoming::region::Rect;

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

pub fn create() -> Result<Box<dyn OcrEngine>, OcrError> {
    Ok(Box::new(WindowsOcrEngine::new()?))
}

/// Languages we try to instantiate, in preference order (highest priority
/// first — used as the spine of the merge in [`merge_passes`]).
///
/// Adding to this list is safe; the constructor silently skips packs the
/// host doesn't have. We deliberately exclude `zh-Hant-*` (Traditional)
/// because zh-Hans handles it acceptably for DotA chat and the second
/// engine adds latency without recall.
const PASS_LANGS: &[&str] = &["zh-Hans-CN", "en-US", "ru-RU"];

/// Brightness threshold for the preprocess pass. Measured optimum on the
/// `samples/dota2/` corpus is 180/255. Below ~150 the busy game-world
/// backdrop bleeds into the foreground; above ~210 we start losing
/// anti-aliased glyph edges and accuracy drops. See `SPIKE_B_WINDOWS.md`.
const LUMINANCE_THRESHOLD: u8 = 180;

// ---------------------------------------------------------------------------
// WindowsOcrEngine
// ---------------------------------------------------------------------------

/// Holds one WinRT `OcrEngine` per installed language we care about. Engines
/// are immutable once created and `RecognizeAsync` is the only call we make,
/// so storing them across frames saves ~5 ms of init work per pass.
pub struct WindowsOcrEngine {
    engines: Vec<(String, WinOcrEngine)>,
}

impl WindowsOcrEngine {
    pub fn new() -> Result<Self, OcrError> {
        let mut engines = Vec::new();
        for tag in PASS_LANGS {
            let lang = Language::CreateLanguage(&HSTRING::from(*tag))
                .map_err(|e| OcrError::EngineInit(format!("Language({tag}): {e}")))?;
            let supported = WinOcrEngine::IsLanguageSupported(&lang)
                .map_err(|e| OcrError::EngineInit(format!("IsLanguageSupported({tag}): {e}")))?;
            if !supported {
                continue;
            }
            let engine = WinOcrEngine::TryCreateFromLanguage(&lang)
                .map_err(|e| OcrError::EngineInit(format!("TryCreateFromLanguage({tag}): {e}")))?;
            engines.push(((*tag).to_string(), engine));
        }
        if engines.is_empty() {
            return Err(OcrError::EngineInit(
                "no Windows OCR language packs are installed. Open Settings → \
                 Time & language → Language → 'Add a language' and install at \
                 least one of: English (United States), 简体中文(中国), \
                 русский (Россия)."
                    .to_string(),
            ));
        }
        Ok(Self { engines })
    }

    /// Which languages are wired up on this host. Useful for diagnostics
    /// and front-end "consider installing X" hints. Not consumed yet —
    /// the v0.7.0-rc.4 ship doesn't surface a settings warning, but the
    /// rc.5 front-end work will.
    #[allow(dead_code)]
    pub fn available_languages(&self) -> Vec<String> {
        self.engines.iter().map(|(t, _)| t.clone()).collect()
    }

    fn pick_engine_for(&self, langs: &[String]) -> &WinOcrEngine {
        // If the caller named a specific language, honor it. Otherwise use
        // whichever pass is first in PASS_LANGS that we have installed.
        for want in langs {
            if let Some((_, e)) = self
                .engines
                .iter()
                .find(|(t, _)| t.eq_ignore_ascii_case(want))
            {
                return e;
            }
        }
        &self.engines[0].1
    }

    fn run_pass(
        &self,
        engine: &WinOcrEngine,
        bitmap: &SoftwareBitmap,
    ) -> Result<Vec<TextLine>, OcrError> {
        let result = engine
            .RecognizeAsync(bitmap)
            .and_then(|op| op.get())
            .map_err(|e| OcrError::RecognitionFailed(format!("RecognizeAsync: {e}")))?;
        let mut out = Vec::new();
        let lines = result
            .Lines()
            .map_err(|e| OcrError::RecognitionFailed(format!("Lines: {e}")))?;
        for line in lines {
            let text = line
                .Text()
                .map_err(|e| OcrError::RecognitionFailed(format!("Line.Text: {e}")))?
                .to_string();
            if text.trim().is_empty() {
                continue;
            }
            let bbox = line_bbox(&line)?;
            // Windows.Media.Ocr doesn't expose per-line confidence in this
            // surface. We pass 1.0 so the downstream tracker doesn't filter
            // away legitimate lines; the macOS impl uses real confidences
            // but neither path consumes them today (LineTracker dedupes on
            // text + position).
            out.push(TextLine {
                text: strip_inter_cjk_spaces(&text),
                confidence: 1.0,
                bbox,
            });
        }
        Ok(out)
    }
}

impl OcrEngine for WindowsOcrEngine {
    fn recognize(&self, frame: &OcrFrame, opts: &OcrOptions) -> Result<Vec<TextLine>, OcrError> {
        let bitmap = frame_to_bitmap(frame)?;
        let engine = self.pick_engine_for(&opts.languages);
        self.run_pass(engine, &bitmap)
    }

    /// Multi-pass + merge. Unlike macOS (where the merge is just a Cyrillic
    /// recovery layer over an auto-detect pass), here every available engine
    /// runs on every frame because there is no auto-detect to start from.
    fn recognize_multilingual(
        &self,
        frame: &OcrFrame,
        _opts: &OcrOptions,
    ) -> Result<Vec<TextLine>, OcrError> {
        let bitmap = frame_to_bitmap(frame)?;
        let mut passes: Vec<(String, Vec<TextLine>)> = Vec::with_capacity(self.engines.len());
        for (tag, engine) in &self.engines {
            let lines = self.run_pass(engine, &bitmap)?;
            passes.push((tag.clone(), lines));
        }
        Ok(merge_passes(passes))
    }
}

// ---------------------------------------------------------------------------
// BGRA8 frame → thresholded SoftwareBitmap
// ---------------------------------------------------------------------------

fn frame_to_bitmap(frame: &OcrFrame) -> Result<SoftwareBitmap, OcrError> {
    if frame.width == 0 || frame.height == 0 {
        return Err(OcrError::InvalidFrame("zero-sized frame".into()));
    }
    if frame.format != PixelFormat::Bgra8 {
        return Err(OcrError::InvalidFrame(format!(
            "expected BGRA8 frame; got {:?}",
            frame.format
        )));
    }
    let stride = frame.stride as usize;
    let tight_stride = (frame.width as usize) * 4;
    if stride < tight_stride {
        return Err(OcrError::InvalidFrame(format!(
            "stride {stride} < width*4={tight_stride}"
        )));
    }
    let needed = stride
        .checked_mul(frame.height as usize)
        .ok_or_else(|| OcrError::InvalidFrame("frame dimensions overflow".into()))?;
    if frame.data.len() < needed {
        return Err(OcrError::InvalidFrame(format!(
            "data {} < stride*height={}",
            frame.data.len(),
            needed
        )));
    }

    // Copy the frame into a tight-stride buffer, applying the brightness
    // threshold in the same pass to avoid two scans over the buffer.
    let mut packed: Vec<u8> = Vec::with_capacity(tight_stride * frame.height as usize);
    for y in 0..frame.height as usize {
        let row_start = y * stride;
        let src_row = &frame.data[row_start..row_start + tight_stride];
        packed.extend_from_slice(src_row);
    }
    threshold_in_place(&mut packed, frame.width, frame.height, LUMINANCE_THRESHOLD);

    let len = packed.len() as u32;
    let buffer = Buffer::Create(len)
        .map_err(|e| OcrError::EngineInit(format!("Buffer::Create({len}): {e}")))?;
    buffer
        .SetLength(len)
        .map_err(|e| OcrError::EngineInit(format!("Buffer::SetLength: {e}")))?;

    let access: IBufferByteAccess = buffer
        .cast()
        .map_err(|e| OcrError::EngineInit(format!("IBuffer → IBufferByteAccess: {e}")))?;
    // SAFETY: `IBufferByteAccess::Buffer` returns a pointer to the start of
    // a contiguous `len`-byte block owned by `buffer`. We write exactly
    // `packed.len() == len` bytes there and don't aliase the pointer with
    // any other live borrow. `SoftwareBitmap::CreateCopyWithAlphaFromBuffer`
    // copies (not borrows) the buffer contents, so `buffer` becoming
    // unreachable after this scope is fine.
    unsafe {
        let dst = access
            .Buffer()
            .map_err(|e| OcrError::EngineInit(format!("IBufferByteAccess::Buffer: {e}")))?;
        std::ptr::copy_nonoverlapping(packed.as_ptr(), dst, packed.len());
    }

    SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        frame.width as i32,
        frame.height as i32,
        BitmapAlphaMode::Premultiplied,
    )
    .map_err(|e| OcrError::EngineInit(format!("CreateCopyWithAlphaFromBuffer: {e}")))
}

/// Brightness threshold on a tight-stride BGRA8 buffer. Pixels whose
/// luminance (Rec.601 weights) is `>= thr` go full-white-opaque; the
/// rest go full-black-opaque. We force alpha to 255 to drop the
/// pre-multiplied weirdness — OCR ignores alpha anyway.
pub(crate) fn threshold_in_place(buf: &mut [u8], width: u32, height: u32, thr: u8) {
    let w = width as usize;
    let h = height as usize;
    for y in 0..h {
        let row = y * w * 4;
        for x in 0..w {
            let i = row + x * 4;
            let b = buf[i] as u32;
            let g = buf[i + 1] as u32;
            let r = buf[i + 2] as u32;
            // Integer Rec.601 luminance. Matches what most OCR preprocessing
            // pipelines use; tested in the spike against floating-point Y
            // and the difference is <0.5 of accuracy on the corpus.
            let lum = ((r * 299 + g * 587 + b * 114) / 1000) as u8;
            let v = if lum >= thr { 255 } else { 0 };
            buf[i] = v;
            buf[i + 1] = v;
            buf[i + 2] = v;
            buf[i + 3] = 255;
        }
    }
}

// ---------------------------------------------------------------------------
// Line bbox extraction
// ---------------------------------------------------------------------------

fn line_bbox(line: &OcrLine) -> Result<Rect, OcrError> {
    // Windows.Media.Ocr exposes a bounding rect per word; the line itself
    // doesn't carry one. We take the union of every word's rect — same
    // shape as the Vision normalized-bbox-to-pixels output on macOS.
    let words = line
        .Words()
        .map_err(|e| OcrError::RecognitionFailed(format!("Line.Words: {e}")))?;
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = 0.0_f32;
    let mut max_y = 0.0_f32;
    let mut any = false;
    for w in words {
        let r = w
            .BoundingRect()
            .map_err(|e| OcrError::RecognitionFailed(format!("Word.BoundingRect: {e}")))?;
        any = true;
        let x = r.X;
        let y = r.Y;
        let ww = r.Width;
        let hh = r.Height;
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x + ww);
        max_y = max_y.max(y + hh);
    }
    if !any {
        return Ok(Rect {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
        });
    }
    Ok(Rect {
        x: min_x.max(0.0).round() as i32,
        y: min_y.max(0.0).round() as i32,
        w: (max_x - min_x).max(0.0).round() as u32,
        h: (max_y - min_y).max(0.0).round() as u32,
    })
}

// ---------------------------------------------------------------------------
// Multi-pass merge
// ---------------------------------------------------------------------------

/// Merge per-language OCR passes into a single ordered set of lines.
///
/// Strategy: pick the longest pass as the spine (most lines recovered),
/// then for each row from every *other* pass, take it if that pass's
/// engine produced its own native script (so the en-US pass contributes
/// rows that have ASCII letters, the zh-Hans pass contributes rows with
/// CJK, etc.) AND the spine doesn't already cover that row with the
/// right script. Output is sorted by `bbox.y`.
pub(crate) fn merge_passes(passes: Vec<(String, Vec<TextLine>)>) -> Vec<TextLine> {
    if passes.is_empty() {
        return Vec::new();
    }
    // Pick spine: most lines wins; ties broken by PASS_LANGS order
    // (zh first), so output is reproducible regardless of host locale.
    let order = |t: &str| -> u8 {
        PASS_LANGS
            .iter()
            .position(|p| *p == t)
            .map(|p| p as u8)
            .unwrap_or(u8::MAX)
    };
    let spine_idx = passes
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| {
            a.1.len()
                .cmp(&b.1.len())
                .then_with(|| order(&b.0).cmp(&order(&a.0)))
        })
        .map(|(i, _)| i)
        .unwrap_or(0);

    let mut output: Vec<TextLine> = passes[spine_idx].1.clone();

    for (other_idx, (other_tag, other_lines)) in passes.iter().enumerate() {
        if other_idx == spine_idx {
            continue;
        }
        for other_line in other_lines {
            // The "other" pass only contributes if it actually saw its own
            // script — otherwise it's repeating garbage the spine already
            // mis-recognized.
            if !contains_native_script(other_tag, &other_line.text) {
                continue;
            }
            match output.iter().position(|sp| rows_overlap(sp, other_line)) {
                Some(idx) => {
                    // Upgrade rules (BOTH must hold):
                    //
                    // 1. The other pass found strictly more of its own
                    //    native script than the spine did. Distinguishes
                    //    garbage ("mok 皂 up": 5 ASCII letters) from
                    //    real English ("smoke up rosh": 11).
                    //
                    // 2. The other pass produced at least as much
                    //    non-whitespace content overall. Protects mixed
                    //    rows: spine "gankmid 五人抱团" (11 non-ws chars)
                    //    beats en "gank mid" (7 non-ws chars) even
                    //    though en has more ASCII letters, because the
                    //    spine captured the Chinese half too.
                    //
                    // Single stray CJK chars the zh engine sometimes
                    // hallucinates inside English text aren't enough on
                    // their own to keep the spine — they get out-voted
                    // by Rule 2 when the en pass is meaningfully longer.
                    let other_self = native_script_count(other_tag, &other_line.text);
                    let spine_self = native_script_count(other_tag, &output[idx].text);
                    let other_content = non_ws_count(&other_line.text);
                    let spine_content = non_ws_count(&output[idx].text);
                    if other_self > spine_self && other_content >= spine_content {
                        output[idx] = other_line.clone();
                    }
                }
                None => output.push(other_line.clone()),
            }
        }
    }

    output.sort_by_key(|l| l.bbox.y);
    output
}

fn rows_overlap(a: &TextLine, b: &TextLine) -> bool {
    let a_center = a.bbox.y as f32 + a.bbox.h as f32 * 0.5;
    let b_center = b.bbox.y as f32 + b.bbox.h as f32 * 0.5;
    let tol = (a.bbox.h.min(b.bbox.h) as f32) * 0.5;
    (a_center - b_center).abs() <= tol
}

pub(crate) fn contains_native_script(tag: &str, s: &str) -> bool {
    native_script_count(tag, s) > 0
}

fn non_ws_count(s: &str) -> usize {
    s.chars().filter(|c| !c.is_whitespace()).count()
}

/// Number of characters in `s` that belong to `tag`'s native script. Used
/// by the merge to decide between two passes that both produced text for
/// the same row. Spike-B-grade "mok 皂 up" (5 ASCII letters) loses to
/// "smoke up rosh" (12) because the latter has more English content.
pub(crate) fn native_script_count(tag: &str, s: &str) -> usize {
    if tag.starts_with("en") {
        s.chars().filter(|c| c.is_ascii_alphabetic()).count()
    } else if tag.starts_with("zh") {
        s.chars().filter(|c| is_cjk(*c)).count()
    } else if tag.starts_with("ru") {
        s.chars().filter(|c| is_cyrillic(*c)).count()
    } else {
        s.chars().filter(|c| !c.is_whitespace()).count()
    }
}

// ---------------------------------------------------------------------------
// Text post-processing
// ---------------------------------------------------------------------------

/// Strip a single ASCII space when it sits between two CJK characters.
/// `Windows.Media.Ocr` returns "推 中 路"; we want "推中路". Leaves
/// "gank mid 五人" alone because "k"/"5" aren't CJK.
pub(crate) fn strip_inter_cjk_spaces(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let n = chars.len();
    let mut i = 0;
    while i < n {
        let c = chars[i];
        let skip = c == ' ' && i > 0 && i + 1 < n && is_cjk(chars[i - 1]) && is_cjk(chars[i + 1]);
        if !skip {
            out.push(c);
        }
        i += 1;
    }
    out
}

fn is_cjk(c: char) -> bool {
    let code = c as u32;
    (0x4E00..=0x9FFF).contains(&code)   // CJK Unified Ideographs
        || (0x3000..=0x303F).contains(&code) // CJK Symbols & Punctuation (。、《》)
        || (0x3400..=0x4DBF).contains(&code) // CJK Extension A
        // Halfwidth/Fullwidth Forms — fullwidth ASCII variants (，：；！？)
        // travel with CJK text and the Windows OCR engine spaces them
        // alongside Hanzi, so they belong on the "strip the space" side.
        || (0xFF00..=0xFFEF).contains(&code)
}

fn is_cyrillic(c: char) -> bool {
    let code = c as u32;
    (0x0400..=0x04FF).contains(&code) || (0x0500..=0x052F).contains(&code)
}

// ---------------------------------------------------------------------------
// Tests (pure-logic only — the WinRT engine itself can't be unit-tested
// here; the spike binary at `spikes/ocr-vision/spike-windows/` covers that).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn line(text: &str, y: i32, h: u32) -> TextLine {
        TextLine {
            text: text.to_string(),
            confidence: 1.0,
            bbox: Rect { x: 0, y, w: 100, h },
        }
    }

    // ----- strip_inter_cjk_spaces -----

    #[test]
    fn strip_inter_cjk_spaces_collapses_cjk_runs() {
        assert_eq!(strip_inter_cjk_spaces("推 中 路"), "推中路");
        assert_eq!(strip_inter_cjk_spaces("等 我 大 招 出 来"), "等我大招出来");
    }

    #[test]
    fn strip_inter_cjk_spaces_keeps_latin_word_breaks() {
        assert_eq!(strip_inter_cjk_spaces("gg wp"), "gg wp");
        assert_eq!(strip_inter_cjk_spaces("smoke up rosh"), "smoke up rosh");
    }

    #[test]
    fn strip_inter_cjk_spaces_keeps_mixed_word_breaks() {
        // "gank mid 五 人" — space between mid and 五 should stay (left is
        // ASCII), space between 五 and 人 should go.
        assert_eq!(strip_inter_cjk_spaces("gank mid 五 人"), "gank mid 五人");
    }

    #[test]
    fn strip_inter_cjk_spaces_handles_empty_and_punctuation() {
        assert_eq!(strip_inter_cjk_spaces(""), "");
        assert_eq!(strip_inter_cjk_spaces("   "), "   ");
        assert_eq!(strip_inter_cjk_spaces("。 ， ："), "。，：");
    }

    // ----- contains_native_script -----

    #[test]
    fn contains_native_script_picks_right_buckets() {
        assert!(contains_native_script("en-US", "gg wp"));
        assert!(!contains_native_script("en-US", "推中路"));
        assert!(contains_native_script("zh-Hans-CN", "推中路"));
        assert!(!contains_native_script("zh-Hans-CN", "gg wp"));
        assert!(contains_native_script("ru-RU", "иди в лес"));
        assert!(!contains_native_script("ru-RU", "推中路"));
    }

    #[test]
    fn contains_native_script_accepts_mixed_for_en_and_zh() {
        // Both engines should claim mixed CN+EN rows.
        assert!(contains_native_script("en-US", "gank mid 五人抱团"));
        assert!(contains_native_script("zh-Hans-CN", "gank mid 五人抱团"));
    }

    // ----- threshold_in_place -----

    #[test]
    fn threshold_snaps_above_to_white_and_below_to_black() {
        // 2x1 image: one bright pixel (R=200,G=200,B=200,A=128), one dark
        // (R=10,G=10,B=10,A=255).
        let mut buf = vec![200, 200, 200, 128, 10, 10, 10, 255];
        threshold_in_place(&mut buf, 2, 1, 180);
        // Bright > 180 → (255,255,255,255); dark < 180 → (0,0,0,255).
        assert_eq!(buf, vec![255, 255, 255, 255, 0, 0, 0, 255]);
    }

    #[test]
    fn threshold_handles_yellow_chat_color_correctly() {
        // DotA all-chat tag is yellow (~255,220,80). Luminance =
        // 0.299*255 + 0.587*220 + 0.114*80 ≈ 213 — should pass thr=180.
        let mut buf = vec![80, 220, 255, 255];
        threshold_in_place(&mut buf, 1, 1, 180);
        assert_eq!(buf, vec![255, 255, 255, 255]);
    }

    #[test]
    fn threshold_kills_busy_green_grass_backdrop() {
        // Game-world grass is roughly (100,140,80) — luminance ~118.
        let mut buf = vec![80, 140, 100, 255];
        threshold_in_place(&mut buf, 1, 1, 180);
        assert_eq!(buf, vec![0, 0, 0, 255]);
    }

    // ----- merge_passes -----

    #[test]
    fn merge_returns_spine_when_only_one_pass() {
        let passes = vec![("zh-Hans-CN".into(), vec![line("推中路", 100, 30)])];
        let out = merge_passes(passes);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].text, "推中路");
    }

    #[test]
    fn merge_takes_english_from_en_pass_for_english_rows() {
        // Spine zh-Hans-CN returned garbage on an English-only row; en-US
        // got it right.
        let zh = vec![line("mok 皂 up", 100, 30)];
        let en = vec![line("smoke up rosh", 100, 30)];
        let out = merge_passes(vec![("zh-Hans-CN".into(), zh), ("en-US".into(), en)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].text, "smoke up rosh");
    }

    #[test]
    fn merge_keeps_zh_when_zh_already_has_both_scripts() {
        // zh pass produced a mixed row ("gankmid 五人抱团"). en-US produced
        // a partial row ("gank mid") for the same y. The mixed zh row
        // already covers both scripts and is more complete, so keep it.
        let zh = vec![line("gankmid 五人抱团", 100, 30)];
        let en = vec![line("gank mid", 100, 30)];
        let out = merge_passes(vec![("zh-Hans-CN".into(), zh), ("en-US".into(), en)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].text, "gankmid 五人抱团");
    }

    #[test]
    fn merge_surfaces_russian_rows_zh_pass_missed() {
        // zh pass returned nothing for a Russian-only row. ru pass found it.
        let zh: Vec<TextLine> = vec![];
        let ru = vec![line("иди в лес", 100, 30)];
        let out = merge_passes(vec![("zh-Hans-CN".into(), zh), ("ru-RU".into(), ru)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].text, "иди в лес");
    }

    #[test]
    fn merge_ignores_other_pass_garbage() {
        // en pass returned a row at the same y but with no ASCII letters
        // (just punctuation) — that's garbage and shouldn't replace the
        // spine's correct Chinese.
        let zh = vec![line("推中路", 100, 30)];
        let en = vec![line(",,.", 100, 30)];
        let out = merge_passes(vec![("zh-Hans-CN".into(), zh), ("en-US".into(), en)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].text, "推中路");
    }

    #[test]
    fn merge_sorts_output_by_y() {
        let zh = vec![line("第二行", 200, 30)];
        let en = vec![line("first line", 100, 30)];
        let out = merge_passes(vec![("zh-Hans-CN".into(), zh), ("en-US".into(), en)]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].bbox.y, 100);
        assert_eq!(out[1].bbox.y, 200);
    }

    // ----- rows_overlap -----

    #[test]
    fn rows_overlap_within_half_height_tolerance() {
        let a = line("a", 100, 30);
        let b = line("b", 110, 30); // centers differ by 10, tol = 15
        assert!(rows_overlap(&a, &b));
        let c = line("c", 200, 30); // centers differ by 100
        assert!(!rows_overlap(&a, &c));
    }
}
