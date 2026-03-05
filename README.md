# Lingo - 游戏内聊天翻译客户端

Lingo 是一个基于 AI 大模型的游戏内聊天翻译客户端。当前版本已升级为账号制：用户通过邮箱注册并登录后，即可使用服务端统一托管的翻译能力，无需本地填写模型 API 参数。后续版本会持续支持更多游戏场景。

- 支持 Windows / macOS
- 支持全局快捷键：自动复制 -> 翻译 -> 自动粘贴
- 支持邮箱注册/登录（强制邮箱验证）
- 模型配置由服务端统一管理，客户端无需配置 API Key

## 功能说明

1. 登录账号并完成邮箱验证。
2. 在游戏聊天框中选中或输入文本。
3. 按翻译快捷键（默认：macOS `⌘+T`，Windows `Alt+T`）。
4. Lingo 自动读取剪贴板内容并回填翻译结果。

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

## 客户端环境变量（认证）

创建 `.env`：

```bash
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Tauri 运行环境变量（翻译代理）

```bash
LINGO_BACKEND_URL=https://<your-project>.supabase.co/functions/v1
LINGO_BACKEND_ANON_KEY=<your-anon-key>
```

> 若不设置上述变量，客户端会提示“认证服务未配置”或“未配置翻译代理地址”。

## Supabase 目录

仓库内已提供基础服务端模板：

- `supabase/functions/me`：返回登录用户角色与验证状态
- `supabase/functions/translate`：服务端统一模型代理
- `supabase/migrations/20260305_profiles.sql`：`profiles` 表与触发器

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
