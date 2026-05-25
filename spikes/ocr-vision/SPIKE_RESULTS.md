# Spike A — Apple Vision OCR baseline

**Goal**: validate that Apple Vision can serve as the macOS OCR engine for
the incoming-translation feature (v0.7.0).

**Verdict**: **PASS** — proceed to MVP integration with the configuration
below.

## Test setup

- Hardware: Apple Silicon (current host)
- Vision request: `VNRecognizeTextRequest`
- Image: 720x292 synthetic chat panel mimicking DotA 2 visual style
  - 10 lines, mixed Chinese / English / Russian
  - HelveticaNeue-Bold (close enough to game-UI bold sans-serif)
  - Dark semi-transparent background with vignette
- Source: `spike.swift` (compiled standalone Swift CLI)

## Recommended production configuration

```swift
request.recognitionLevel = .accurate
request.automaticallyDetectsLanguage = true     // <-- KEY
request.usesLanguageCorrection = false           // game slang/abbreviations
request.recognitionLanguages = []                // empty when auto-detect on
```

## Accuracy

| Language | Lines | Correct (text content) | Notes |
|---|---|---|---|
| Chinese (zh-Hans) | 2 | 2/2 (100%) | `我们去打肉山`, `支援下路 def t2 now` perfect |
| English | 6 | 6/6 (100%) | All complete, including 8+ word sentences |
| Russian (long) | 1 | 1/1 (100%) | `Иди в лес, я фармлю` perfect under auto-detect |
| Russian (short ≤5 chars) | 1 | 0/1 | `стрим` failed — too little context |

**Player names**: 100% (5/5) under auto-detect. Pre-detection mode mis-read
`AntiMage→Antilage` and `Juggernaut→vuggernaut` due to bold-font M/J/v
ambiguity — auto-detect fixed both.

**Scope tags (`[全部]` / `[队伍]`)**: garbled under auto-detect (~30%
correct). Acceptable because:
- They are UI chrome, not part of the translatable content.
- Position-based detection (always at line start) is a reliable proxy.
- A second narrow-region OCR pass with `recognitionLanguages = ["zh-Hans"]`
  could recover them if needed.

## Latency (steady state, 5 trials)

| Phase | ms |
|---|---|
| First call (engine warmup) | 379 |
| 2nd call onwards | 81, 83, 86, 89, 92 |
| Mean steady-state | **~86 ms** |

Capture budget at 1.5 Hz = 660 ms/frame → OCR is **13%** of budget. Plenty of
headroom for team-fight bursts up to 3 Hz.

## Findings that changed the plan

1. **Explicit `recognitionLanguages = ["zh-Hans", "en-US", "ru-RU"]` is
   worse than auto-detect** when input is multilingual per-line. Forcing the
   full priority list biases recognition toward the first-listed script and
   destroys Cyrillic accuracy. Counter-intuitive. Original plan was to pass
   explicit languages from user settings — drop this.

2. **Short Cyrillic/Greek words may fail** when ≤5 chars and no surrounding
   context. Acceptable; the product priority is full sentences.

3. **Upscaling makes things worse**, not better. Vision is already trained
   for the source resolution; 2× resize splits one logical line into
   multiple OCR observations.

4. **`usesLanguageCorrection = true` had zero effect** on this corpus.
   Don't bother turning it on.

## Real-game validation (2026-05)

Ran the spike against 10 real DotA 2 screenshots at 2940×1912 (covered
zh/en/ru, scope = team/all, busy + quiet backgrounds, long player IDs).
See `samples/dota2/` for the corpus. Key findings that drove the Rust
port design:

