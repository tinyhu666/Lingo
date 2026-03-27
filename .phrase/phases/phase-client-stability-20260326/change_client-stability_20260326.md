# Client Stability Changes

change187 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 0.5.0 回归与正式发版验收目标，明确完整测试与版本同步要求 | 关联:task030
change188 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:新增 0.5.0 回归与发版里程碑、优先级和本地打包与 Actions 分工风险说明 | 关联:task030
change189 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task030 与 task031，记录 0.5.0 回归、版本同步、提交与发版闭环 | 关联:task031
change190 日期:2026-03-27 | 文件:package.json | 操作:Modify | 影响:前端版本元数据与脚本入口 | 说明:将应用版本同步到 0.5.0，并保留代理诊断与配置导出脚本作为正式发布的一部分 | 关联:task031
change191 日期:2026-03-27 | 文件:package-lock.json | 操作:Modify | 影响:npm 锁文件版本元数据 | 说明:将 lockfile 顶层版本同步到 0.5.0，保持构建产物与包元数据一致 | 关联:task031
change192 日期:2026-03-27 | 文件:src-tauri/Cargo.toml | 操作:Modify | 影响:Tauri Rust 包版本 | 说明:将桌面端 Cargo 版本同步到 0.5.0 | 关联:task031
change193 日期:2026-03-27 | 文件:src-tauri/Cargo.lock | 操作:Modify | 影响:Rust 锁文件顶层包版本 | 说明:将锁文件中的 Lingo 包版本同步到 0.5.0 | 关联:task031
change194 日期:2026-03-27 | 文件:src-tauri/tauri.conf.json | 操作:Modify | 影响:Tauri 打包版本元数据 | 说明:将安装包与 updater 元数据版本同步到 0.5.0 | 关联:task031
change195 日期:2026-03-27 | 文件:.github/workflows/release.yml | 操作:Modify | 影响:Release workflow 默认输入 | 说明:将手动镜像补跑入口的默认 release_tag 更新到 v0.5.0，避免后续误补旧版本 | 关联:task031
change196 日期:2026-03-27 | 文件:CHANGELOG.md | 操作:Modify | 影响:0.5.0 发布说明 | 说明:新增 0.5.0 更新日志，收口游戏语境、翻译性能与 Windows UI 修复等用户可见变化 | 关联:task031

change173 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 fast lane 可行性评估、批量延迟诊断聚合结果和线上副模型重调验收标准 | 关联:task029
change174 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:新增 fast lane 模型重调里程碑与多次采样评估风险说明 | 关联:task029
change175 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task029，记录 SiliconFlow fast lane 可行性调优与前后对比测速结论 | 关联:task029
change176 日期:2026-03-27 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:运行时推荐模型默认值 | 说明:将默认 fast lane 从 Qwen/Qwen3-32B 下调到 Qwen/Qwen3-14B，并把快路由超时预算收敛到 5000ms | 关联:task029
change177 日期:2026-03-27 | 文件:server/translate-proxy/runtime-config.example.json | 操作:Modify | 影响:代理示例配置 | 说明:将示例 fast lane 调整为 Qwen/Qwen3-14B 与 5000ms 超时，和当前低延迟推荐保持一致 | 关联:task029
change178 日期:2026-03-27 | 文件:server/translate-proxy/scripts/smoke-test.mjs | 操作:Modify | 影响:代理自动化验证 | 说明:将 smoke 中的 fast lane 模型期望同步到 Qwen/Qwen3-14B，保持测试与推荐配置一致 | 关联:task029
change179 日期:2026-03-27 | 文件:server/translate-proxy/scripts/diagnose-latency.mjs | 操作:Add | 影响:代理批量延迟诊断 | 说明:新增可配置 runs 与 delay 的批量测速能力，输出 p50/p95、快路由命中率、回退率与 assessment 结论 | 关联:task029
change180 日期:2026-03-27 | 文件:server/translate-proxy/Caddyfile | 操作:Modify | 影响:Caddy 域名配置 | 说明:将 Caddy 站点地址改为读取 CADDY_DOMAIN 环境变量，避免同步仓库后把线上真实域名覆写回示例域名 | 关联:task029
change181 日期:2026-03-27 | 文件:server/translate-proxy/docker-compose.yml | 操作:Modify | 影响:Caddy 容器环境注入 | 说明:为 caddy 服务接入 .env，确保 CADDY_DOMAIN 能进入容器配置渲染路径 | 关联:task029
change182 日期:2026-03-27 | 文件:server/translate-proxy/.env.example | 操作:Modify | 影响:代理环境变量示例 | 说明:新增 CADDY_DOMAIN 并把环境回退主模型默认值同步到 DeepSeek-V3.2 与当前预算 | 关联:task029
change183 日期:2026-03-27 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署文档 | 说明:更新当前推荐为 DeepSeek-V3.2 加 Qwen/Qwen3-14B，补充 32B fast lane 不可行原因、批量测速命令与 CADDY_DOMAIN 说明 | 关联:task029
change184 日期:2026-03-27 | 文件:服务器:/home/ubuntu/lingo-translate-proxy/data/runtime-config.json | 操作:Modify | 影响:线上翻译代理运行时配置 | 说明:将 buffpp.com 线上 fast lane 从 Qwen/Qwen3-32B 切换到 Qwen/Qwen3-14B，并保留 DeepSeek-V3.2 作为主模型 | 关联:task029
change185 日期:2026-03-27 | 文件:服务器:/home/ubuntu/lingo-translate-proxy/Caddyfile | 操作:Modify | 影响:线上反向代理域名与 TLS | 说明:通过同步新的 Caddyfile 与 docker-compose，并在 .env 写入 CADDY_DOMAIN=buffpp.com，恢复重启后公网 TLS 与摘要可用 | 关联:task029
change186 日期:2026-03-27 | 文件:服务器:https://buffpp.com/translate | 操作:Modify | 影响:线上翻译代理真实表现 | 说明:批量测速确认 32B 方案 fast-fallback_rate=100% 不可行，切换到 14B 后冷请求 p50 576ms、rewrite p50 555ms、assessment=viable | 关联:task029

