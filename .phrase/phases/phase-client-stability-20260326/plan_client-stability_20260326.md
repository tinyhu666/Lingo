# Client Stability Plan

## Milestones

1. 定位窗口圆角重叠根因并收敛为单一裁切边界。
2. 修复主界面设置同步与明显 UI/功能缺陷。
3. 精简翻译触发链路并补强剪贴板读取稳定性。
4. 收敛翻译代理热路径，减少重复请求成本并补强慢请求可观测性。
5. 为翻译进行中与瞬时代理抖动增加用户反馈和窄范围自恢复。
6. 在客户端启动和恢复启用时静默预热翻译后端，降低首发冷启动时延。
7. 为未命中缓存的新请求增加自适应 prompt 与生成预算，压低首包延迟。
8. 为短文本翻译增加快模型优先路由，并确保回退路径不污染缓存。
9. 打通开发态桌面端到本地翻译代理的默认链路，降低本机验证成本。
10. 清理共享导航中的历史页面回归，恢复桌面端已下线模块的隐藏状态。
11. 按平台分离桌面端外层圆角策略，消除 Windows 双层窗口圆角。
12. 自动编排桌面开发依赖进程，减少本机调试翻译链路的手工步骤。
13. 为 Rust 客户端翻译链路补充最小自动化测试，替代纯手工回归。
14. 为 shell_helper 的快捷键路径和 probe 过滤补充纯逻辑测试，提前拦住系统交互层下方的回归。
15. 完成 0.4.0 版本同步、发版文案更新与本地 macOS ARM 安装包打包验证。

## Scope

- `src/App.jsx`
- `src/components/Layout.jsx`
- `src/utils/toast.js`
- `src/index.css`
- `src/components/StoreProvider.jsx`
- `src/pages/home/**`
- `src/pages/Translate.jsx`
- `src/i18n/messages.js`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/shortcut.rs`
- `src-tauri/src/shell_helper.rs`
- `src-tauri/src/ai_translator.rs`
- `src-tauri/src/store.rs`
- `src-tauri/tauri.conf.json`
- `server/translate-proxy/src/**`
- `server/translate-proxy/scripts/**`
- `docs/tencent-cloud-translate-proxy.md`
- `package.json`
- `package-lock.json`
- `.github/workflows/release.yml`
- `CHANGELOG.md`

## Priorities

- P0: 窗口圆角重叠
- P0: 翻译链路冗余导致的体感延迟
- P0: 翻译代理重复请求与慢请求定位成本
- P0: 翻译进行中重复触发的静默失败感知
- P1: 翻译首发冷启动时延
- P1: 新文本未命中缓存时的首包生成时延
- P1: 短文本快模型优先路由与安全回退
- P1: 开发态本地代理默认接入与可操作报错
- P1: 已下线页面的导航回归收敛
- P0: Windows 客户端双层窗口圆角
- P1: Tauri 开发态自动拉起本地代理
- P1: 客户端翻译链路自动化测试兜底
- P1: shell_helper 纯逻辑测试兜底
- P1: 0.4.0 发版元数据同步与本地安装包产出
- P1: 设置变更后立即生效与相关 UI 稳定性

## Risks & Dependencies

- 桌面圆角修复依赖 Tauri 透明窗口与前端背景层统一。
- 剪贴板稳定性优化需兼顾 macOS 与 Windows 的键盘模拟差异。
- 设置同步修复不能破坏浏览器预览模式。
- 代理热缓存需要避免错误复用不同模型或配置下的结果。
- 客户端重试策略必须足够收敛，避免把一次失败放大成多次重复请求。
- 预热需要只在桌面运行时生效，并通过冷却时间避免应用初始化阶段重复触发。
- 动态预算需要保持可观测，避免以后只能看到“变快了/变差了”却不知道实际生效参数。
- 双模型路由需要避免“快路由选中但被主模型缺失 key 提前拦截”以及“瞬时回退结果被快路由缓存”两类隐性回归。
- 开发态默认本地代理只能作为最后回退，不能覆盖运行时或发布时显式配置的线上后端地址。
- 共享前端代码中的历史页面即使仍保留文件，也不能默认重新接回桌面端导航。
- Windows 端修复必须避免回归 macOS 当前已经正常的单层圆角表现。
- 开发态自动编排需要在子进程异常退出时一并清理，避免留下孤儿代理或 Vite 进程。
- 客户端测试需要串行化环境变量与端口资源，避免因为测试自身竞争导致误报。
- 系统级剪贴板与按键模拟仍然难以稳定自动化，因此需要把可拆出的纯逻辑优先沉淀到单元测试里。
- 本地 macOS 打包需要沿用仓库内 updater key 的既有归一化格式，否则会在 updater 签名阶段失败。
- 本地打包只能验证 macOS ARM 产物；Windows 安装包与 `latest.json` 仍依赖 tag 推送触发的 GitHub Actions 发版链。
