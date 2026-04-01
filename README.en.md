# Lingo | AI In-Game Chat Translation

[简体中文](./README.md) | English | [Русский](./README.ru.md)

[Official site](https://lingo.ink) | [Latest release](https://github.com/tinyhu666/Lingo/releases/latest) | Windows / macOS | MIT

Lingo is an AI-powered in-game chat translation client for Windows and macOS, built for low-friction team communication.

It is not a general-purpose translator. It is a hotkey-first translation workflow built for in-game team communication: press a shortcut, let Lingo copy the current chat line, send it to server-side AI for translation or polishing, and write the result straight back into the input box. You stay in the match. Lingo reduces the switching and interruption around every message.

## Why it fits real matches

- `Low interruption`: hotkey-first flow from copy to translation to fill-back
- `Send-ready output`: optimized for short in-game chat while preserving ability, item, and shot-call terminology
- `Game-aware context`: supports Dota 2, League of Legends, World of Warcraft, Overwatch, and other game scenes
- `Server-side AI`: model routing is managed on backend, so the client needs no API login or manual model setup
- `Desktop-friendly`: built for Windows and macOS, with in-app updates and multilingual UI

## Core capabilities

- Global translation hotkey, default: macOS `⌘+T`, Windows `Alt+T`
- Auto-copy -> translate / rewrite -> auto fill-back into the current input
- `Normal / Pro / Toxic` output styles for different tones and match tempo
- Phrase shortcuts for high-frequency lines
- Multilingual translation, with client UI in Simplified Chinese, English, and Russian

## How it works

1. Select or type text in the game chat box.
2. Press the translation hotkey and Lingo asks backend translation to turn it into something your teammates can understand.
3. The translated line is written back into the current input box so you can send without leaving the game.

For repeated lines, you can also send saved phrase shortcuts directly.

## Requirements

- Node.js 18+
- Rust 1.77+
- Tauri build dependencies

### macOS

- Xcode Command Line Tools
- Grant Accessibility/Automation permissions in System Settings on first run

### Windows

- Visual Studio C++ Build Tools (Desktop development with C++)
- WebView2 Runtime

## Build and Release

```bash
npm run tauri build
```

## Contact

- Website: https://lingo.ink
- Discord: https://discord.gg/cWB49jCfdP
- Email: huruiw@outlook.com

## License

MIT