change171 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充线上 buffpp.com 代理必须真实切到新模型组合及其公网验收标准 | 关联:task028
change172 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:新增线上 buffpp.com 真实部署里程碑、优先级与备份回滚风险说明 | 关联:task028

change167 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task028，记录线上 buffpp.com 翻译代理的真实切换与验证闭环 | 关联:task028
change168 日期:2026-03-27 | 文件:服务器:/home/ubuntu/lingo-translate-proxy | 操作:Modify | 影响:线上翻译代理代码 | 说明:通过 SSH 备份并同步最新 server/translate-proxy 代码到 buffpp.com 部署目录，确保线上服务具备 fast_lane 与新诊断字段能力 | 关联:task028
change169 日期:2026-03-27 | 文件:服务器:/home/ubuntu/lingo-translate-proxy/data/runtime-config.json | 操作:Modify | 影响:线上翻译代理运行时配置 | 说明:将线上运行时配置切换为 DeepSeek-V3.2 主模型与 Qwen/Qwen3-32B fast lane，并用 docker compose 重建服务 | 关联:task028
change170 日期:2026-03-27 | 文件:服务器:https://buffpp.com/translate | 操作:Modify | 影响:线上翻译代理公网摘要与真实请求 | 说明:验证公网摘要已返回新模型组合，且带 BACKEND_PUBLIC_KEY 的真实 POST 翻译成功但当前表现为 fast-fallback | 关联:task028

change160 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 Supabase 翻译运行时默认值也需同步到新的主模型与预算，避免多入口配置漂移 | 关联:task027
change161 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:新增 Supabase 遗留翻译运行时默认值同步的里程碑、优先级与 fast lane 能力边界说明 | 关联:task027
change162 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增 task027 以收口 Supabase 翻译运行时默认值与文档同步 | 关联:task027
change163 日期:2026-03-27 | 文件:supabase/translation-runtime.example.json | 操作:Modify | 影响:Supabase 翻译示例配置 | 说明:将 Supabase 翻译运行时示例的默认主模型升级为 DeepSeek-V3.2，并同步低延迟预算 | 关联:task027
change164 日期:2026-03-27 | 文件:docs/translation-service-config.md | 操作:Modify | 影响:Supabase 翻译运行时文档 | 说明:同步 Supabase 示例主模型与预算，并明确该路径不具备代理的双模型 fast lane | 关联:task027
change165 日期:2026-03-27 | 文件:supabase/functions/translate/index.ts | 操作:Modify | 影响:Supabase Edge Function 默认模型 | 说明:将函数运行时和环境回退的默认主模型统一升级到 DeepSeek-V3.2 | 关联:task027
change166 日期:2026-03-27 | 文件:supabase/migrations/20260317160000_translation_runtime_config.sql | 操作:Modify | 影响:Supabase 运行时配置种子 | 说明:将数据库种子中的默认主模型与预算同步为 DeepSeek-V3.2 和低延迟预算 | 关联:task027

change153 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:将 SiliconFlow 推荐默认模型组合升级为 DeepSeek-V3.2 和 Qwen/Qwen3-32B，并明确当前官方未公开 Qwen3.5 model id | 关联:task026
change154 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:将默认模型组合提强目标收敛为 DeepSeek-V3.2 加 Qwen/Qwen3-32B，并补充回退到 Qwen/Qwen3-14B 的风险说明 | 关联:task026
change155 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:更新 task026 为更强的主副模型组合目标，要求同步说明当前官方未公开的 Qwen3.5 现状 | 关联:task026
change156 日期:2026-03-27 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:运行时推荐模型默认值 | 说明:将默认主模型升级为 DeepSeek-V3.2、默认副模型升级为 Qwen/Qwen3-32B，并同步放宽副模型超时预算 | 关联:task026
change157 日期:2026-03-27 | 文件:server/translate-proxy/runtime-config.example.json | 操作:Modify | 影响:代理示例配置 | 说明:将示例配置中的主副模型升级为 DeepSeek-V3.2 和 Qwen/Qwen3-32B，并同步超时预算 | 关联:task026
change158 日期:2026-03-27 | 文件:server/translate-proxy/scripts/smoke-test.mjs | 操作:Modify | 影响:代理自动化验证 | 说明:将 smoke 中的推荐主副模型切换到 DeepSeek-V3.2 和 Qwen/Qwen3-32B，保持测试与默认推荐一致 | 关联:task026
change159 日期:2026-03-27 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署文档 | 说明:将默认推荐模型组合升级为 DeepSeek-V3.2 和 Qwen/Qwen3-32B，并写明官方文档中未发现 Qwen3.5 model id | 关联:task026

