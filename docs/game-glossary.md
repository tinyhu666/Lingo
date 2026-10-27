# Lingo 游戏术语维护

首次建立：2026-10-27。当前词表 CSV：[game-glossary.csv](game-glossary.csv)。CSV 是生成的阅读版本；不要直接编辑它。

## 覆盖范围与来源

| 游戏 | 官方名称条数 | 覆盖内容 | 官方来源 |
| --- | ---: | --- | --- |
| Dota 2 | 535 | 127 位英雄、408 个物品名称 | [Valve 英雄数据](https://www.dota2.com/datafeed/herolist?language=english)、[物品数据](https://www.dota2.com/datafeed/itemlist?language=english) |
| 英雄联盟 | 738 | 173 位英雄、543 个去重物品、22 个召唤师技能；Data Dragon 16.21.1 | [Riot Data Dragon 文档](https://developer.riotgames.com/docs/lol#data-dragon)、[版本列表](https://ddragon.leagueoflegends.com/api/versions.json) |
| 守望先锋 | 54 | 英雄名称 | [国服英雄](https://ow.blizzard.cn/heroes/)、[全球英雄](https://overwatch.blizzard.com/en-us/heroes/) |
| 魔兽世界 | 13 | 职业名称 | [Blizzard 职业](https://worldofwarcraft.blizzard.com/zh-cn/game/classes) |

共 1,340 条官方名称，另有 58 条人工维护的通用/游戏战术表达、100 组英雄/物品常用别名。CSV 共 1,398 行。官方名称覆盖中文、英文、俄文；其他目标语言由模型本地化，未注入未经核对的目标译名。`en-SEA` 使用英文实体名称。

这不是四款游戏所有术语的完整清单：魔兽目前以职业和副本沟通为主，未覆盖全部任务、地区、装备和技能；守望先锋以英雄和常见战术为主。官方接口包含部分历史物品和不同模式名称，不等同于当前所有可购买物品。四个缺少完整语言名称的 Riot 物品未启用，ID 保存在 `official.json.excluded`。

## 如何使用和维护

- `server/translate-proxy/src/glossary/official.json`：自动同步的官方名称、稳定 ID、来源 URL、版本与内容修订号。仅保存名称，不复制技能说明和百科正文。
- `server/translate-proxy/src/glossary/curated.json`：人工维护的俗称、战术表达、语境说明和可原样返回的缩写。实体别名通过 `ref` 关联官方 ID；官方来源只证明正式名称，不证明玩家俗称。修改时同时更新日期和回归样例。
- `server/translate-proxy/src/glossary/quality-cases.json`：17 条自编语义验收样例，包含预期含义，不能当作线上用户样本。
- `server/translate-proxy/src/glossary.mjs`：启动时加载；按当前游戏和句子匹配，优先最长词并去重。游戏专用释义优先于通用释义，同一游戏内有歧义的同形词不强行选取。单字和纯数字别名不自动匹配，以免“很美”或“76 秒”误命中英雄。

运行命令：

```bash
npm run glossary:check       # 仅抓取、校验、报告新增/改名/删除，不改文件
npm run glossary:update      # 校验通过后原子更新 official.json，并生成 CSV
npm run glossary:export      # 人工编辑 curated.json 后重新导出 CSV
npm run glossary:test        # 离线词表、提示词、更新校验和语义路由回归
npm run proxy:smoke          # 真实 HTTP 代理 + 模拟模型，覆盖路由、缓存、回退
```

官方名称在服务器通过校验和回归后自动更新；人工别名和验收样例仍随代码审查维护，不自动猜测玩家俗称。抓取失败、语言回退、条目明显减少（相对旧表超过 20%）、必需游戏缺失或现有别名引用失效会终止更新并保留旧文件。没有内容变化时不重写日期和版本。网站改版导致解析失败时应修解析器，不要用猜测的名称补齐。官方更新与人工别名应分别审查。

维护已迁到生产服务器的 `lingo-glossary-update.timer`：每周一北京时间 10:00 自动执行；服务器启动两分钟后补跑，错过日历任务也会补跑。执行不依赖本地电脑或 Codex。本地同名维护任务停用。

服务器自动流程：抓取官方数据 → 校验语言、数量和别名引用 → 建立隔离候选快照 → 运行全部代理单元测试、翻译 smoke、统计 smoke → 原子切换 `current` → 重启翻译服务 → 检查健康状态与实际加载修订号。测试使用模拟模型和临时数据库，不读取生产密钥或聊天，不产生模型调用费用。有变化才重启；无变化仍校验和测试。任何测试失败均保留旧版本；切换后的健康检查失败则自动切回旧版本并验证恢复。进程异常终止时，systemd 的 `ExecStopPost` 根据待完成记录恢复；恢复未完成时保留记录供下次执行处理。保留最近八份快照及当前/上一份版本。

正式官方词表位于 `/var/lib/lingo-glossary/current/official.json`，同目录有 `game-glossary.csv` 和用于审计的 `curated.json` 快照。运行时的人工别名仍来自 `/opt/lingo-translate-proxy/src/glossary/curated.json`，跟随经过审查的代码发布。独立持久化目录不会被代码部署覆盖。仓库中的官方 JSON/CSV 是开发基线，可能落后于服务器自动维护版本。

查看执行情况和手动补跑：

```bash
systemctl list-timers lingo-glossary-update.timer
systemctl start lingo-glossary-update.service
journalctl -u lingo-glossary-update.service -n 100 --no-pager
cat /var/lib/lingo-glossary/last-run.json
curl -fsS http://127.0.0.1:8787/translate
```

安装入口：`scripts/install-systemd.sh` 会安装和启用该计划。单独迁移既有服务时，以 root 执行 `scripts/install-glossary-systemd.sh /opt/lingo-translate-proxy`，然后重启并检查代理健康，再启动 timer。不要直接修改 `current` 指向的 JSON，也不要对受管路径使用 `update-glossary.mjs --write`。

部署新代码前先停止更新 timer 和 service（两个现有服务器部署工作流已接入），等待恢复步骤结束；部署成功后重新启动 timer。安装器校验保留的官方词表能满足新代码别名引用，遇到新引用缺失时拒绝部署，不用旧仓库数据覆盖服务器词表：先在隔离环境用新代码抓取和测试官方更新，再重试部署。网站解析失败或人工别名失效需要维护代码；失败原因记录在 systemd 日志和 `last-run.json`，不会用猜测的数据继续发布。

## 提示词约束与速度

先保留原意，再应用 Auto / Pro / Toxic 风格。明确保留否定、疑问、不确定性、动作对象、条件、数字和冷却时间；不回答待翻译的问题，不添加命令、事实或人身攻击。收信翻译不套用发信风格。混合语言只翻译需要翻译的部分；昵称、坐标、按键、链接与常见缩写需保留。

只注入当前句子命中的术语，最多 12 条、1,400 字符。日常模式不注入游戏词表，避免普通“蝴蝶”变成物品。词表匹配与提示词拼装在本机 1,000 次短句测量中 P95 约 0.004 ms，不包含模型和网络时间，不能视为端到端提速比例。没有新增网络请求到正常翻译流程。

`BKB`、`GG!`、`GG WP` 等允许的纯缩写消息可原样返回，不再触发无意义的备用模型调用。完整句子原样返回仍触发既有回退。提示词/词表修订号进入缓存键；GET `/translate` 公开 `prompt_revision` 和 `glossary` 计数/修订号，便于部署后检查实际加载版本，不暴露原文。

## 2026-10-27 验证记录

- 离线：9 组词表与提示词测试、其他 11 组代理测试、完整代理 smoke 和 analytics smoke 通过；24 项客户端测试、前端生产构建和发布配置校验通过。测试接入已有代理 CI。
- 更新程序：官方源抓取成功；再次 `glossary:check` 返回 `changed=false`，没有重复改写。CSV 导出与两份 JSON 对照检查。
- 真实模型：使用服务器现有凭据调用官方 `deepseek-flash`，只传自编样例：16 条进行两轮测试，另加 1 条治疗动作的针对性检查，共 33 次请求；没有读取用户聊天或修改生产配置。最终结果见 [评测原始输出](evaluations/glossary-2026-10-27.json)。脚本 `server/translate-proxy/scripts/evaluate-glossary.mjs --live` 必须主动提供 `DEEPSEEK_API_KEY` 才会计费调用；默认测试和每周维护不会执行它。
- 第一轮发现并修正：WoW 的“等治疗”被误解成等一次加血；冷却时间表达含糊；俄语“开雾”出现逐字翻译；“等我”的对象被省略。第二轮检查这些点得到正确或更明确的表达；额外验证“治疗我，别去开怪”仍译为 “Heal me, don't pull.”，避免把治疗动作误当成职业。最终 17 条均以 `finish_reason=stop` 完成，否定、数值和游戏实体的关键验收点保留。
- 模型仍可能展开 BKB 为 Black King Bar；Toxic 可增加语气词。这些样例不证明所有翻译准确，也没有盲测对照或线上准确率提升百分比。俄语自然度仍适合结合母语玩家反馈继续打磨。
- 最终样例在服务器到模型的单次调用耗时为 394–978 ms，中位数 685 ms。此数据使用 128 输出 token 上限和 0.05 温度，不含桌面复制/粘贴或完整代理链路，不能与生产 P50/P95 直接做前后比较。

## 生效与回滚

2026-10-27 迁移验证：服务器 Node 20.20.2 上 31 项单元测试及两套 smoke 通过；官方来源抓取成功，内容无变化。另建隔离 systemd 服务实测候选词表生效，并在切换后主动终止更新进程，确认 `ExecStopPost` 恢复上一版、重启服务、校验实际修订号并清除待完成记录。模拟版本只存在于隔离测试服务，未进入生产词表。

v0.9.16 已完成首次部署。服务器通过 `GLOSSARY_OFFICIAL_PATH=/var/lib/lingo-glossary/current/official.json` 加载独立保存的官方词表；未设置此项的本地开发或容器仍使用随代码打包的词表。显式指定的路径缺失或损坏时启动失败，不静默退回过期数据。源码中的 `glossary-files.mjs`、`glossary.mjs`、提示词和人工别名需随代码一起部署。

词表更新无需重新发布桌面客户端。自动切换通过服务重启加载，因此变化发生时有一次短暂重启；应用内缓存随之重建。每次生效后以 GET `/translate` 的 `glossary.revision` 和 `prompt_revision` 为准。`last-run.json` 保存最近一次状态，systemd 日志保存测试和失败记录。若需要人工回滚，先停 timer/service，再将 `current` 原子指向已保留的快照，重启并核对修订号；恢复健康后再启动 timer。
