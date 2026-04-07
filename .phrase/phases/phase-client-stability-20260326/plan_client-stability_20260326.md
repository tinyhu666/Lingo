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
16. 收敛 COS 镜像链路在慢网环境下的大文件上传失败风险，并补跑已有 0.4.0 release 的镜像同步。
17. 收敛 Windows 客户端贴边大面板的第二层圆角与描边，让系统窗口继续作为唯一边缘轮廓。
18. 同步前端与 Rust 的 UI 语言状态，让慢请求翻译占位提示跟随客户端当前语言显示。
19. 基于已完成的稳定性修复补发 0.4.1，统一版本元数据、更新日志、tag 与 GitHub Release。
20. 为翻译代理补齐总耗时、模型耗时与代理开销三段诊断，直接回答“慢在模型还是接口”。
21. 把翻译风格从轻量 tone 标签升级为差异明显的 style profile，并按风格调优生成预算。
22. 在首页增加游戏选择主入口，并把旧的粗粒度场景值统一迁移到具体游戏枚举。
23. 让指定游戏语境显式进入 prompt 与快路径路由，让短文本翻译/润色更快且更贴近对应术语。
24. 统一 SiliconFlow 的推荐模型组合、示例配置与部署文档，避免继续用 R1 作为翻译默认示例。
25. 在保留快路径意义的前提下，把 SiliconFlow 默认模型组合升级到 `DeepSeek-V3.2 + Qwen/Qwen3-32B`。
26. 将仓库内残留的 Supabase 翻译运行时默认值同步到新的主模型与预算，避免多入口配置漂移。
27. 通过 SSH 将 `buffpp.com` 线上翻译代理同步到最新代码和运行时配置，并做公网与真实请求验证。
28. 基于线上真实耗时结果重调 fast lane 模型档位，并用批量诊断脚本评估当前双模型方案是否可行。
29. 对前端 UI、Rust/Tauri、translate-proxy、线上 buffpp.com 与本地打包链路执行一次完整回归，形成 0.5.0 发版前结论。
30. 将当前稳定版本统一同步到 0.5.0，提交、推送、打 tag，并跟进正式 release 产物。
31. 对齐 `lingo.ink` 官网定位，重写 GitHub README 首页介绍与下载入口，避免仓库首页继续停留在旧版口语化描述。
32. 清理 README 中“嘴替 / in-game voice”这类不够专业的表达，进一步贴近官网当前的产品语言。
33. 为客户端和官网的联系方式区补充 QQ 群入口，并提供可直接复制群号的交互。
34. 将 About 联系方式切换为复用现有腾讯云翻译代理的服务端公开配置，避免每次改联系方式都重新打包客户端或官网前端。
35. 将联系方式服务端化能力与腾讯云现网配置一起打包成新的桌面端补丁版本，完成版本同步、本地打包验证与正式 release。
36. 将桌面端 updater、前端更新提示与 release manifest 统一切换为腾讯云镜像优先，并兼容旧版本客户端仍从 GitHub `latest.json` 进入的情况。
37. 复用现有腾讯云轻量服务器的 Caddy 同时托管官网静态站点与 translate-proxy API，建立国内可直连的官网入口。
38. 将国内优先更新链路与腾讯云官网托管能力收口到 0.6.5，完成版本同步、部署验证与正式 release。
39. 清理 `lingo.ink` 迁移中的 GitHub Pages 自定义域名残留，并把腾讯云部署验收扩展为按全部 `CADDY_DOMAIN` 逐个校验，减少 DNS 切换期的排障盲区。
40. 将现有五个主页面统一重构为更克制的桌面工具风工作台，补齐首页上下文条、主页面层级和多语言文案收敛。
41. 将第一轮视觉收敛继续沉淀为共享页头、共享面板、状态芯片与键帽组件，避免五个主页面继续各写各的页面结构和状态样式。
42. 将标题栏、侧边栏、语言下拉菜单与 toast 反馈也收敛到统一壳层语言，补齐页面外壳与内容区之间的最后一层视觉一致性。
43. 将 task041-task043 的桌面端 UI 收口打包为 `0.6.8`，完成版本同步、更新日志、本地打包验证与正式 release。
44. 在 `0.6.8` 正式发布后补一轮公网 smoke，确认 GitHub/COS 清单、官网下载入口与代理公开摘要都已切到最新版本。
45. 收口历史版本 COS 补镜像流程，默认只刷新版本目录，避免手工补跑旧 tag 时覆盖当前 `latest` manifest 与稳定下载别名。
29. 对当前客户端、翻译代理和本地打包链路执行一次完整回归，确认 0.5.0 的 UI 与功能表现稳定。
30. 将全部已验证改动同步到 0.5.0 版本元数据、更新日志、提交记录与正式 release tag。
29. 将本阶段修复收口到 `0.5.0`，完成 UI/功能回归、本地打包验证、提交与正式发版。

