# Lingo - 游戏内聊天翻译客户端

Lingo 是一个基于 AI 大模型的游戏内聊天翻译客户端，面向多游戏场景的实时沟通。客户端通过全局快捷键触发翻译流程，自动完成复制、翻译与回填。

- 支持 Windows / macOS
- 支持全局快捷键：自动复制 -> 翻译 -> 自动粘贴
- 翻译由服务端统一提供，客户端无需登录或填写模型 API 参数
- 保留常用语快捷发送与多语言互译能力

## 使用流程

1. 在游戏聊天框中选中或输入文本。
2. 按翻译快捷键（默认：macOS `⌘+T`，Windows `Alt+T`）。
3. Lingo 自动读取剪贴板内容并回填翻译结果。

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

发布前请先更新 [CHANGELOG.md](./CHANGELOG.md) 对应版本分节，保持日志简练、分组清晰（新增/优化/修复），不要添加“版本升级到 x.y.z”这类占位条目。

## 许可证

MIT
