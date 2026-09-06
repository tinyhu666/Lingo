# Translation fallback comparison — 2026-09-06

Decision: keep `deepseek-v4-flash` primary, then `deepseek-v4-pro`, then
`glm-5.3-flash` with thinking enabled and `reasoning_effort: low`.

## Method

Run from the Tencent production host at 17:27–17:30 China time, using isolated
direct official API calls. Six identical Chinese game-chat inputs translated to
English or Russian, repeated twice per model (12 measured requests each), with
one excluded warmup per model. Model order rotates between requests. Latency is
time to the complete response, using pooled Node fetch connections and a
10-second per-call deadline. This is a small operational sample, not a general
model performance or quality ranking.

GLM requests use thinking enabled, low effort, temperature 1, max_tokens 1024;
DeepSeek Pro uses thinking disabled, temperature 0.12, max_tokens 96. These are
translation-oriented settings rather than identical token budgets. Production
Pro retains its existing temperature 0.2. Successful responses must be HTTP 200,
nonempty, different from the source, and finish with `stop`; this is an availability
check, not a comprehensive linguistic evaluation.

## Results

| Model / mode | Success within 10 s | Median of successes | Slowest success | Over 5 s, including timeouts |
| --- | ---: | ---: | ---: | ---: |
| DeepSeek v4 Pro / thinking disabled | 12/12 | 0.947 s | 1.303 s | 0/12 |
| GLM 5.3 Flash / thinking low | 11/12 | 1.064 s | 2.417 s | 1/12 |
| GLM 5.3 / thinking low | 11/12 | 5.067 s | 9.856 s | 7/12 |

Both GLM variants had one request aborted at 10 seconds. Timeouts are excluded
from successful-response medians and maxima but included in failure/over-5-second
counts. Do not interpret the successful maximum as a bound for all requests.

The requested `glm-5.3` with thinking disabled is unavailable: the official API
returned HTTP 400, code 1210, stating the model always thinks and accepts only
low/high/max. Its 155 ms rejection is not translation latency. The regular model
above therefore uses the lowest supported effort as an explicitly labeled
substitute. [Official GLM 5.3 documentation](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)
and [Flash documentation](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash).

## Measured latency by sample

Values are milliseconds; each cell lists round 1 / round 2.

| Chinese source → target | Pro | GLM Flash low | GLM low |
| --- | ---: | ---: | ---: |
| 等我一下，我们一起推中路 → English | 874 / 923 | 856 / 935 | 930 / ≥10000 timeout |
| 我们先撤退，等队友复活 → Russian | 933 / 1303 | 1323 / 1510 | 1283 / 6164 |
| 队友还没到，先别开团 → English | 1165 / 960 | 859 / 1108 | 1021 / 5067 |
| 对面没买活，直接推高地 → Russian | 654 / 1058 | ≥10000 timeout / 1002 | 7726 / 7809 |
| 今晚八点一起打游戏吗 → English | 577 / 741 | 1064 / 2417 | 7489 / 1107 |
| 你出蝴蝶吗？ → Russian | 962 / 967 | 1219 / 1025 | 9856 / 2441 |

## Runtime budget

Primary and fast lane: 4 seconds; Pro fallback: 4 seconds; GLM Flash fallback:
5 seconds. The sequential upstream budget is 13 seconds, leaving transport
headroom within the desktop client's 15-second request deadline. Empty-response
retries share their route deadline. GLM adds a different official provider for
DeepSeek-wide outages. Regular GLM 5.3 is excluded because its supported low mode
exceeded the proposed 5-second fallback budget on 7 of 12 requests.