change144 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 SiliconFlow 翻译默认模型组合与推荐配置输出能力的目标、边界和验收标准 | 关联:task025
change145 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:新增 SiliconFlow 推荐模型组合统一与部署配置导出里程碑、优先级和风险说明 | 关联:task025
change146 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增 task025 以收口 SiliconFlow 低延迟模型组合与推荐配置输出 | 关联:task025
change147 日期:2026-03-27 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:运行时推荐模型默认值 | 说明:为启用 fast lane 但未显式指定模型名的环境配置提供 Qwen2.5-7B 推荐默认值，并导出 SiliconFlow 低延迟推荐配置工厂 | 关联:task025
change148 日期:2026-03-27 | 文件:server/translate-proxy/runtime-config.example.json | 操作:Modify | 影响:代理示例配置 | 说明:将示例配置统一为 DeepSeek-V3 主模型加 Qwen2.5-7B fast lane 的 SiliconFlow 低延迟组合 | 关联:task025
change149 日期:2026-03-27 | 文件:server/translate-proxy/scripts/print-siliconflow-config.mjs | 操作:Add | 影响:运维配置输出脚本 | 说明:新增可直接输出 JSON 或 curl 的 SiliconFlow 推荐运行时配置脚本 | 关联:task025
change150 日期:2026-03-27 | 文件:server/translate-proxy/scripts/smoke-test.mjs | 操作:Modify | 影响:代理自动化验证 | 说明:将 smoke 中的主模型与快模型示例统一切换到 DeepSeek-V3 和 Qwen2.5-7B，避免继续用 R1 作为翻译基线 | 关联:task025
change151 日期:2026-03-27 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署文档 | 说明:新增 SiliconFlow 低延迟模型组合建议、推荐配置脚本用法与可直接 PUT 的推荐 payload | 关联:task025
change152 日期:2026-03-27 | 文件:package.json | 操作:Modify | 影响:本地运维脚本入口 | 说明:新增 npm run proxy:print-siliconflow-config 便于直接导出推荐配置或 curl 命令 | 关联:task025

