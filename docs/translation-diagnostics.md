# 翻译问题排查

每次翻译在后台生成内部操作 ID。该 ID 贯穿复制、请求、模型响应和粘贴阶段；网络重试仍使用同一 ID，但不会展示给用户。

## 查询最近问题

```bash
curl -sS \
  -H "Authorization: Bearer $LINGO_ADMIN_TOKEN" \
  "https://buffpp.com/admin/translation-diagnostics?status=failed&limit=100"
```

收到反馈后，可以根据用户描述的发生时间查询。时间使用 ISO 8601，默认返回最近 100 条，`limit` 最大为 500：

```text
/admin/translation-diagnostics?from=2026-09-02T09:00:00Z&to=2026-09-02T09:10:00Z&limit=200
```

定位到一条记录后，可以继续使用内部 `operation_id`、`trace_id` 或 `installation_id` 查询完整链路：

```text
/admin/translation-diagnostics?trace_id=<trace_id>
/admin/translation-diagnostics?installation_id=<installation_id>&limit=200
```

接口仅接受管理员令牌。诊断记录保留 30 天。

## 如何判断问题阶段

- 没有 `copy completed`：快捷键模拟或系统辅助功能权限问题。
- `copy completed` 后出现 `clipboard_read failed`：没有选中文本，或目标应用复制响应太慢。
- `request started` 后失败：结合服务端 `server_response` 的 `trace_id`、`http_status`、`model_route` 和 `error_code` 排查上游模型或网络。
- `request completed` 后出现 `paste failed`：翻译已返回，问题在剪贴板写入或目标应用粘贴。
- `busy skipped`：用户在上一笔翻译尚未完成时重复触发。
- `pipeline succeeded`：客户端已完成粘贴；若用户仍未看到文本，应重点检查目标应用是否拦截模拟按键。

服务端 JSON 日志也包含同一 `operation_id`。需要查看模型降级等中间过程时，可按该编号找到终态日志的 `trace_id`，再用 `trace_id` 串起同一次服务端请求。

诊断数据只保存阶段、耗时、字符数、语言配置、版本、错误分类和关联 ID，不设置原文或译文字段。
