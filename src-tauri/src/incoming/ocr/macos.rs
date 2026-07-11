//! Apple Vision OCR engine for the v0.7.0 incoming-chat translation
//! feature.
//!
//! Mirrors the production config validated in `spikes/ocr-vision/`:
//! - `recognitionLevel = .accurate`
//! - `automaticallyDetectsLanguage = true` (or explicit language list)
//! - `usesLanguageCorrection = false`
//!
//! The pipeline normally calls [`AppleVisionOcrEngine::recognize`] once
//! per frame. When `OcrOptions::auto_detect_language` is `true` AND the
//! captured region contains both heavily-Chinese context and short
//! Cyrillic content, auto-detect biases toward the dominant script and
//! mangles the minority. The spike measured this on real DotA chat —
//! Russian came back as `MAHBJIeC9 中aPMJIO` until we forced `ru-RU`.
//!
//! [`AppleVisionOcrEngine::recognize_multilingual`] runs an extra pass
//! with `recognitionLanguages = ["ru-RU"]` and merges the two outputs:
//! any line that contains Cyrillic codepoints is taken from the
//! Russian-forced pass; everything else from the auto-detect pass. Each
//! pass on an 800x90 chat region is ~30 ms so the doubled call still
//! sits well under the 1.5 Hz budget.

use core::ffi::c_void;
use core::ptr::NonNull;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::AllocAnyThread;
use objc2_core_foundation::CFRetained;
use objc2_core_graphics::{
    CGBitmapInfo, CGColorRenderingIntent, CGColorSpace, CGDataProvider, CGImage, CGImageAlphaInfo,
    CGImageByteOrderInfo,
};
use objc2_foundation::{NSArray, NSDictionary, NSString};
use objc2_vision::{
    VNImageOption, VNImageRequestHandler, VNRecognizeTextRequest, VNRequest,
    VNRequestTextRecognitionLevel,
};

use crate::incoming::capture::{OcrFrame, PixelFormat};
use crate::incoming::ocr::{OcrEngine, OcrError, OcrOptions, RecognitionLevel, TextLine};
use crate::incoming::region::Rect;

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

pub fn create() -> Result<Box<dyn OcrEngine>, OcrError> {
    Ok(Box::new(AppleVisionOcrEngine::new()))
}

/// Stateless Vision wrapper. Each recognize() call allocates a fresh
/// request + handler; Vision keeps no per-engine state we care about.
pub struct AppleVisionOcrEngine;

impl AppleVisionOcrEngine {
    pub fn new() -> Self {
        Self
    }
}

impl OcrEngine for AppleVisionOcrEngine {
    fn recognize(&self, frame: &OcrFrame, opts: &OcrOptions) -> Result<Vec<TextLine>, OcrError> {
        let image = frame_to_cg_image(frame)?;
        let frame_w = CGImage::width(Some(&image)) as f32;
        let frame_h = CGImage::height(Some(&image)) as f32;
        run_vision(&image, opts, frame_w, frame_h)
    }

    /// Two-pass recognition tuned for game chat with Cyrillic on a
    /// CJK-dominant frame. See module docs for the rationale.
    fn recognize_multilingual(
        &self,
        frame: &OcrFrame,
        primary_opts: &OcrOptions,
    ) -> Result<Vec<TextLine>, OcrError> {
        let image = frame_to_cg_image(frame)?;
        let frame_w = CGImage::width(Some(&image)) as f32;
        let frame_h = CGImage::height(Some(&image)) as f32;

        let primary = run_vision(&image, primary_opts, frame_w, frame_h)?;

        let cyrillic_opts = OcrOptions {
            level: primary_opts.level,
            auto_detect_language: false,
            languages: vec!["ru-RU".to_string()],
            uses_language_correction: false,
        };
        let cyrillic_pass = run_vision(&image, &cyrillic_opts, frame_w, frame_h)?;

        Ok(merge_passes(primary, cyrillic_pass))
    }
}

// ---------------------------------------------------------------------------
// Frame → CGImage
// ---------------------------------------------------------------------------

