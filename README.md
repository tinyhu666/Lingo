# AutoGG - Dota2 游戏内聊天翻译工具

AutoGG 是一个基于大模型的聊天翻译工具，主要面向 Dota2 国际服沟通场景，加入了很多Dota2 专用交流语（BKB、开雾、反眼等）。

- 支持 **Windows / macOS**
- 支持 **全局快捷键** 自动复制 -> 翻译 -> 粘贴
- 支持填写多家模型 API（OpenAI / DeepSeek / Qwen / Moonshot / SiliconFlow / Anthropic / 自定义）
- 支持在设置中切换不同模型厂商

## 功能说明

1. 在 Dota2 聊天框中输入发言内容。
2. 按下翻译快捷键（默认：macOS `⌘+T`，Windows `Alt+T`）。
3. AutoGG 自动读取剪贴板内容并翻译，随后自动粘贴回当前输入框。
4. 将翻译后的内容发出。

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
