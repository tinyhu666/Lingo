# Lingo | AI 游戏内聊天翻译

简体中文 | [English](./README.en.md) | [Русский](./README.ru.md)

[官网](https://lingo.ink) | [下载最新版](https://github.com/tinyhu666/Lingo/releases/latest) | Windows / macOS | MIT

Lingo 是一款面向 Windows 和 macOS 的 AI 游戏内聊天翻译客户端，专门为低打断、低切换成本的队伍沟通而做。

它不是泛用翻译器，而是一套面向游戏内团队沟通的 hotkey-first 翻译工作流：按下快捷键，Lingo 会自动复制当前聊天内容、调用服务端 AI 完成翻译或润色，再把结果直接写回输入框。你继续专注对局，Lingo 负责把整条沟通链路压缩到更少的切换和停顿。

## 为什么它更适合游戏场景

- `低打断沟通`：hotkey-first，一次完成复制、翻译、回填
- `更像能直接发出去的话`：围绕游戏内短句沟通优化，尽量保留技能、装备和指挥术语
- `更贴近具体游戏语境`：支持 Dota 2、英雄联盟、魔兽世界、守望先锋等游戏场景选择
- `开箱即用`：模型和路由由服务端统一维护，客户端不用登录，也不用配置模型 API
- `桌面端友好`：支持 Windows / macOS，提供应用内更新与简体中文、英语、俄语界面

## 核心能力

- 全局快捷键触发翻译，默认：macOS `⌘+T`，Windows `Alt+T`
- 自动复制 -> 翻译 / 润色 -> 自动回填当前输入框
- `Normal / Pro / Toxic` 三种翻译风格，适配不同语气与对局节奏
- 常用语快捷发送，适合高频沟通
- 支持中英俄等主流语言互译，客户端 UI 支持简体中文、英语、俄语

## 三步完成一次游戏内沟通

1. 在游戏聊天框中选中或输入文本。
2. 按翻译快捷键，Lingo 调用服务端翻译把意思换成队友看得懂的话。
3. 译文自动写回当前输入框，你几乎不用切出游戏就能直接发送。

如果是高频表达，也可以直接用常用语快捷发送。

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

- 网站: https://lingo.ink
- Discord: https://discord.gg/cWB49jCfdP
- 邮箱: huruiw@outlook.com

## 许可证

MIT
