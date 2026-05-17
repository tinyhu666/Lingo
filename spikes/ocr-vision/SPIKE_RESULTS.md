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

## Open questions for real-game validation

We tested HelveticaNeue-Bold on synthetic dark panels. Real DotA 2 uses a
custom Radiance variant on a partially-transparent in-game background that
can overlap with terrain/units. Need to re-run on actual game screenshots
before locking in the architecture.

- [ ] Real DotA 2 chat screenshots (Chinese / English / Russian, 10 each)
- [ ] LoL chat screenshots (font is different again)
- [ ] Overwatch screenshots (text overlays unit world)

If accuracy holds within ~5% of these synthetic results on real game UI, the
Rust port can begin.

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