change123 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充翻译耗时归因、风格 profile、首页游戏选择与具体游戏术语语境增强的目标、边界与验收标准 | 关联:task021
change124 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:新增翻译耗时诊断、风格重构、游戏选择接入与 rewrite 快路径优化里程碑、范围和风险约束 | 关联:task022
change125 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task021-task024，记录翻译提速、风格重构与游戏语境增强闭环 | 关联:task024
change126 日期:2026-03-27 | 文件:src/constants/gameScenes.js | 操作:Add | 影响:游戏场景枚举与标签 | 说明:新增具体游戏枚举、国际化标签和旧 game_scene 值统一迁移到 dota2 的归一化逻辑 | 关联:task023
change127 日期:2026-03-27 | 文件:src/services/settingsStore.js | 操作:Modify | 影响:前端设置读写归一化 | 说明:在预览态与桌面端统一归一化 game_scene，确保旧场景值加载和保存时都迁移到新枚举 | 关联:task023
change128 日期:2026-03-27 | 文件:src/pages/home/components/GameSceneCard.jsx | 操作:Add | 影响:首页游戏选择入口 | 说明:新增首页游戏选择卡片与下拉菜单，支持 Dota 2、英雄联盟、魔兽世界、守望先锋和其他游戏 | 关联:task023
change129 日期:2026-03-27 | 文件:src/pages/home/index.jsx | 操作:Modify | 影响:首页顶区布局 | 说明:将首页顶区扩展为翻译语言、游戏选择、快捷键和启用状态四张核心卡片 | 关联:task023
change130 日期:2026-03-27 | 文件:src/index.css | 操作:Modify | 影响:首页卡片网格布局 | 说明:为新增游戏选择卡片调整首页桌面端栅格跨度，保持四张主设置卡的布局平衡 | 关联:task023
change131 日期:2026-03-27 | 文件:src/pages/Settings.jsx | 操作:Modify | 影响:策略展示页场景标签 | 说明:隐藏设置页改为展示新的具体游戏名称，避免继续回落到旧的 general/moba/fps/mmo 文案 | 关联:task023
change132 日期:2026-03-27 | 文件:src/i18n/messages.js | 操作:Modify | 影响:游戏选择与场景国际化文案 | 说明:新增首页游戏选择中英俄文案，并将场景标签升级为具体游戏名称 | 关联:task023
change133 日期:2026-03-27 | 文件:src/i18n/messages.js | 操作:Modify | 影响:翻译风格说明文案 | 说明:强化 auto、pro、toxic 三种风格在词汇、句长和语气上的差异说明，匹配新的 style profile | 关联:task022
change134 日期:2026-03-27 | 文件:src-tauri/src/store.rs | 操作:Modify | 影响:桌面端设置默认值与迁移 | 说明:将 game_scene 默认值改为 dota2，统一迁移旧场景值并新增归一化单元测试 | 关联:task023
change135 日期:2026-03-27 | 文件:server/translate-proxy/src/server.mjs | 操作:Modify | 影响:代理耗时诊断 | 说明:为代理响应与日志新增 proxy_overhead_ms 和 style_profile，直接区分模型耗时与接口开销 | 关联:task021
change136 日期:2026-03-27 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:客户端翻译性能日志 | 说明:客户端日志新增 proxy_overhead_ms、model_route 与 style_profile 输出，用于追踪慢请求根因 | 关联:task021
change137 日期:2026-03-27 | 文件:server/translate-proxy/scripts/diagnose-latency.mjs | 操作:Add | 影响:翻译耗时诊断脚本 | 说明:新增可重复执行的诊断脚本，输出冷请求、热缓存与 rewrite 场景下的模型/接口耗时结论 | 关联:task021
change138 日期:2026-03-27 | 文件:package.json | 操作:Modify | 影响:本地诊断脚本入口 | 说明:新增 npm run proxy:diagnose 便于直接运行翻译耗时归因脚本 | 关联:task021
change139 日期:2026-03-27 | 文件:server/translate-proxy/src/server.mjs | 操作:Modify | 影响:翻译风格与游戏术语 prompt | 说明:重构 style profile 和具体游戏语境 prompt，让 auto/pro/toxic 区分更明显并显式注入指定游戏术语 | 关联:task022
change140 日期:2026-03-27 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:快路径默认路由策略 | 说明:将 fast lane 默认允许的 prompt variant 扩展到 translate 和 rewrite，支持短文本润色走快路径 | 关联:task024
change141 日期:2026-03-27 | 文件:server/translate-proxy/runtime-config.example.json | 操作:Modify | 影响:代理示例配置 | 说明:同步 fast lane 示例配置的 allowed_prompt_variants 到 translate+rewrite | 关联:task024
change142 日期:2026-03-27 | 文件:server/translate-proxy/scripts/smoke-test.mjs | 操作:Modify | 影响:代理自动化验证 | 说明:扩展 smoke 覆盖 rewrite 快路径、风格 profile 返回、指定游戏 prompt 注入与 toxic 主模型路由 | 关联:task024
change143 日期:2026-03-27 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署文档 | 说明:补充 proxy_overhead_ms、style_profile 和 rewrite 快路径的诊断与配置说明 | 关联:task021

change113 日期:2026-03-27 | 文件:package.json | 操作:Modify | 影响:前端版本元数据 | 说明:将前端版本号同步到 0.4.1 以承载本次补丁发版 | 关联:task020
change114 日期:2026-03-27 | 文件:package-lock.json | 操作:Modify | 影响:NPM 锁文件版本元数据 | 说明:同步锁文件根版本号到 0.4.1 | 关联:task020
change115 日期:2026-03-27 | 文件:src-tauri/Cargo.toml | 操作:Modify | 影响:Rust 包版本元数据 | 说明:将桌面端 Rust 包版本同步到 0.4.1 | 关联:task020
change116 日期:2026-03-27 | 文件:src-tauri/Cargo.lock | 操作:Modify | 影响:Cargo 锁文件根包版本 | 说明:同步 Cargo 锁文件中的根包版本号到 0.4.1 | 关联:task020
change117 日期:2026-03-27 | 文件:src-tauri/tauri.conf.json | 操作:Modify | 影响:Tauri 应用版本元数据 | 说明:将桌面应用版本号同步到 0.4.1 供安装包和自动更新链路使用 | 关联:task020
change118 日期:2026-03-27 | 文件:CHANGELOG.md | 操作:Modify | 影响:0.4.1 更新日志 | 说明:新增 0.4.1 面向用户的发布说明，覆盖多语言翻译占位提示与 Windows 边缘 UI 修复 | 关联:task020
change119 日期:2026-03-27 | 文件:.github/workflows/release.yml | 操作:Modify | 影响:手动镜像工作流默认参数 | 说明:将 release_tag 默认值更新为 v0.4.1，避免手工补跑镜像时继续回落到旧版本 | 关联:task020
change120 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 0.4.1 补丁发布的目标、边界与验收标准 | 关联:task020
change121 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充 0.4.1 补丁发版里程碑、优先级与 release 风险约束 | 关联:task020
change122 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task020，记录 0.4.1 补丁发版闭环 | 关联:task020

