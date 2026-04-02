# Vision Model Evaluation

This document defines the evaluation workflow for incoming teammate chat recognition.

It is currently written for the Dota 2 incoming-chat pipeline, but the same flow can be reused for future games by changing `--game-scene` and the screenshot set.

## Goals

- Compare multiple vision models against the same chat screenshot set.
- Measure both recognition quality and end-to-end latency.
- Keep translation in `usage=inbound_read` mode so the evaluation matches production behavior.
- Restore the original backend `vision_lane` configuration after the comparison run.

## Recommended Screenshot Set

Build a screenshot directory with real in-match chat samples that cover:

- `[队友]` and other channel prefixes
- portraits or hero icons at the left edge
- mixed languages in the same chat window
- slang, profanity, abbreviations, repeated words
- short tactical lines such as `help me`, `follow me`, `ward`, `smoke`
- screenshots with annotations or visual noise
- multiple visible rows in one frame
- different HUD scale or resolution when possible

Suggested directory:

```text
server/translate-proxy/samples/dota2-chat/
```

## Compare Script

Use the compare script to run one or more models against a directory of screenshots:

```bash
npm run proxy:vision-compare -- --dir=./server/translate-proxy/samples/dota2-chat --preset=siliconflow-dota2 --expected=./server/translate-proxy/samples/dota2-chat/thread-2026-04-02-golden.json --game-scene=dota2 --target-language=zh --output-md=./server/translate-proxy/reports/dota2-vision-compare.md --output-json=./server/translate-proxy/reports/dota2-vision-compare.json
```

If your backend does not already export `ADMIN_TOKEN`, add:

```bash
--admin-token=YOUR_ADMIN_TOKEN
```

If your backend does not already export the client key expected by `/translate` and `/vision/chat-lines`, add:

```bash
--token=YOUR_PUBLIC_KEY
```

## Presets

The compare script supports these presets today:

- `siliconflow-default`
- `siliconflow-dota2`

Current preset contents:

- `deepseek-ai/DeepSeek-OCR`
- `PaddlePaddle/PaddleOCR-VL-1.5`
- `PaddlePaddle/PaddleOCR-VL`
- `Qwen/Qwen3-VL-8B-Instruct`

You can still override the list explicitly with:

```bash
--models=modelA,modelB,modelC
```

Explicit `--models` takes priority over `--preset`.

## Output

The compare script prints a Markdown report to stdout and can also write:

- `--output-md=...`
- `--output-json=...`

The report includes:

- total recognized lines
- total non-system lines
- average confidence
- average vision latency
- average inbound translation latency
- average text match rate against the golden set
- average translation match rate against the golden set
- average speaker match rate against the golden set
- per-image extracted rows
- per-line inbound translation results

## Golden Sample File

The current hand-reviewed golden set for the April 2, 2026 Dota 2 screenshots lives at:

```text
server/translate-proxy/samples/dota2-chat/thread-2026-04-02-golden.json
```

Recommended file naming when those screenshots are saved locally:

- `01-pakulor-remake.png`
- `02-omni-ty.png`
- `03-putang-ina-report-medusa.png`
- `04-mga-bobo-mid.png`
- `05-swap-commend-just-end.png`
- `06-buhat-na-buhat-sf.png`
- `07-smoke-kayo-sa-bot.png`
- `08-let-tri-ward-invoker-spammer.png`

## How To Choose The Default Model

For the Dota 2 incoming-chat use case, prioritize in this order:

1. Correct row extraction
2. Correct speaker and channel separation
3. Stable recognition of slang, profanity, and misspellings
4. Low enough latency for in-match use

Practical rule:

- If one OCR-oriented model clearly reads rows better, prefer it as the default `vision_lane.model_name`.
- If OCR quality is strong but speaker/channel parsing is weak, keep the OCR model as primary and improve server-side post-processing before switching to a general VLM.
- Only trade accuracy for latency when the recognition delta is small.

## Follow-Up After Evaluation

After picking the winner:

1. Update `server/translate-proxy/runtime-config.example.json`
2. Update the production runtime config `vision_lane.model_name`
3. Re-run one directory smoke test with the selected model
4. Keep the screenshot directory as a regression set for future game support
