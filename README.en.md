# Lingo - In-Game Chat Translation Client

[简体中文](./README.md) | English | [Русский](./README.ru.md)

Lingo is an in-game chat translation client powered by AI models, built for real-time communication across multiple game scenarios. It uses a global hotkey workflow to automatically copy, translate, and paste back text.

- Supports Windows / macOS
- Client UI language supports Simplified Chinese, English, and Russian
- Supports global hotkeys: auto-copy -> translate -> auto-paste
- Translation is provided by a centralized backend; no client-side model API login or parameter setup needed
- Includes phrase shortcuts and multilingual translation capabilities

## Workflow

1. Select or type text in the game chat box.
2. Press the translation hotkey (default: macOS `⌘+T`, Windows `Alt+T`).
3. Lingo reads clipboard content and pastes the translated result back automatically.

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