fn frame_to_cg_image(frame: &OcrFrame) -> Result<CFRetained<CGImage>, OcrError> {
    if frame.width == 0 || frame.height == 0 {
        return Err(OcrError::InvalidFrame("zero-sized frame".into()));
    }
    let expected_min_stride = (frame.width as usize) * 4;
    if (frame.stride as usize) < expected_min_stride {
        return Err(OcrError::InvalidFrame(format!(
            "stride {} smaller than width*4={}",
            frame.stride, expected_min_stride
        )));
    }
    let needed = (frame.stride as usize)
        .checked_mul(frame.height as usize)
        .ok_or_else(|| OcrError::InvalidFrame("frame dimensions overflow".into()))?;
    if frame.data.len() < needed {
        return Err(OcrError::InvalidFrame(format!(
            "data buffer {} smaller than stride*height={}",
            frame.data.len(),
            needed
        )));
    }

    // Move the pixel bytes into a heap allocation that the CGDataProvider
    // owns. The release callback drops the Box, which frees the Vec, which
    // frees the underlying buffer. CGImage holds the provider alive as long
    // as it itself is alive, so this stays sound across the Vision call.
    let mut owned: Box<Vec<u8>> = Box::new(frame.data.clone());
    let data_ptr = owned.as_mut_ptr() as *const c_void;
    let size = owned.len();
    let info_ptr = Box::into_raw(owned) as *mut c_void;

    let provider =
        unsafe { CGDataProvider::with_data(info_ptr, data_ptr, size, Some(release_owned_bytes)) }
            .ok_or_else(|| {
            // Recover the Box so we don't leak when the OS rejects us.
            unsafe { drop(Box::from_raw(info_ptr as *mut Vec<u8>)) };
            OcrError::EngineInit("CGDataProviderCreateWithData returned null".into())
        })?;

    let color_space = CGColorSpace::new_device_rgb()
        .ok_or_else(|| OcrError::EngineInit("CGColorSpaceCreateDeviceRGB failed".into()))?;

    // BGRA8 premultiplied = ByteOrder32Little + AlphaInfo::PremultipliedFirst.
    // RGBA8 premultiplied = ByteOrder32Big    + AlphaInfo::PremultipliedLast.
    let bitmap_info = match frame.format {
        PixelFormat::Bgra8 => CGBitmapInfo::from_bits_retain(
            CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0,
        ),
        PixelFormat::Rgba8 => CGBitmapInfo::from_bits_retain(
            CGImageByteOrderInfo::Order32Big.0 | CGImageAlphaInfo::PremultipliedLast.0,
        ),
    };

    let image = unsafe {
        CGImage::new(
            frame.width as usize,
            frame.height as usize,
            8,
            32,
            frame.stride as usize,
            Some(&color_space),
            bitmap_info,
            Some(&provider),
            core::ptr::null(),
            false,
            CGColorRenderingIntent::RenderingIntentDefault,
        )
    }
    .ok_or_else(|| OcrError::EngineInit("CGImageCreate returned null".into()))?;

    Ok(image)
}

unsafe extern "C-unwind" fn release_owned_bytes(
    info: *mut c_void,
    _data: NonNull<c_void>,
    _size: usize,
) {
    if !info.is_null() {
        drop(unsafe { Box::from_raw(info as *mut Vec<u8>) });
    }
}

// ---------------------------------------------------------------------------
// Vision call
// ---------------------------------------------------------------------------

