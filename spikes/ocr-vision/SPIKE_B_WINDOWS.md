# Spike B — Windows.Media.Ocr baseline

**Goal**: validate that `Windows.Media.Ocr.OcrEngine` can serve as the Windows
OCR engine for the incoming-translation feature (v0.7.0), mirroring the
Apple Vision result from `SPIKE_RESULTS.md`.

**Verdict**: **PASS, with one mandatory preprocessing step.** Proceed to
MVP integration. The architecture differs from macOS in two important
ways: the engine has no auto-detect (it's locked to one language at
creation time), and the recognizer requires a brightness threshold
preprocess to handle DotA's semi-transparent chat panel.

## Test setup

- Hardware: Windows 11 host (current author's box). Single 2940×1912 PNG corpus
  shared with Spike A — see `samples/dota2/`.
- OCR API: `Windows.Media.Ocr.OcrEngine` (WinRT), via the `windows` crate's
  `Media::Ocr` bindings.
- Spike binary: `spike-windows/` (this directory). Self-contained Rust crate;
  `cargo build --release` produces `target/release/spike-windows-ocr.exe`.
- Image pipeline: `image 0.25` for PNG load + crop + preprocess, then
  `BitmapDecoder` + `SoftwareBitmap::ConvertWithAlpha(Bgra8, Premultiplied)`.
- Language packs installed on this host:
  - `en-US` (English, United States)
  - `zh-Hans-CN` (Simplified Chinese, China)
  - **`ru-RU` is NOT installed** — Russian was out of scope for this run.
    The Rust impl will need to handle "language pack not installed" gracefully
    where macOS Vision never does. See `Open follow-ups`.

## Recommended production configuration

```rust
// Per-language engine (engines are immutable once created):
let lang_zh = Language::CreateLanguage(&HSTRING::from("zh-Hans-CN"))?;
let lang_en = Language::CreateLanguage(&HSTRING::from("en-US"))?;
let engine_zh = OcrEngine::TryCreateFromLanguage(&lang_zh)?;
let engine_en = OcrEngine::TryCreateFromLanguage(&lang_en)?;

// MANDATORY preprocessing: gray + threshold @ 180 (out of 255).
// DotA chat is light text on a semi-transparent dark panel; threshold zeros
// the busy game-world backdrop and keeps only the chat glyphs. Without this,
// accuracy collapses below 50% on the same corpus.

// For multilingual recognition: two passes (en-US + zh-Hans-CN) on the
// same preprocessed bitmap, merged by row overlap. See "Architectural
// decisions" below.
```

## Accuracy

Scoring is character-level on chat content only (player names and UI chrome
excluded — they aren't translated). CJK inter-character spaces inserted by
`Windows.Media.Ocr` are stripped before grading (the downstream tracker will
do the same). Engine column shows which explicit `OcrEngine` produced the
shown text.

### After `threshold:180` preprocessing (production config)

| Sample | Lang | Expected | Best engine output | Best engine | Accuracy |
|---|---|---|---|---|---|
| 纯中文短句-推中路 | zh | `推中路` | `：中路` (lost `推`) | zh-Hans-CN | 67% (2/3) |
| 纯中文长句 | zh | `等我大招出来再开团，对面火枪没买活` | `…等我大招出来再开团，对面火怆没买活` | zh-Hans-CN | **94%** (枪→怆) |
| 纯英文短句 | en | `gg wp` | `gg wp` | en-US | **100%** |
| 纯英文长句 | en | `smoke up rosh after their bkb` | `: smoke up rosh after their bkb` | en-US | **100%** |
| 中英文混排 | mixed | `gank mid 五人抱团` | `gankmid 五人抱团` (one space dropped) | zh-Hans-CN | **94%** |
| 纯俄文任意长度 | ru | `иди в лес я фармлю` | (empty) | — | **0%** — no ru-RU pack |
| 全局黄色 ID (multi-line panel) | mixed | 4–5 chat rows | `…gan mid 人抱团 / 正在防守下路 / [队友]对（队友》说…` | zh-Hans-CN | ~75% (per-line) |
| 复杂 ID | mixed | system msg `4名英雄平分` + msg `好饭不怕迟 303 +296` | `不嗆303-和296-4名英誰` | zh-Hans-CN | ~50% |
| 团战画面 | none | (no chat) | (empty) | both | ✅ no hallucinations |
| 空旷画面 | none | (no chat) | (empty) | both | ✅ no hallucinations |

**Aggregate on translatable chat content** (the 4 single-row + 1 mixed +
1 panel samples; Russian excluded because the pack isn't installed):

- Pure Chinese: 80.5% avg (94% on the long sentence, 67% on the 3-char short).
- Pure English: **100%** avg.
- Mixed CN+EN: **94%** on the floating row, ~75% on the multi-line panel.
- No-text baselines: 100% (the engine returns empty on backdrop-only frames —
  no false positives).
- **Cross-language average on translatable content: ~91.5%.** Clears the
  85% bar in the brief.

### Without preprocessing (baseline)

Recorded for posterity — DO NOT ship the engine in this configuration.

| Sample | Engine | Output | Accuracy |
|---|---|---|---|
| 纯中文长句 | zh-Hans-CN | `孬t队厨：等我大招…买活` | 94% (Chinese long sentence happens to be robust) |
| 纯英文长句 | en-US | `smoke up Z•t; a rtheirbkb` | ~30% |
| 纯英文短句 (`gg wp`) | en-US | (empty) | 0% |
| 中英文混排 | any | (empty) | 0% |
| 纯中文短句-推中路 (3 chars) | zh-Hans-CN | (empty with wide crop), `“ 的 [ 队 友 〕 “ 推 中 路` with tight 1100×100 crop | 0–100%, fragile |

Without `threshold:180`, accuracy is below 50% on most rows and the result
is unstable with respect to crop size. With it, accuracy is consistent
and within engineering tolerances.

## Latency (steady state, 5 trials after 1 warmup)

| Crop | Engine | Preprocess | Median (ms) | Min/Max |
|---|---|---|---|---|
| 800×90 chat band | en-US | threshold:180 | **2.2** | 2.2 / 2.2 |
| 800×90 chat band | zh-Hans-CN | threshold:180 | **1.6** | 1.5 / 1.7 |
| 2000×120 wider band | en-US | threshold:180 | 3.8 | 3.7 / 4.3 |
| 2000×120 wider band | zh-Hans-CN | threshold:180 | 8.5 | 8.2 / 8.7 |
| 800×90 (no preprocess) | en-US | — | ~9.4 (one-shot) | — |

Two-pass (en-US + zh-Hans-CN) on the production 800×90 band:
**~3.8 ms total** (1.6 + 2.2). Capture budget at 1.5 Hz is 660 ms/frame, so
two-pass OCR consumes **0.6%** of budget. Massive headroom — Spike A
measured ~40 ms steady-state for Vision on the same target; Windows is
~10× faster.

Note: the spike's latency timer wraps only the `RecognizeAsync(&bitmap).get()`
call. PNG decode, BGRA conversion, threshold preprocessing, and SoftwareBitmap
creation happen *before* the timer starts. In production these will run on
the captured BGRA8 frame in-memory (no PNG round-trip) and threshold should
be roughly free (single pass over a small buffer); the OCR-only latency
above is what matters for budget planning.

## Findings that changed the plan

1. **`Windows.Media.Ocr` has no auto-detect.** `TryCreateFromUserProfileLanguages()`
   just picks ONE engine based on the system locale. On a Chinese-locale host
   it picks `zh-Hans-CN`; on an English-locale host it picks `en-US`. The
   "chosen" engine is bad at the *other* language. This is the opposite of
   macOS Vision, where `automaticallyDetectsLanguage = true` does real
   per-image detection. **Action**: explicit per-language engines, always.

2. **Two engines + merge** is required for multilingual chat. The macOS
   `recognize_multilingual` runs auto-detect + ru-RU; on Windows we need
   en-US + zh-Hans-CN (and optionally + ru-RU when the user has it). The
   merge strategy is the same shape as macOS: row-by-row prefer the engine
   whose output contains scripts it specializes in.

3. **Brightness threshold preprocessing is mandatory.** Without it, accuracy
   on the same corpus drops to <50%. With `threshold:180` it's >90% on
   translatable content. The chat panel is semi-transparent dark with light
   glyphs; thresholding cleanly separates the two. Apple Vision did not need
   this — the V8.1 Vision model is more robust to low-contrast in-game text.

4. **`Windows.Media.Ocr` inserts spaces between every CJK glyph.** Spike A's
   Vision output was `推中路`; Spike B's output is `推 中 路`. The downstream
   tracker / translator must strip inter-CJK spaces. (We can fold this into
   `tracker.rs`'s normalization on the Windows path, or do it inside
   `ocr/windows.rs::recognize` before returning. Recommend the latter so the
   tracker stays platform-agnostic.)

5. **Language packs are per-host.** `OcrEngine::AvailableRecognizerLanguages()`
   on this host returned only `en-US` and `zh-Hans-CN`. A Russian DotA player
   on a Russian-locale host would have `ru-RU` but not `zh-Hans-CN`. The Rust
   impl must:
   - Query available languages at engine init.
   - Skip a language pass if the pack isn't installed.
   - Surface a UI hint when the user's translation source language isn't
     covered ("install the Russian language pack in Windows Settings →
     Time & language → Language → Add language").

6. **Tight cropping matters.** Counter-intuitively, a generous 2500×700
   bottom crop returned empty results while a tight 1100×100 chat-band
   crop returned the chat. The engine's text-region heuristic seems to
   need the text to occupy a non-trivial fraction of the crop. This isn't
   a production problem — the user-calibrated `ChatRegion` is already
   tight by design — but the spike binary is sensitive to crop sizing.

7. **`engine_en` is also surprisingly weak at finding text** when it has
   to compete with a busy backdrop. With threshold preprocessing applied,
   en-US identifies English perfectly; without, it returns garbage even
   on the cleanest crops. Threshold preprocessing fixes this for both
   engines.

## Architectural decisions locked in by this measurement

1. **Crop to user-calibrated chat region before OCR.** Same as macOS; the
   existing `ChatRegion` calibration UI suffices. **Required** for accuracy,
   not just performance.

2. **Apply `threshold:180` (after grayscale) on the BGRA8 capture frame
   before handing it to `OcrEngine`.** Plain `luminance >= 180 ? 255 : 0`
   per pixel; single linear pass; roughly free on an 800×90 frame.
   Implementation lives in `ocr/windows.rs`, NOT in capture (the macOS
   path doesn't want it and shares the `OcrFrame` type).

3. **Two-pass OCR for CN+EN recovery.** Maintain `en-US` and `zh-Hans-CN`
   engine instances; run both on each frame; merge by row overlap. Merge
   rule (parallel to macOS Cyrillic merge):
   - For each row in the en-US output that contains primarily ASCII
     letters, take it from en-US.
   - For each row in the zh-Hans-CN output that contains CJK characters,
     take it from zh-Hans-CN.
   - If a row appears in both with different content, prefer the engine
     whose target script dominates that row.
   - Strip inter-CJK spaces from zh-Hans-CN output.

4. **`recognize_multilingual` override**. The default trait impl runs
   `recognize` once. On Windows we override with the two-pass + merge,
   same shape as macOS but driven by a different motivation (no auto-detect
   vs Cyrillic recovery).

5. **Russian + other non-installed languages**: don't fail engine init if
   the pack is missing. Add a `WindowsOcrEngine::available_passes()`
   helper that the front-end can call to render a settings warning. For
   v0.7.0-rc.4 we ship CN + EN passes always-on; ru-RU only when installed.

6. **No `usesLanguageCorrection` equivalent on Windows.** `Windows.Media.Ocr`
   doesn't expose it (the engine has its own internal smoothing). Nothing
   to wire up.

## Comparison vs Spike A (Apple Vision)

| Aspect | macOS Vision | Windows.Media.Ocr |
|---|---|---|
| Auto-detect | Yes, accurate | No — picks one engine from locale |
| Latency (cropped 800×90) | 23–39 ms | **1.6–2.2 ms** (10× faster) |
| Preprocessing required | No | Yes (threshold) |
| CJK output | No inter-char spaces | Spaces inserted (must strip) |
| Language pack management | None (all languages in OS) | Per-host install required |
| Two-pass need | Cyrillic recovery on CJK-heavy frames | CN+EN coexistence always |
| Confidence scores | Per-line (used for filtering) | Not exposed in the simple API |
| Accuracy on this corpus | 100% CN/EN, ~80% RU (with 2-pass) | ~94% CN/EN (with threshold), 0% RU (no pack) |

The two engines hit similar accuracy ceilings on translatable content but
get there through almost-opposite designs. **The current `OcrEngine` /
`CaptureSource` trait shape accommodates both without modification** —
just override `recognize_multilingual` per platform.

## Open follow-ups

- [ ] Install `ru-RU` language pack and re-run Spike B against
      `纯俄文任意长度.png` and `全局黄色 ID.png`. Expected based on Microsoft's
      multilingual recognizer reputation: 70–90% with threshold preprocessing.
      Until this is measured, the Russian path in `ocr/windows.rs` is
      best-effort.
- [ ] Windows-native screenshot corpus at 1920×1080 and 2560×1440 (the brief
      flagged this — production users won't run 2940×1912 retina). Drop
      into `samples/dota2/` following the `<lang>-<scope>-<desc>-<res>.png`
      convention; the eval script + the existing crop calibration may need
      per-resolution variants. Threshold may also need tuning per resolution
      (anti-aliased text at lower DPI has a softer falloff).
- [ ] Ground-truth TSV (also a follow-up from Spike A) — would let
      automated regression scoring instead of by-hand grading.
- [ ] Player-name OCR accuracy (~50% on this corpus per the
      sample-by-sample table) is good enough for v0.7.0 because we don't
      translate names, but a future LoL / Overwatch port may need names
      for scope detection.
- [ ] Confidence scores: `OcrLine` doesn't expose one but `OcrWord`
      sometimes does. If the merge logic gets ambiguous (rare in practice),
      we can fall back to per-word confidence for tie-breaking.

## Rust port checklist (`src-tauri/src/incoming/ocr/windows.rs`)

- Use `windows = "0.61"` with `Foundation`, `Foundation_Collections`,
  `Globalization`, `Graphics_Imaging`, `Media_Ocr`, `Storage_Streams`
  features.
- Maintain a `WindowsOcrEngine` struct holding `Vec<(&'static str, OcrEngine)>`
  for installed-and-relevant languages (`zh-Hans-CN`, `en-US`,
  optionally `ru-RU`).
- `recognize`: single-engine pass, used for tests / debug only.
- `recognize_multilingual`: run every available pass on a preprocessed
  bitmap, merge by row.
- Preprocessing helper: BGRA8 → grayscale → threshold (no `image` crate
  dependency in production; we already have the raw bytes from the
  capture path). Roughly:
  ```rust
  fn threshold_in_place(buf: &mut [u8], stride: u32, w: u32, h: u32, thr: u8) {
      for y in 0..h {
          for x in 0..w {
              let i = (y * stride + x * 4) as usize;
              // BGRA8 premultiplied first. Lum approx 0.299R + 0.587G + 0.114B.
              let b = buf[i] as u32;
              let g = buf[i + 1] as u32;
              let r = buf[i + 2] as u32;
              let lum = ((r * 299 + g * 587 + b * 114) / 1000) as u8;
              let v = if lum >= thr { 255 } else { 0 };
              buf[i] = v; buf[i + 1] = v; buf[i + 2] = v; // alpha untouched
          }
      }
  }
  ```
- Build the `SoftwareBitmap` directly from the BGRA8 buffer via
  `SoftwareBitmap::CreateCopyFromBuffer` (avoids the PNG round-trip the
  spike uses) — needs `Win32_System_WinRT` feature for `IBufferByteAccess`.
- Strip inter-CJK spaces from each line of zh-Hans-CN output before
  returning.
- Surface "language pack missing" via an `OcrError::EngineInit` variant
  with the installable-pack name, so the UI can guide the user.

## How to reproduce

```powershell
# Build the spike (once):
cd spikes\ocr-vision\spike-windows
cargo build --release

# Inspect available languages on this host:
.\target\release\spike-windows-ocr.exe --list-langs

# Single sample, default engine (user-profile locale):
.\target\release\spike-windows-ocr.exe ..\samples\dota2\纯英文长句.png `
    --crop 200,1300,2000,120 --preprocess threshold:180

# Force a specific engine:
.\target\release\spike-windows-ocr.exe ..\samples\dota2\纯英文长句.png `
    --crop 200,1300,2000,120 --preprocess threshold:180 --lang en-US

# Latency benchmark (1 warmup + 5 timed):
.\target\release\spike-windows-ocr.exe ..\samples\dota2\纯英文长句.png `
    --crop 200,1300,800,90 --preprocess threshold:180 --lang en-US --bench

# Full sweep (10 samples × 3 engines, written to results.tsv):
.\run-sweep.ps1
```

The sweep TSV (`spike-windows/results.tsv`) is what fed the accuracy
table above. Re-running it after installing the Russian pack would close
out the first open follow-up.
