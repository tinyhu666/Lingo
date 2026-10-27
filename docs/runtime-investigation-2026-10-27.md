# 2026-10-27 运行检查与修复

检查对象：Lingo v0.9.15、buffpp.com 对应的生产 systemd 服务及 SQLite 诊断库。生产访问仅执行读取；未部署、重启或清理生产数据。

## 最近 7 天证据

10 月 27 日北京时间约 18:15 查询滚动 7 天日志。数据来自 `journalctl -u lingo-translate-proxy` 和以只读模式打开的 `data/analytics.sqlite`；不保存凭据、用户原文或安装标识。

- 服务从 9 月 21 日持续运行，systemd NRestarts=0。
- 服务日志：177 次成功翻译，primary 89 次、fast-lane 88 次；未发现模型失败日志。延迟 P50=741 ms、P95=1044 ms。这仅描述已有记录，不代表全部用户操作的成功率。
- 客户端：206 条 pipeline started、169 条 pipeline succeeded；21 次 clipboard_read failed（3 个安装）、15 次 modifier_release failed（1 个安装）、1 次 paste failed（目标窗口已切换，主动停止替换）；另有 201 次 busy skipped。
- 没有对应模型请求失败，不能把客户端复制/修饰键异常归因于模型。复制失败可能与输入框焦点、未选中文本、目标程序或剪贴板格式有关，现有日志不足以确定单一根因。Windows 实机复现仍待完成；未扩大输入重试或绕过焦点保护。

## 模型版本

线上 `/translate` 返回官方 `https://api.deepseek.com/v1/chat/completions`，主模型和快速通道均为 `deepseek-flash`；备用为 `deepseek-v4-pro`、`glm-5.3-flash`。

截至检查时，[DeepSeek 官方文档](https://api-docs.deepseek.com/api/responses) 明确说明 `deepseek-flash` 对应 DeepSeek-V4.1-Flash-1017。因此当前配置已经使用新版 Flash；此结论结合线上路由与官方别名说明，未额外发送计费模型探测。

## 已确认缺陷及本地修复

诊断库共 4963 条记录，其中 965 条已超过文档声明的 30 天保留期，最早记录为 2026-09-03。根因是旧实现仅在服务启动时清理，服务持续运行后不再执行清理。

修改 `server/translate-proxy/src/analytics-store.mjs`：

- 启动、每小时以及管理员查询时清理过期诊断；定时器不阻止进程退出。
- 拒绝过期离线诊断补报，避免清理后重新入库。
- 使用规范 ISO 时间与现有时间索引比较，避免对每行调用 julianday。
- 生命周期事件的保留策略保持原样。

## 验证和交付状态

新增回归测试使用临时数据库和模拟时钟，验证不重启时的定时清理、查询清理、过期客户端/服务端记录拒绝、生命周期历史保留，并加入现有 analytics CI 命令。

已通过：24 项客户端测试、8 项模型/路由测试、翻译代理 smoke、analytics 回归与 smoke、99 项 macOS Rust 测试、Rust 格式与 Clippy、前端生产构建、release-config 校验及 diff whitespace 检查。

上述为本地验收时的状态；修复随后纳入 v0.9.16 发布，实际发布状态见 [GitHub Release](https://github.com/tinyhu666/lingo/releases/tag/v0.9.16)。线上模型路由不变。Windows 游戏窗口端到端行为仍需真实游戏环境验证。