change105 日期:2026-03-27 | 文件:src/services/settingsStore.js | 操作:Modify | 影响:UI 语言持久化 | 说明:新增 UI 语言写入 Tauri store 的同步路径，并在桌面端保存失败时降级为告警而非打断主流程 | 关联:task019
change106 日期:2026-03-27 | 文件:src/i18n/I18nProvider.jsx | 操作:Modify | 影响:客户端语言切换同步 | 说明:在客户端语言状态变化时统一同步 UI 语言到桌面端存储，避免慢请求占位提示继续读取旧语言 | 关联:task019
change107 日期:2026-03-27 | 文件:src/i18n/messages.js | 操作:Modify | 影响:翻译占位文案国际化 | 说明:补充慢请求翻译占位提示的中英俄文案，保持前端文案定义与桌面端行为一致 | 关联:task019
change108 日期:2026-03-27 | 文件:src-tauri/src/store.rs | 操作:Modify | 影响:UI 语言读取与初始化 | 说明:为 Tauri store 增加 ui_locale 的归一化读取与初始化逻辑，供 Rust 侧慢请求占位提示复用 | 关联:task019
change109 日期:2026-03-27 | 文件:src-tauri/src/shell_helper.rs | 操作:Modify | 影响:翻译慢请求占位提示 | 说明:移除固定中文占位文本，改为按当前 UI 语言写入对应提示并补充单元测试 | 关联:task019
change110 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充翻译慢请求占位提示需跟随客户端 UI 语言的目标、边界与验收标准 | 关联:task019
change111 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充前端与 Rust UI 语言状态同步的里程碑、范围与风险约束 | 关联:task019
change112 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task019，记录翻译慢请求占位提示多语言同步修复闭环 | 关联:task019

change101 日期:2026-03-27 | 文件:src/index.css | 操作:Modify | 影响:Windows 贴边主面板外轮廓 | 说明:针对 Windows 单独收紧侧栏与工作区大面板的外侧圆角、描边和阴影，避免贴边区域再出现第二层轮廓 | 关联:task018
change102 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 Windows 贴边大面板不能再模拟第二层边缘轮廓的目标与验收标准 | 关联:task018
change103 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充 Windows 贴边大面板边缘重叠问题的里程碑与风险说明 | 关联:task018
change104 日期:2026-03-27 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task018，记录 Windows 边缘第二层面板轮廓修复闭环 | 关联:task018
change096 日期:2026-03-26 | 文件:scripts/upload-cos-release.mjs | 操作:Modify | 影响:COS 镜像上传策略 | 说明:将镜像上传改为更早启用分片、更小 chunk、更长请求超时和更多重试次数，以降低慢网下的大文件上传失败概率 | 关联:task017
change097 日期:2026-03-26 | 文件:.github/workflows/release.yml | 操作:Modify | 影响:COS 镜像 workflow 超时 | 说明:将自动镜像和手动镜像任务的超时提高到 60 分钟，为慢网重试留出完成空间 | 关联:task017
change098 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 COS 镜像慢网失败场景、分片上传目标与验收标准 | 关联:task017
change099 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充 COS 镜像慢网上传风险和补跑里程碑 | 关联:task017
change100 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增 task017 记录 0.4.0 发版后补齐 COS 镜像的闭环任务 | 关联:task017
change095 日期:2026-03-26 | 文件:src/i18n/messages.js | 操作:Modify | 影响:历史导航文案残留 | 说明:移除多语言侧边栏中的 settings 导航键，避免已下线模块因文案残留被再次误接回入口 | 关联:task011
change085 日期:2026-03-26 | 文件:package.json | 操作:Modify | 影响:版本元数据与打包脚本 | 说明:将前端版本号同步为 0.4.0 并用于后续 Tauri 发版链路 | 关联:task016
change086 日期:2026-03-26 | 文件:package-lock.json | 操作:Modify | 影响:NPM 锁文件版本元数据 | 说明:将锁文件中的根版本号同步为 0.4.0 | 关联:task016
change087 日期:2026-03-26 | 文件:src-tauri/Cargo.toml | 操作:Modify | 影响:Rust 包版本元数据 | 说明:将 Tauri/Rust 应用版本同步为 0.4.0 | 关联:task016
change088 日期:2026-03-26 | 文件:src-tauri/Cargo.lock | 操作:Modify | 影响:Cargo 锁文件根包版本 | 说明:同步根包版本号到 0.4.0 以保持本地构建与发布元数据一致 | 关联:task016
change089 日期:2026-03-26 | 文件:src-tauri/tauri.conf.json | 操作:Modify | 影响:Tauri 应用版本元数据 | 说明:将桌面应用版本号同步为 0.4.0 供打包与自动更新链路使用 | 关联:task016
change090 日期:2026-03-26 | 文件:CHANGELOG.md | 操作:Modify | 影响:0.4.0 更新日志 | 说明:新增 0.4.0 面向用户的发布说明，覆盖翻译速度、状态提示、Windows 圆角与导航回归修复 | 关联:task016
change091 日期:2026-03-26 | 文件:.github/workflows/release.yml | 操作:Modify | 影响:手动镜像工作流默认参数 | 说明:将现有 release_tag 默认值更新为 v0.4.0，避免手动镜像时落回历史默认版本 | 关联:task016
change092 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 0.4.0 发版元数据一致性、本地打包范围与验收标准 | 关联:task016
change093 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充 0.4.0 发版闭环里程碑、范围与风险约束 | 关联:task016
change094 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task016 闭环记录版本同步、完整验证与 macOS ARM 打包 | 关联:task016