fn run_vision(
    image: &CGImage,
    opts: &OcrOptions,
    frame_w: f32,
    frame_h: f32,
) -> Result<Vec<TextLine>, OcrError> {
    let request = unsafe { VNRecognizeTextRequest::init(VNRecognizeTextRequest::alloc()) };

    request.setRecognitionLevel(match opts.level {
        RecognitionLevel::Accurate => VNRequestTextRecognitionLevel::Accurate,
        RecognitionLevel::Fast => VNRequestTextRecognitionLevel::Fast,
    });
    request.setUsesLanguageCorrection(opts.uses_language_correction);
    request.setAutomaticallyDetectsLanguage(opts.auto_detect_language);

    if !opts.languages.is_empty() {
        let strings: Vec<Retained<NSString>> = opts
            .languages
            .iter()
            .map(|s| NSString::from_str(s))
            .collect();
        let refs: Vec<&NSString> = strings.iter().map(|s| s.as_ref()).collect();
        let array = NSArray::from_slice(&refs);
        request.setRecognitionLanguages(&array);
    }

    let empty_options: Retained<NSDictionary<VNImageOption, AnyObject>> =
        NSDictionary::from_slices::<VNImageOption>(&[], &[]);
    let handler = unsafe {
        VNImageRequestHandler::initWithCGImage_options(
            VNImageRequestHandler::alloc(),
            image,
            &empty_options,
        )
    };

    // performRequests_error wants NSArray<VNRequest>. Up-cast the typed
    // request before constructing the array so the runtime sees the
    // correct dynamic type.
    let upcast: Retained<VNRequest> = unsafe { Retained::cast_unchecked(request.clone()) };
    let requests = NSArray::from_retained_slice(&[upcast]);

    handler
        .performRequests_error(&requests)
        .map_err(|err| OcrError::RecognitionFailed(format!("Vision request failed: {err:?}")))?;

    let mut out = Vec::new();
    let Some(results) = request.results() else {
        return Ok(out);
    };

    for obs in results.iter() {
        let candidates = obs.topCandidates(1);
        let Some(text) = candidates.iter().next() else {
            continue;
        };
        let s = text.string().to_string();
        if s.trim().is_empty() {
            continue;
        }
        let bbox_normalized = unsafe { obs.boundingBox() };
        let pixel_rect = normalized_bbox_to_pixels(
            bbox_normalized.origin.x as f32,
            bbox_normalized.origin.y as f32,
            bbox_normalized.size.width as f32,
            bbox_normalized.size.height as f32,
            frame_w,
            frame_h,
        );
        out.push(TextLine {
            text: s,
            confidence: text.confidence(),
            bbox: pixel_rect,
        });
    }
    Ok(out)
}

fn normalized_bbox_to_pixels(
    nx: f32,
    ny: f32,
    nw: f32,
    nh: f32,
    image_w: f32,
    image_h: f32,
) -> Rect {
    // Vision uses origin-bottom-left. Convert to top-left pixel coords
    // so downstream consumers (overlay positioning, region cropping) can
    // work in screen space directly.
    let x = (nx * image_w).round();
    let w = (nw * image_w).round();
    let h = (nh * image_h).round();
    let y = ((1.0 - ny - nh) * image_h).round();
    Rect {
        x: x as i32,
        y: y as i32,
        w: w.max(0.0) as u32,
        h: h.max(0.0) as u32,
    }
}

// ---------------------------------------------------------------------------
// Two-pass merge
// ---------------------------------------------------------------------------

fn merge_passes(primary: Vec<TextLine>, cyrillic: Vec<TextLine>) -> Vec<TextLine> {
    // Two passes can return slightly different bbox y-coords for the same
    // chat row because Vision occasionally splits/joins lines differently
    // under different language hints. Match rows by vertical overlap
    // (centerline distance < min(h_a, h_b) * 0.5).
    let mut output: Vec<TextLine> = Vec::new();
    let mut used_cyrillic = vec![false; cyrillic.len()];

    for line in primary.iter() {
        let line_contains_cyrillic = contains_cyrillic(&line.text);
        if line_contains_cyrillic {
            // The primary auto-detect pass already returned Cyrillic for
            // this row, which means there wasn't enough non-Cyrillic
            // context to confuse the detector. Trust it.
            output.push(line.clone());
            // Mark any cyrillic-pass row that overlaps this one as
            // consumed so we don't duplicate.
            if let Some(idx) = find_overlapping_index(line, &cyrillic, &used_cyrillic) {
                used_cyrillic[idx] = true;
            }
            continue;
        }
        // For non-Cyrillic primary rows, prefer the ru-RU pass output if
        // it produced a better candidate at roughly the same y.
        if let Some(idx) = find_overlapping_index(line, &cyrillic, &used_cyrillic) {
            if should_prefer_cyrillic_candidate(line, &cyrillic[idx]) {
                output.push(cyrillic[idx].clone());
                used_cyrillic[idx] = true;
                continue;
            }
        }
        output.push(line.clone());
    }

    // Surface any cyrillic-only rows that the primary pass missed entirely
    // (Vision sometimes drops Cyrillic rows in auto-detect mode).
    for (idx, line) in cyrillic.into_iter().enumerate() {
        if used_cyrillic[idx] {
            continue;
        }
        if contains_cyrillic(&line.text)
            && !primary
                .iter()
                .any(|primary_line| rows_overlap(primary_line, &line))
        {
            output.push(line);
        }
    }

    output.sort_by_key(|line| line.bbox.y);
    output
}