| Category | Accuracy (real game) | Notes |
|---|---|---|
| Chinese message body | 100% | `推中路`, `等我大招出来再开团，对面火枪没买活` ← perfect |
| English message body | 100% | `gg wp`, `smoke up rosh after their bkb` ← perfect |
| Mixed CN + EN | ~100% | Lost a space token only |
| Russian, full-screen auto-detect | **0%** | `Иди в лес я фармлю` → `MAHBJIeC9 中aPMJIO` |
| Russian, cropped + `["ru-RU"]` | ~80% | `иди влеся фармлю` (missing one space) |
| Player nickname (heavy art font) | ~30% | `萌新` → `期新 / 羽新 / 頭新`. **Doesn't matter** — we don't translate the name. |
| `[队友]` scope tag | varies | Strippable in the line tracker by position. |
| Steam IDs / system messages | 100% | Clean signal. |

Latency on 2940×1912 full-screen: 125–200 ms steady-state.
Latency on cropped 800×90 chat band: **23–39 ms**. We crop in
production, so the steady budget is ~40 ms per pass.

### Architectural decisions locked in by this measurement

1. **Crop to the user-calibrated chat region before OCR.** Justified by
   both accuracy (Russian recovery) and latency (5× faster). The
   `incoming::region::ChatRegion` calibration UI already exists for
   this.

2. **Two-pass OCR for Cyrillic recovery.** Auto-detect on a CJK-heavy
   image silently mangles Cyrillic; explicit `["ru-RU"]` on the same
   image recovers ~80% accuracy. Single-pass would lose Russian users
   entirely. Implemented as `OcrEngine::recognize_multilingual` —
   default impl falls back to a single `recognize` call so non-macOS
   engines opt in only when they have something to add.

3. **`automaticallyDetectsLanguage = true` for the primary pass.** The
   spike originally suggested explicit language list, but on real
   game UI auto-detect handled CN/EN/mixed cleanly. The Cyrillic gap
   is filled by the second pass.

4. **`usesLanguageCorrection = false`.** Game slang (`gg`, `wp`,
   `bkb`, `roshan`) is precisely what language correction kills.

The Rust port lives at `src-tauri/src/incoming/ocr/macos.rs`.

## Open follow-ups

- [ ] Ground-truth TSV for the 10-image corpus so a regression script
      can fail CI when an engine update degrades accuracy.
- [ ] LoL chat screenshots (font is different).
- [ ] Overwatch / WoW screenshots (text overlays game world directly).
- [x] Spike B: Windows.Media.Ocr equivalent on the same corpus, once a
      Windows test box is available. → see `SPIKE_B_WINDOWS.md`.
      TL;DR: ~92% accuracy on CN/EN/mixed with threshold:180 preprocessing,
      1.6–8.5 ms latency (10× faster than Vision), but no auto-detect (needs
      explicit two-pass with en-US + zh-Hans-CN engines).

## Rust port checklist

Once green-lit, port `spike.swift` to `src-tauri/src/incoming/ocr/macos.rs`:

- Use `objc2 = "0.6"` + `objc2-vision` + `objc2-foundation`
- Wrap in an `OcrEngine` trait so Windows can drop in a parallel impl
- Inputs: `&CGImage` + `OcrOptions { auto_lang, recognition_level }`
- Output: `Vec<TextLine { text, confidence, bbox }>`
- Reuse the same `VNRecognizeTextRequest` instance across frames (saves
  ~5 ms per call vs constructing per-frame)
- Run on a dedicated tokio task with a bounded channel; never block the
  capture thread

## How to reproduce

```sh
cd spikes/ocr-vision
swiftc spike.swift -O -o spike-ocr -framework Vision -framework AppKit
swiftc gen-synthetic.swift -O -o gen-synthetic -framework AppKit
./gen-synthetic synthetic-chat.png
./spike-ocr --warmup 3 --auto-lang synthetic-chat.png
```

For real screenshots:

```sh
./spike-ocr --warmup 3 --auto-lang real-dota-screenshot.png
./spike-ocr --warmup 3 --auto-lang --region 60,800,900,260 full-screen.png
./spike-ocr --warmup 3 --auto-lang --json image.png  # for scripted eval
```
