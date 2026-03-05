# Lingo - 游戏内聊天翻译客户端

Lingo 是一个基于 AI 大模型的游戏内聊天翻译工具，面向多语言沟通场景。当前版本已针对常见游戏对话语气和术语表达做了优化，并将持续扩展更多游戏场景与术语库。输入聊天内容后，只需要按下快捷键，即可自动完成翻译，并将翻译后的文本回填到对话窗口中，点击后即可发送。

- 支持 Windows / macOS
- 支持全局快捷键。自动复制 -> 翻译 -> 自动粘贴
- 支持填写多家模型 API（OpenAI / DeepSeek / Qwen / Moonshot / SiliconFlow / Anthropic / 自定义）
- 支持在设置中切换不同模型厂商

## 功能说明

1. 在游戏聊天框中选中或输入要翻译的文本。
2. 按下翻译快捷键（默认：macOS `⌘+T`，Windows `Alt+T`）。
3. Lingo 自动读取剪贴板内容并翻译，随后自动粘贴回当前输入框。

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

## 本地运行

```bash
npm install
npm run tauri dev
```

## 打包发布

```bash
npm run tauri build
```

## API 配置

打开应用后进入 `AI模型` 页面：

1. 选择厂商
2. 填写 API Key
3. 确认 API URL 和模型名称
4. 点击“测试连接”

> 自定义厂商支持两种 provider：
> - OpenAI Compatible（`/v1/chat/completions`）
> - Anthropic Messages（`/v1/messages`）

## 许可证

MIT