fn should_prefer_cyrillic_candidate(primary: &TextLine, candidate: &TextLine) -> bool {
    if candidate.confidence + 0.05 < primary.confidence {
        return false;
    }

    let primary_body = message_body(&primary.text);
    let candidate_body = message_body(&candidate.text);
    let primary_cjk = primary_body.chars().filter(|c| is_cjk(*c)).count();
    let primary_ascii_letters = primary_body
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .count();

    // A real Chinese or mixed-language message is stronger evidence than
    // the forced ru-RU pass, which can hallucinate Cyrillic over CJK glyphs.
    if primary_cjk >= 2 || (primary_cjk == 1 && primary_ascii_letters < 3) {
        return false;
    }

    if candidate_body.chars().filter(|c| is_cyrillic(*c)).count() >= 2 {
        return true;
    }

    // A language-specific pass can also repair short Latin game phrases
    // while misreading only the sender. Accept that result only when it
    // replaces digit-shaped glyphs with materially more alphabetic text.
    let candidate_ascii_letters = candidate_body
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .count();
    let primary_ascii_digits = primary_body.chars().filter(|c| c.is_ascii_digit()).count();
    let candidate_ascii_digits = candidate_body
        .chars()
        .filter(|c| c.is_ascii_digit())
        .count();

    candidate_ascii_letters >= primary_ascii_letters + 2
        && candidate_ascii_digits < primary_ascii_digits
}

fn message_body(text: &str) -> &str {
    text.char_indices()
        .find(|(_, c)| matches!(c, ':' | '：'))
        .map(|(idx, c)| text[idx + c.len_utf8()..].trim())
        .unwrap_or_else(|| text.trim())
}

fn is_cyrillic(c: char) -> bool {
    let code = c as u32;
    (0x0400..=0x04FF).contains(&code) || (0x0500..=0x052F).contains(&code)
}

fn is_cjk(c: char) -> bool {
    let code = c as u32;
    (0x3400..=0x4DBF).contains(&code)
        || (0x4E00..=0x9FFF).contains(&code)
        || (0xF900..=0xFAFF).contains(&code)
}

fn find_overlapping_index(
    needle: &TextLine,
    haystack: &[TextLine],
    used: &[bool],
) -> Option<usize> {
    let needle_center = needle.bbox.y as f32 + (needle.bbox.h as f32) * 0.5;
    let mut best: Option<(usize, f32)> = None;
    for (idx, candidate) in haystack.iter().enumerate() {
        if used[idx] {
            continue;
        }
        let cand_center = candidate.bbox.y as f32 + (candidate.bbox.h as f32) * 0.5;
        let dy = (needle_center - cand_center).abs();
        if rows_overlap(needle, candidate) {
            match best {
                None => best = Some((idx, dy)),
                Some((_, prev_dy)) if dy < prev_dy => best = Some((idx, dy)),
                _ => {}
            }
        }
    }
    best.map(|(idx, _)| idx)
}

fn rows_overlap(left: &TextLine, right: &TextLine) -> bool {
    let left_center = left.bbox.y as f32 + (left.bbox.h as f32) * 0.5;
    let right_center = right.bbox.y as f32 + (right.bbox.h as f32) * 0.5;
    let tolerance = (left.bbox.h.min(right.bbox.h) as f32) * 0.5;
    (left_center - right_center).abs() <= tolerance
}

fn contains_cyrillic(s: &str) -> bool {
    s.chars().any(is_cyrillic)
}