change081 日期:2026-03-26 | 文件:src-tauri/src/shell_helper.rs | 操作:Modify | 影响:热键复制与回填基础判断 | 说明:抽取复制/粘贴快捷键路径与 probe 过滤纯逻辑并修复 has_text_selection 的剪贴板污染风险，同时补充单元测试 | 关联:task015
change082 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 shell_helper 纯逻辑测试覆盖目标与验收标准 | 关联:task015
change083 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充 shell_helper 纯逻辑测试优先级与系统交互层风险约束 | 关联:task015
change084 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task015 闭环记录 shell_helper 逻辑测试补齐 | 关联:task015
change077 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:客户端翻译链路测试 | 说明:新增本地假代理 smoke 测试与本地代理不可达提示测试并串行化环境变量改写 | 关联:task014
change078 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充客户端翻译链路最小自动化测试目标与验收标准 | 关联:task014
change079 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充客户端翻译链路自动化测试优先级与环境隔离约束 | 关联:task014
change080 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task014 闭环记录客户端翻译链路自动化测试补齐 | 关联:task014
change071 日期:2026-03-26 | 文件:scripts/dev-desktop.mjs | 操作:Add | 影响:桌面开发编排 | 说明:新增本地开发编排脚本以同时托管 Vite 和本地翻译代理并在异常退出时统一清理子进程 | 关联:task013
change072 日期:2026-03-26 | 文件:package.json | 操作:Modify | 影响:开发脚本 | 说明:新增 dev:desktop 脚本供桌面开发模式复用 | 关联:task013
change073 日期:2026-03-26 | 文件:src-tauri/tauri.conf.json | 操作:Modify | 影响:Tauri 开发启动流程 | 说明:将 beforeDevCommand 切换为自动同时启动 Vite 和本地翻译代理的新脚本 | 关联:task013
change074 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 Tauri 开发态一键拉起完整调试链路的目标和验收标准 | 关联:task013
change075 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充桌面开发依赖进程自动编排的优先级和子进程清理约束 | 关联:task013
change076 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task013 闭环记录 Tauri 开发态自动拉起本地代理 | 关联:task013
change065 日期:2026-03-26 | 文件:src/index.css | 操作:Modify | 影响:Windows 桌面壳层外轮廓 | 说明:移除 Windows 端前端外层圆角并保留原生窗口外轮廓作为唯一四角曲线 | 关联:task012
change066 日期:2026-03-26 | 文件:.phrase/docs/ISSUES.md | 操作:Add | 影响:全局问题索引 | 说明:登记 Windows 客户端四角重叠圆角问题为 issue001 | 关联:task012
change067 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/issue_client-stability_20260326.md | 操作:Add | 影响:阶段问题详情 | 说明:记录 Windows 外层圆角重叠的现象、根因、修复方案与验证约束 | 关联:task012
change068 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充 Windows 单层外轮廓圆角目标与验收标准 | 关联:task012
change069 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充 Windows 双层圆角修复优先级与平台差异风险约束 | 关联:task012
change070 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task012 闭环记录 Windows 四角重叠圆角修复 | 关联:task012
change060 日期:2026-03-26 | 文件:src/App.jsx | 操作:Modify | 影响:共享页面映射 | 说明:移除已下线 Settings 页面在桌面端页面映射中的重新接入 | 关联:task011
change061 日期:2026-03-26 | 文件:src/constants/navigation.js | 操作:Modify | 影响:侧边栏导航 | 说明:移除历史 Settings 入口并恢复桌面端侧边栏支持项集合 | 关联:task011
change062 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充已下线页面不应因共享导航回归而重新暴露的约束与验收标准 | 关联:task011
change063 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充共享导航历史页面回归收敛里程碑与风险约束 | 关联:task011
change064 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task011 闭环记录 Settings 导航回归修复 | 关联:task011
change056 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:开发态翻译后端解析与错误提示 | 说明:为 Tauri 调试构建增加本地代理默认回退地址并将本地代理不可达改为可操作提示 | 关联:task010
change057 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充开发态默认走本地代理与预热命中真实链路的目标和验收标准 | 关联:task010
change058 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充开发态本地代理接入里程碑、优先级与配置优先级约束 | 关联:task010
change059 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task010 闭环记录开发态本地代理默认链路修复 | 关联:task010
change048 日期:2026-03-26 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:运行时模型路由配置 | 说明:新增 fast_lane 配置块并支持环境变量、持久化与摘要回显 | 关联:task009
change049 日期:2026-03-26 | 文件:server/translate-proxy/src/server.mjs | 操作:Modify | 影响:翻译模型路由与缓存策略 | 说明:为短文本增加快模型优先路由并在异常时安全回退到主模型且避免回退结果污染快路由缓存 | 关联:task009
change050 日期:2026-03-26 | 文件:server/translate-proxy/runtime-config.example.json | 操作:Modify | 影响:代理示例配置 | 说明:补充可选 fast_lane 配置示例 | 关联:task009
change051 日期:2026-03-26 | 文件:server/translate-proxy/scripts/smoke-test.mjs | 操作:Modify | 影响:代理 smoke 校验 | 说明:新增本地上游桩验证快路由成功、主模型回退和回退后重试快路由合同 | 关联:task009
change052 日期:2026-03-26 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署说明 | 说明:补充 fast_lane 配置、model_route 诊断字段与双模型路由说明 | 关联:task009
change053 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充快模型优先路由与安全回退的目标、边界与验收标准 | 关联:task009
change054 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充双模型快路由里程碑、优先级与缓存回退风险约束 | 关联:task009
change055 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task009 闭环记录双模型快路由优化 | 关联:task009
change001 日期:2026-03-26 | 文件:src/index.css | 操作:Modify | 影响:桌面壳层圆角与裁切 | 说明:移除 html 级 clip-path 并将窗口外轮廓收敛到 lingo-theme 与 lingo-app-shell | 关联:task001
change042 日期:2026-03-26 | 文件:server/translate-proxy/src/server.mjs | 操作:Modify | 影响:上游模型请求构建 | 说明:为新翻译请求增加更短 prompt 与按文本长度自适应的生成预算并回传实际生效参数 | 关联:task008
change043 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:客户端性能日志 | 说明:记录代理返回的 prompt 类型与实际 token/temperature 预算 | 关联:task008
change044 日期:2026-03-26 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署说明 | 说明:补充自适应请求预算与新增诊断字段说明 | 关联:task008
change045 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充新文本首包预算自适应目标与验收标准 | 关联:task008
change046 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充动态 prompt 与生成预算的范围和风险约束 | 关联:task008
change047 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task008 闭环记录新文本首包优化 | 关联:task008
change037 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:翻译后端预热 | 说明:新增带冷却时间的后台预热请求以降低首发翻译冷启动时延 | 关联:task007
change038 日期:2026-03-26 | 文件:src-tauri/src/lib.rs | 操作:Modify | 影响:应用启动与启用流程 | 说明:在启动和重新启用翻译时异步触发翻译代理预热 | 关联:task007
change039 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充首次翻译冷启动预热目标与验收标准 | 关联:task007
change040 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充客户端预热范围、优先级与风险约束 | 关联:task007
change041 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task007 闭环记录首次翻译预热优化 | 关联:task007
change028 日期:2026-03-26 | 文件:src-tauri/Cargo.toml | 操作:Modify | 影响:异步等待依赖 | 说明:引入 tokio time 以替换翻译链路中的阻塞式 sleep | 关联:task006
change029 日期:2026-03-26 | 文件:src-tauri/src/shell_helper.rs | 操作:Modify | 影响:剪贴板读取与占位调度 | 说明:改为异步等待并用临时 probe 避免误读旧剪贴板 | 关联:task006
change030 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:客户端翻译请求恢复 | 说明:对瞬时传输错误与 5xx 响应增加一次窄范围重试并兼容代理诊断字段 | 关联:task006
change031 日期:2026-03-26 | 文件:src-tauri/src/shortcut.rs | 操作:Modify | 影响:翻译热键重入反馈 | 说明:在翻译进行中重复触发时发出 translation_busy 事件 | 关联:task006
change032 日期:2026-03-26 | 文件:src/components/Layout.jsx | 操作:Modify | 影响:翻译状态提示 | 说明:监听 translation_busy 事件并节流显示处理中提示 | 关联:task006
change033 日期:2026-03-26 | 文件:src/utils/toast.js | 操作:Modify | 影响:提示样式 | 说明:补充中性信息提示用于展示翻译进行中状态 | 关联:task006
change034 日期:2026-03-26 | 文件:src/i18n/messages.js | 操作:Modify | 影响:标题栏国际化文案 | 说明:新增翻译进行中提示的多语言文本 | 关联:task006
change035 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:补充重复触发反馈与瞬时抖动自恢复的目标和验收标准 | 关联:task006
change036 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充忙碌提示与客户端窄范围重试的范围和风险 | 关联:task006
change021 日期:2026-03-26 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:运行时配置热路径 | 说明:为 runtime config 增加短 TTL 内存缓存并在持久化后强制刷新 | 关联:task005
change022 日期:2026-03-26 | 文件:server/translate-proxy/src/server.mjs | 操作:Modify | 影响:翻译代理响应复用与诊断信息 | 说明:为相同翻译请求增加内存热缓存与 in-flight 复用并返回 response_source/attempt_count/model_latency_ms | 关联:task005
change023 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:客户端翻译性能日志 | 说明:记录代理返回来源、尝试次数与模型耗时便于定位慢请求 | 关联:task005
change024 日期:2026-03-26 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署说明 | 说明:补充热缓存与响应诊断字段说明 | 关联:task005
change025 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/plan_client-stability_20260326.md | 操作:Modify | 影响:阶段计划 | 说明:补充代理热路径优化范围与风险记录 | 关联:task005
change026 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/spec_client-stability_20260326.md | 操作:Modify | 影响:阶段需求说明 | 说明:将代理热缓存与慢请求诊断纳入目标与验收标准 | 关联:task005
change027 日期:2026-03-26 | 文件:.phrase/phases/phase-client-stability-20260326/task_client-stability_20260326.md | 操作:Modify | 影响:任务清单 | 说明:新增并完成 task005 闭环记录代理热路径优化 | 关联:task005
change002 日期:2026-03-26 | 文件:src/App.jsx | 操作:Modify | 影响:页面路由 | 说明:接入 Settings 页面懒加载映射 | 关联:task002
change003 日期:2026-03-26 | 文件:src/constants/navigation.js | 操作:Modify | 影响:侧边栏导航 | 说明:新增 Settings 导航入口 | 关联:task002
change004 日期:2026-03-26 | 文件:src/i18n/messages.js | 操作:Modify | 影响:多语言导航文案 | 说明:补充 Settings 导航国际化文本 | 关联:task002
change005 日期:2026-03-26 | 文件:src/components/StoreProvider.jsx | 操作:Modify | 影响:设置同步与持久化 | 说明:区分同步与持久化写入并在失败时回滚前端状态 | 关联:task002
change006 日期:2026-03-26 | 文件:src/services/settingsStore.js | 操作:Modify | 影响:设置存储 | 说明:显式保存 Tauri store 并将持久化失败抛出 | 关联:task002
change007 日期:2026-03-26 | 文件:src/pages/home/components/HotkeyCard.jsx | 操作:Modify | 影响:快捷键录制 | 说明:避免仅修饰键提交并支持录制取消 | 关联:task002
change008 日期:2026-03-26 | 文件:src/pages/home/components/EnableStatusCard.jsx | 操作:Modify | 影响:状态同步 | 说明:使用后端返回设置同步前端内存状态避免重复写盘 | 关联:task002
change009 日期:2026-03-26 | 文件:src/pages/Phrases.jsx | 操作:Modify | 影响:常用语保存 | 说明:复用后端返回设置减少额外读取并同步前端状态 | 关联:task002
change010 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:翻译请求构建 | 说明:改为复用热键入口设置快照避免重复读取配置 | 关联:task003
change011 日期:2026-03-26 | 文件:src-tauri/src/shell_helper.rs | 操作:Modify | 影响:翻译复制粘贴链路 | 说明:移除中间状态回填并增加复制后短等待确认与延迟恢复剪贴板 | 关联:task003
change012 日期:2026-03-26 | 文件:src-tauri/src/lib.rs | 操作:Modify | 影响:Tauri 命令与启动流程 | 说明:让快捷键与常用语命令直接返回最新设置并清理不可达启动分支 | 关联:task003
change013 日期:2026-03-26 | 文件:server/translate-proxy/src/server.mjs | 操作:Modify | 影响:代理 prompt 与空响应恢复 | 说明:优化同语种 rewrite prompt 并对空响应自动重试一次 | 关联:task004
change014 日期:2026-03-26 | 文件:server/translate-proxy/src/runtime-config.mjs | 操作:Modify | 影响:代理默认时延预算 | 说明:将默认 timeout、max_tokens 和 temperature 调整为更低延迟配置 | 关联:task004
change015 日期:2026-03-26 | 文件:server/translate-proxy/runtime-config.example.json | 操作:Modify | 影响:代理示例配置 | 说明:同步低延迟默认参数 | 关联:task004
change016 日期:2026-03-26 | 文件:docs/translation-service-config.md | 操作:Modify | 影响:运行时配置文档 | 说明:同步低延迟默认参数说明 | 关联:task004
change017 日期:2026-03-26 | 文件:docs/tencent-cloud-translate-proxy.md | 操作:Modify | 影响:代理部署文档 | 说明:同步低延迟默认参数说明 | 关联:task004
change018 日期:2026-03-26 | 文件:server/translate-proxy/scripts/smoke-test.mjs | 操作:Modify | 影响:代理 smoke 校验 | 说明:修正脚本工作目录以确保包内执行稳定通过 | 关联:task004
change019 日期:2026-03-26 | 文件:src-tauri/src/ai_translator.rs | 操作:Modify | 影响:客户端超时与错误提示 | 说明:将客户端总超时调整为 15 秒并标准化超时与空结果报错 | 关联:task004
change020 日期:2026-03-26 | 文件:src-tauri/src/shell_helper.rs | 操作:Modify | 影响:翻译过程占位提示与失败回退 | 说明:仅在慢请求时显示“翻译中，请稍候”并在失败时恢复原文本 | 关联:task004
