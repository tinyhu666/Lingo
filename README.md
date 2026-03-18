# Lingo - 游戏内的嘴替

简体中文 | [English](./README.en.md) | [Русский](./README.ru.md)

Lingo 是一个基于 AI 大模型的游戏内聊天翻译客户端，但它更像你在游戏里的嘴替。

你只管表达想法，Lingo 负责在关键时刻把你的话更快、更准地翻译出来，并自动送回聊天框。通过全局快捷键，客户端可以一气呵成地完成复制、翻译与回填，让你在对局里少切换、少停顿、少卡壳。

- 一键把你想说的话变成队友看得懂的话
- 支持全局快捷键：自动复制 -> 翻译 -> 自动粘贴
- 保留常用语快捷发送与多语言互译能力
- 翻译由服务端统一提供，客户端无需登录或填写模型 API 参数
- 支持 Windows / macOS
- 客户端语言支持简体中文、英语、俄语

## 为什么说 Lingo 是游戏内的嘴替

- 不用切出游戏去找翻译器
- 不用反复手动复制、粘贴、改句子
- 不用在高压对局里临时组织外语表达
- 想说的话能更快落到聊天框里，沟通不断，节奏不乱

## 使用流程

1. 在游戏聊天框中选中或输入文本。
2. 按翻译快捷键（默认：macOS `⌘+T`，Windows `Alt+T`）。
3. Lingo 自动读取剪贴板内容，完成翻译，并把结果回填到当前输入框。
4. 如果是高频表达，也可以直接用常用语快捷发送。

## 环境要求

- Node.js 18+
- Rust 1.77+
- Tauri 构建依赖

### macOS

- Xcode Command Line Tools
- 首次运行请在系统设置中授予辅助功能/自动化权限

### Windows

- Visual Studio C++ Build Tools（Desktop development with C++）
- WebView2 Runtime

## 打包发布

```bash
npm run tauri build
```

## 联系方式

- Discord: https://discord.gg/cWB49jCfdP
- 邮箱: huruiw@outlook.com

## 许可证

MIT