// ---------------------------------------------------------------------------
// Tests (platform-agnostic logic only — Vision itself can't be unit tested
// here; that's what the spike binary is for).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn line(text: &str, y: i32, h: u32) -> TextLine {
        line_with_confidence(text, y, h, 0.5)
    }

    fn line_with_confidence(text: &str, y: i32, h: u32, confidence: f32) -> TextLine {
        TextLine {
            text: text.to_string(),
            confidence,
            bbox: Rect { x: 0, y, w: 100, h },
        }
    }

    #[test]
    fn contains_cyrillic_detects_russian() {
        assert!(contains_cyrillic("Иди в лес"));
        assert!(contains_cyrillic("mix Иди"));
        assert!(!contains_cyrillic("gg wp"));
        assert!(!contains_cyrillic("推中路"));
    }

    #[test]
    fn merge_prefers_cyrillic_pass_for_russian_rows() {
        let primary = vec![line("MAHBnec9 capwnko", 100, 30)];
        let cyrillic = vec![line("иди в лес я фармлю", 102, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "иди в лес я фармлю");
    }

    #[test]
    fn merge_keeps_reliable_chinese_message_body() {
        let primary = vec![line_with_confidence(
            "［队友］期：等我大招出来再开团，对面火枪没买活",
            100,
            30,
            0.5,
        )];
        let cyrillic = vec![line_with_confidence(
            "DAzJиnеолвшжила, жaхieязя",
            102,
            30,
            0.3,
        )];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(
            merged[0].text,
            "［队友］期：等我大招出来再开团，对面火枪没买活"
        );
    }

    #[test]
    fn merge_keeps_mixed_cjk_message_body() {
        let primary = vec![line("［队友」羽：gank mid 五人抱团", 100, 30)];
        let cyrillic = vec![line("IENEJ basntgank mid ENEД", 102, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "［队友」羽：gank mid 五人抱团");
    }

    #[test]
    fn merge_recovers_short_english_body_when_fallback_is_cleaner() {
        let primary = vec![line("頭粉：99 wP", 100, 30)];
        let cyrillic = vec![line("HЛ: gg wp", 102, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "HЛ: gg wp");
    }

    #[test]
    fn merge_recovers_short_english_body_from_ascii_fallback() {
        let primary = vec![line("頭断：99 wp", 100, 30)];
        let cyrillic = vec![line("#Htr: gg wp", 102, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "#Htr: gg wp");
    }

    #[test]
    fn merge_recovers_russian_from_mixed_script_gibberish() {
        let primary = vec![line("現新：HAHBJeCS中aPM O", 100, 30)];
        let cyrillic = vec![line("ННЫЛ: иди в леся фармлю", 102, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "ННЫЛ: иди в леся фармлю");
    }

    #[test]
    fn merge_does_not_spend_russian_candidate_on_nearby_cjk_row() {
        let primary = vec![
            line("圣水神符", 12, 38),
            line("ННЫЛ: иди в леся фармлю", 20, 35),
        ];
        let cyrillic = vec![line("ННЫЛ: иди в леся фармлю", 20, 35)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].text, "圣水神符");
        assert_eq!(merged[1].text, "ННЫЛ: иди в леся фармлю");
    }

    #[test]
    fn merge_keeps_primary_for_non_cyrillic_rows() {
        let primary = vec![line("gg wp", 100, 30), line("推中路", 200, 30)];
        let cyrillic = vec![]; // ru-RU pass typically returns no rows for non-Cyrillic content
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].text, "gg wp");
        assert_eq!(merged[1].text, "推中路");
    }

    #[test]
    fn merge_surfaces_cyrillic_rows_primary_missed() {
        let primary: Vec<TextLine> = vec![];
        let cyrillic = vec![line("иди в лес", 100, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "иди в лес");
    }

    #[test]
    fn merge_dedupes_overlapping_rows() {
        let primary = vec![line("Иди в лес", 100, 30)]; // primary already got Cyrillic
        let cyrillic = vec![line("Иди в лес", 102, 30)]; // ru-RU pass repeats it
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 1);
    }

    #[test]
    fn merge_sorts_output_by_y() {
        let primary = vec![line("line two", 200, 30)];
        let cyrillic = vec![line("первая строка", 100, 30)];
        let merged = merge_passes(primary, cyrillic);
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].bbox.y, 100);
        assert_eq!(merged[1].bbox.y, 200);
    }
}
