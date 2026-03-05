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

## 本地运行

```bash
npm install
npm run tauri dev
```

## Tauri 运行环境变量（翻译代理）

```bash
LINGO_BACKEND_URL=https://<your-project>.supabase.co/functions/v1
LINGO_BACKEND_ANON_KEY=<your-anon-key>
```

> 若不设置上述变量，客户端会提示“未配置翻译代理地址”。

## Supabase 目录

仓库内已提供翻译代理模板：

- `supabase/functions/translate`：服务端统一模型代理

部署前请在 Supabase Secrets 中设置：

- `MODEL_PROVIDER`
- `MODEL_API_URL`
- `MODEL_API_KEY`
- `MODEL_NAME`

## 打包发布

```bash
npm run tauri build
```

## 许可证

MIT
