# DotA 2 chat samples for Apple Vision OCR spike

Drop real in-game screenshots here. They feed the same `spike-ocr` binary
that proved out synthetic accuracy. We use these to confirm that real
game-font + transparent-panel + busy-backdrop conditions don't degrade
the >95% accuracy seen on synthetic text — that result is what gates
the Rust port (`src-tauri/src/incoming/ocr/macos.rs`).

## File format

- **PNG** (lossless). JPEG kills small text.
- **Native resolution.** No upscale, no compression, no cropping.
  We crop to the chat region in-spike via `--region x,y,w,h`.
- **Default game UI scale.** Custom UI scaling is fine if that's
  actually how you play — just note it in the filename.
- 1080p / 1440p / 4K all welcome. The eval script will report
  accuracy by resolution bucket.

## Naming convention

```
<lang>-<scope>-<short-desc>[-<resolution>].png
```

- `<lang>`: `zh` / `en` / `ru` / `mixed`
- `<scope>`: `team` / `all` / `mixed`
- `<short-desc>`: 1-3 ASCII words, dashes between (e.g. `gank-mid`)
- `<resolution>` optional: `1080p` / `1440p` / `4k`

Examples:
- `zh-team-roshan.png`
- `en-all-gg.png`
- `ru-team-stack-1440p.png`
- `mixed-mixed-teamfight.png`

The production fixture verifier uses the checked-in filenames and crop
coordinates directly, so the current Chinese filenames are retained as a
stable regression corpus.

## What to capture (the useful target: ~10 screenshots)

The goal is *coverage of failure modes*, not bulk volume. Aim for one
each of:

1. **Pure Chinese — short**. e.g. `[队伍] Player: 推中路`.
2. **Pure Chinese — long**. e.g. `[队伍] Player: 等我大招出来再开团，对面火枪没买活`.
3. **Pure English — short**. e.g. `[All] Player: gg wp`.
4. **Pure English — long**. e.g. `[Team] Player: smoke up rosh after their bkb`.
5. **Pure Russian — any length**. e.g. `[All] Player: иди в лес я фармлю`.
6. **Mixed English + Chinese in one line**. e.g. `[队伍] Player: gank mid 五人抱团`.
7. **All-chat (yellow) — at least one** to verify scope-tag color
   handling.
8. **Long player ID with special chars** (`[].ąć` etc.) — names trip
   OCR more than messages do.
9. **Team-fight scene** (chat overlapping heavy VFX / fog of war).
10. **Quiet scene** (chat overlapping fountain or lane — clean
    backdrop, baseline).

If team-fight chat is too rare to capture live, the **replay system**
works: open any saved replay, set 2× speed, screenshot when chat lines
appear.

## How to take screenshots

- **macOS**: `Cmd+Shift+3` for full screen → Desktop, then drag here.
- **Windows**: `Win+PrtScn` for full screen → `Pictures/Screenshots`,
  then drag here.

Either OS is fine — the in-game font is identical and the spike runs
on macOS anyway.

## What we'll do with them

1. Run `npm run verify:ocr-fixtures` from the repository root.
2. The script first runs stable hand crops through the production Rust OCR
   engine and `LineTracker`, then repeats every screenshot with the actual
   Dota 2 region returned by `game_profiles`.
3. It compares hand-crop output with `groundtruth.tsv`, rejects duplicate OCR
   rows from multilingual merging, and requires the production profile to
   emit only the newest chat line while filtering HUD and empty scenes.

The command requires `ffmpeg`, Rust, and a supported native OCR platform
(macOS or Windows). Nicknames are recorded for context but are not asserted:
the stylized game font makes them unreliable, while the translated message
body is the product-critical output.

## Privacy note

Player nicknames in DotA 2 are public, so screenshots are safe to
share. If you'd rather not commit a particular shot, drop it in
`samples/dota2/private/` — that subdir is already gitignored.