## Scope

- `src/App.jsx`
- `src/components/Layout.jsx`
- `src/components/Sidebar.jsx`
- `src/components/DropdownMenu.jsx`
- `src/components/PageHeader.jsx`
- `src/components/PanelCard.jsx`
- `src/components/StatusChip.jsx`
- `src/components/KeycapGroup.jsx`
- `src/utils/toast.js`
- `src/index.css`
- `src/components/StoreProvider.jsx`
- `src/i18n/I18nProvider.jsx`
- `src/pages/home/**`
- `src/pages/About.jsx`
- `src/pages/Translate.jsx`
- `src/i18n/messages.js`
- `src/constants/gameScenes.js`
- `src/services/settingsStore.js`
- `src/services/publicSiteConfig.js`
- `src/constants/version.js`
- `src/components/UpdateProvider.jsx`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/shortcut.rs`
- `src-tauri/src/shell_helper.rs`
- `src-tauri/src/ai_translator.rs`
- `src-tauri/src/store.rs`
- `src-tauri/tauri.conf.json`
- `server/translate-proxy/src/**`
- `server/translate-proxy/scripts/**`
- `server/translate-proxy/runtime-config.example.json`
- `server/translate-proxy/Caddyfile`
- `server/translate-proxy/docker-compose.yml`
- `server/translate-proxy/.env.example`
- `docs/tencent-cloud-translate-proxy.md`
- `server/translate-proxy/scripts/print-siliconflow-config.mjs`
- `package.json`
- `package-lock.json`
- `.github/workflows/release.yml`
- `.github/workflows/deploy-tencent-light-server.yml`
- `.github/workflows/deploy-tencent-website.yml`
- `CHANGELOG.md`
- `README.md`
- `README.en.md`
- `README.ru.md`
- `src/pages/Phrases.jsx`
- `src/pages/Tutorial.jsx`
- `src/pages/About.jsx`
- `../lingoweb/src/lib/constants.ts`
- `../lingoweb/src/lib/release.ts`
- `../lingoweb/.github/workflows/deploy.yml`
- `../lingoweb/README.md`
- `../lingoweb/public/CNAME`

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
- P0: 0.6.8 版本元数据、更新日志与正式发版链路一致
- P0: 0.6.8 发版后的 GitHub/COS manifest 与公网下载入口必须完成外部验收
- P0: 历史版本 COS 补镜像不能覆盖当前 `latest.json`、`latest-web.json` 与稳定下载别名
- P1: shell_helper 纯逻辑测试兜底
- P1: 0.4.0 发版元数据同步与本地安装包产出
- P1: 设置变更后立即生效与相关 UI 稳定性
- P1: 慢请求翻译占位提示与客户端 UI 语言保持一致
- P1: 0.4.1 补丁版本打包与正式发版闭环
- P0: 翻译慢请求的模型/接口耗时归因
- P0: 三种翻译风格差异化不足
- P1: 首页缺少具体游戏选择入口导致术语语境无法显式指定
- P1: `rewrite` 仍未走快路径导致同语种润色体感偏慢
- P0: SiliconFlow 部署仍可能沿用 R1 示例导致模型侧时延持续偏高
- P1: 默认模型组合偏保守导致术语与表达强度不足
- P1: Supabase 遗留配置仍停在旧模型和旧预算，可能让部署者误回退
- P0: `buffpp.com` 线上代理如果不做真实切换，仓库默认值更新不会自动转化成用户可感知效果
- P0: 当前更强副模型如果持续 fast-fallback，会直接吞掉快路径收益并放大首包等待
- P0: 发版前若没有完整 UI 与功能回归，容易把多轮连续修改中的隐性回归直接带进 0.5.0
- P0: 0.5.0 若版本号、tag、release notes 或安装包命名不同步，会直接破坏更新链路与发布可信度
- P0: 若 0.5.0 发版前缺少完整回归，UI 与翻译链路中的跨层改动容易带着回归一起进入正式包
- P1: 0.5.0 版本入口若漏改 package/Cargo/Tauri/CHANGELOG 其中之一，会导致安装包、Release Notes 与应用内版本不一致
- P0: 若不尽快把已完成修复打包发版，线上与本地代码会继续分叉，回归成本只会越来越高
- P2: GitHub README 如果继续停留在旧定位，会让首次访问者无法快速理解官网当前强调的产品价值与下载入口
- P2: README 若继续保留“嘴替 / in-game voice”这类表达，会与官网当前更专业的产品定位产生落差
- P2: 客户端与官网若继续只保留 Discord/邮箱，会缺少面向中文用户更直接的官方群入口
- P1: 联系方式若继续硬编码在客户端中，后续每次改 Discord/QQ/邮箱都要重新打包桌面端，运维成本过高
- P0: 如果服务端配置已经上线但桌面端未跟着发版，用户侧仍然看不到运行时拉取能力，这次改动就只完成了一半
- P0: 客户端更新若继续先请求 GitHub 并下载 GitHub 资产，国内用户会持续遇到检查更新和下载安装过慢
- P0: 已安装旧版本客户端若仍拿到 GitHub 资产地址，仅发布新客户端无法解决现存用户更新慢的问题
- P0: 官网若继续主要托管在 GitHub Pages，国内首屏与下载入口都会持续偏慢
- P1: 腾讯云轻量服务器若不能同时稳定托管静态站点与 API，后续官网和代理部署会互相覆盖
- P1: 官网仓库若继续保留 `public/CNAME` 这类 GitHub Pages 自定义域名残留，会在 `lingo.ink` 迁移期间持续制造“到底谁在声明主域名”的排障噪音
- P1: 腾讯云部署工作流若始终只验首个 `CADDY_DOMAIN`，即使 `www.lingo.ink` 或后续新域名路由失效，也会在 CI 中被静默漏掉
- P1: 如果五个主页面的壳层、面板和交互密度不统一，桌面客户端会继续保留“混合风格”体验，削弱这次 redesign 的价值
- P1: 如果共享页头、面板、状态芯片和键帽展示不真正抽成可复用组件，后续页面微调仍会重新回到散装样式回归。
- P1: 如果标题栏、侧边栏和菜单层仍停留在旧结构里，用户在切页时会继续感到“内容区已更新，但外壳还没跟上”的割裂。

## Risks & Dependencies

- 桌面圆角修复依赖 Tauri 透明窗口与前端背景层统一。
- 剪贴板稳定性优化需兼顾 macOS 与 Windows 的键盘模拟差异。
- 设置同步修复不能破坏浏览器预览模式。
- 代理热缓存需要避免错误复用不同模型或配置下的结果。
- 客户端重试策略必须足够收敛，避免把一次失败放大成多次重复请求。
- 预热需要只在桌面运行时生效，并通过冷却时间避免应用初始化阶段重复触发。
- 动态预算需要保持可观测，避免以后只能看到“变快了/变差了”却不知道实际生效参数。
- About 联系方式的服务端化必须继续复用现有腾讯云 translate-proxy，不能额外引入新的后台或管理面板，否则会放大部署复杂度。
- 浏览器端官网和 Tauri 桌面端解析代理地址的方式不同；若官网不是与腾讯云代理同域部署，需要通过 `VITE_PUBLIC_BACKEND_URL` 显式指向现有代理。
- 公开联系方式接口只能暴露可公开信息，不能把 `ADMIN_TOKEN`、模型 key 或其他敏感运行时配置混入返回体。
- 双模型路由需要避免“快路由选中但被主模型缺失 key 提前拦截”以及“瞬时回退结果被快路由缓存”两类隐性回归。
- 开发态默认本地代理只能作为最后回退，不能覆盖运行时或发布时显式配置的线上后端地址。
- 共享前端代码中的历史页面即使仍保留文件，也不能默认重新接回桌面端导航。
- Windows 端修复必须避免回归 macOS 当前已经正常的单层圆角表现。
- 开发态自动编排需要在子进程异常退出时一并清理，避免留下孤儿代理或 Vite 进程。
- 客户端测试需要串行化环境变量与端口资源，避免因为测试自身竞争导致误报。
- 系统级剪贴板与按键模拟仍然难以稳定自动化，因此需要把可拆出的纯逻辑优先沉淀到单元测试里。
- 本地 macOS 打包需要沿用仓库内 updater key 的既有归一化格式，否则会在 updater 签名阶段失败。
- 本地打包只能验证 macOS ARM 产物；Windows 安装包与 `latest.json` 仍依赖 tag 推送触发的 GitHub Actions 发版链。
- GitHub Hosted Runner 到腾讯 COS 的链路可能明显慢于 GitHub Release 资产分发，需要更激进地使用分片上传和更宽松的 job 超时来兜底。
- `mirror_existing_release` 如果在旧 tag 上继续无保护地重写稳定 manifest 和 `Lingo_latest*` 别名，会把当前最新补丁版本的更新入口回退到历史版本，因此历史补镜像必须默认只刷新 `releases/v<version>/`。
- Windows 边缘问题不能只看最外层壳体，贴边主面板的圆角、阴影和描边也会在透明窗口里被误读成第二层外轮廓。
- 慢请求占位文案由 Rust 直接写入输入框，因此前端切换 UI 语言后必须把同一状态同步到 Tauri store，不能只停留在浏览器 localStorage。
- `v0.4.0` 已经存在于 GitHub Release，补丁发布必须使用新的语义化版本和 tag；本机只能验证 macOS 打包，Windows 安装包需要等待 GitHub Actions 发版流程完成。
- 旧的 `game_scene` 已经写入本地 store，迁移时必须一次性归一化，否则前端、Rust 与代理会看到不同语义。
- 把更多请求放进 fast lane 只能发生在短文本且风格可控的条件下，避免为了速度把 `toxic` 风格打平。
- 具体游戏术语需要作为轻量约束拼进 prompt，不能演变成过长词典，否则会直接吞掉首包延迟收益。
- 代理新增诊断字段后，客户端日志和 smoke 也要同步消费，否则排查时仍然只能看到部分信息。
- SiliconFlow 的推荐模型名必须和官方支持列表保持一致，否则示例配置与导出脚本会在真实部署时直接失败。
- 更强的 Qwen3-32B 会抬高快路径成本，因此需要保留可回退到 `Qwen/Qwen3-14B` 的明确说明，避免线上切换时没有降级路径。
- Supabase 路径没有独立 fast lane，文档里必须明确它只同步主模型默认值，不能让人误以为也具备同样的双模型提速能力。
- 线上服务器需要保留 `.env` 和 `data/` 的同时更新代码并重建容器，因此部署过程必须先备份目录，避免直接覆盖后无法回滚。
- 线上延迟评估不能只看单个 trace；需要多次采样并统计 p50/p95 与 fast-fallback 占比，否则容易因为共享队列抖动做出错误结论。
- 浏览器预览能覆盖大部分 UI 和交互文案，但 Windows/macOS 透明窗口边缘、桌面热键和 updater 仍需结合 Tauri 构建与现有自动化测试一起判断。
- 当前工作树里同时包含代码、文档和发布元数据修改，提交前必须明确忽略未接入 release 的本地图标生成物与 `.claude/` 目录，避免把无关产物带进 0.5.0。
- 本地 macOS ARM 打包可以验证版本同步、签名与 updater 产物链路，但 Windows 安装包与最终 GitHub Release 资产仍需依赖 tag 推送后的 Actions 工作流收尾。
- 发版前的 UI 回归需要覆盖首页、翻译风格、常用语、关于等关键页面；但桌面外壳和 OS 级热键链路仍只能做有限手工验证，必须在结论里说明边界。
- README 改写必须对齐官网已公开定位与当前客户端真实能力，不能为了营销表达而写入官网未承诺或仓库尚未稳定提供的功能。
- README 的措辞调整应优先复用官网已公开的 `AI in-game chat translation`、`hotkey-first workflow`、`low-friction team communication` 等语言，避免重新引入口语化类比。
- QQ 群目前只给出了群号，没有邀请链接，因此官网与客户端都应优先提供“展示并复制群号”的稳定交互，而不是伪造不可用的跳转 URL。
- 版本号当前在 `package.json` / `package-lock.json` / `Cargo.toml` / `Cargo.lock` / `tauri.conf.json` 之间本就存在不同步痕迹，发版前必须一次性对齐，否则应用内版本、安装包名和 GitHub Release 会继续漂移。
- 旧客户端的 updater 首选入口已经写死在既有发布包里，因此必须同时改新客户端代码和 GitHub release `latest.json` 资产，才能让存量用户真正受益。
- 腾讯云轻量服务器当前部署脚本会清理目标目录，新增官网静态目录后必须显式保留，否则 proxy 发布会把官网文件一起删掉。
- Caddy 新增静态站点托管后，需要先精确保留 `/translate`、`/analytics*`、`/public/site-config`、`/admin*` 等 API 路由，再做 SPA 回退到 `index.html`，否则现网接口会被静态页覆盖。
- 如果 `lingo.ink` 的 DNS 暂时未迁移到腾讯云，部署完成后仍要保留 `https://buffpp.com/` 作为国内可立即使用的官网入口，并把客户端手动更新入口指向这个国内地址。
- 即使代码仓库移除了 `public/CNAME`，真正的根域名 A 记录与 GitHub Pages 自定义域名设置仍由域名注册商和 GitHub 仓库设置决定，因此这次收尾只能减少干扰，不能代替 GoDaddy 发布权威 DNS。
- GitHub Actions 无法读取现有 `TENCENT_TRANSLATE_PROXY_ENV` secret 的明文内容，因此仓库改动可以先把示例配置和验收逻辑补齐，但现网是否已把 `www.lingo.ink` 加入 `CADDY_DOMAIN` 仍需额外更新 secret 或直接登录服务器确认。
- 当前前端仍是单页应用内状态切换而非独立路由，视觉回归时需要特别确认导航切换后的页面层级和滚动容器没有因为 shared shell 改动被意外破坏。
- 首页、常用语和关于页当前已经带有第一轮 UI 改造；第二轮组件化如果只抽样式不抽结构，很容易变成“类名换皮”而没有真正降低后续维护成本。
- toast 当前仍使用内联 style；如果不把窗口级反馈也一起收口到 CSS 和壳层语言，后续主题微调仍然会遗漏这一层系统反馈。
