# Lingo - Your In-Game Voice

[简体中文](./README.md) | English | [Русский](./README.ru.md)

Lingo is an AI-powered in-game chat translation client, but it works more like your in-game voice.

You focus on what you want to say. Lingo helps you say it faster, more clearly, and in a language your teammates can understand, then drops it right back into the chat box. With a single global hotkey, it handles the whole flow from copy to translation to paste-back.

- Turn what you want to say into something your teammates can understand
- Supports global hotkeys: auto-copy -> translate -> auto-paste
- Includes phrase shortcuts and multilingual translation capabilities
- Translation is provided by a centralized backend; no client-side model API login or parameter setup needed
- Supports Windows / macOS
- Client UI language supports Simplified Chinese, English, and Russian

## Why Lingo feels like your in-game voice

- No alt-tabbing to a separate translator
- No repeated manual copy, paste, and sentence cleanup
- No scrambling to phrase things in another language mid-match
- Your message lands in the chat box faster, without breaking momentum

## Workflow

1. Select or type text in the game chat box.
2. Press the translation hotkey (default: macOS `⌘+T`, Windows `Alt+T`).
3. Lingo reads the clipboard, translates the text, and pastes it back into the current input box.
4. For repeated lines, you can also send saved phrase shortcuts directly.

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

- Discord: https://discord.gg/cWB49jCfdP
- Email: huruiw@outlook.com

## License

MIT
