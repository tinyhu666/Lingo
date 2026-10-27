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

更新时先审查新增、改名、删除清单，再补人工别名和验收样例。抓取失败、语言回退、条目明显减少（相对旧表超过 20%）、必需游戏缺失或现有别名引用失效会终止更新并保留旧文件。没有内容变化时不重写日期和版本。网站改版导致解析失败时应修解析器，不要用猜测的名称补齐。官方更新与人工别名应分别审查。

Codex 已启用本聊天的每周维护任务：每周一 10:00，Asia/Shanghai。核对官方源、处理可验证的变化、运行测试并更新本文变更记录；无变化保持安静，有实质变化、失败或需人工判断时报告。任务不会自动部署、重启服务、发布客户端或运行计费模型评测。它是 Codex 的维护任务，不是生产服务器上的 cron。

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

本地验收时尚未部署；本次改动纳入 v0.9.16 发布，实际发布状态见 [GitHub Release](https://github.com/tinyhu666/lingo/releases/tag/v0.9.16)。正式词表部署路径为 `/opt/lingo-translate-proxy/src/glossary/`，翻译由服务端读取，本地仓库保留可审查与回滚的版本副本。发布时需连同 `src/translation-prompt.mjs`、`src/glossary.mjs` 和 `src/glossary/*.json` 一起部署；现有 Dockerfile/部署流程复制整个 `src`，已包含这些文件。词表在服务启动时读取，更新生产文件后需要通过既有发布流程重启服务才能生效。无需为词表更新重新发布桌面客户端。

发布前运行上述回归；发布后检查 `/healthz` 与 GET `/translate` 的修订号并做少量实际翻译验收。保留上一版服务包和词表，失败时整体回滚，避免脚本与 JSON 引用不一致。此文档不授权自动生产发布。
