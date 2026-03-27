const args = process.argv.slice(2);

const getArgValue = (prefix, fallback = '') => {
  const matched = args.find((item) => item.startsWith(`${prefix}=`));
  return matched ? matched.slice(prefix.length + 1) : fallback;
};

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const baseUrl = String(
  getArgValue('--url') ||
    process.env.LINGO_DIAG_BASE_URL ||
    process.env.LINGO_BACKEND_URL ||
    process.env.TRANSLATE_PROXY_URL ||
    'http://127.0.0.1:8787',
).replace(/\/+$/, '');

const publicKey = String(
  getArgValue('--token') ||
    process.env.LINGO_BACKEND_ANON_KEY ||
    process.env.BACKEND_PUBLIC_KEY ||
    process.env.TRANSLATE_PROXY_PUBLIC_KEY ||
    '',
).trim();

const runs = clampInteger(getArgValue('--runs'), 3, 1, 50);
const delayMs = clampInteger(getArgValue('--delay-ms'), 250, 0, 10_000);

const baseScenarios = [
  {
    name: 'cold_translate_auto_dota2',
    buildPayload: (suffix) => ({
      text: `smoke and go rosh ${suffix}`,
      translation_from: 'en',
      translation_to: 'zh',
      translation_mode: 'auto',
      game_scene: 'dota2',
      daily_mode: false,
    }),
  },
  {
    name: 'repeat_translate_auto_dota2',
    buildPayload: (suffix) => ({
      text: `smoke and go rosh ${suffix}`,
      translation_from: 'en',
      translation_to: 'zh',
      translation_mode: 'auto',
      game_scene: 'dota2',
      daily_mode: false,
    }),
  },
  {
    name: 'rewrite_pro_other',
    buildPayload: (suffix) => ({
      text: `group after objective and end clean ${suffix}`,
      translation_from: 'en',
      translation_to: 'en',
      translation_mode: 'pro',
      game_scene: 'other',
      daily_mode: false,
    }),
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const expectOkJson = async (response) => {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${json.message || 'request failed'} trace_id=${json.trace_id || '-'}`);
  }
  return json;
};

const percentile = (values, ratio) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
};

const average = (values) => {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const rate = (count, total) => {
  if (total === 0) {
    return 0;
  }
  return Number(((count / total) * 100).toFixed(1));
};

const requestScenario = async ({ name, payload, iteration }) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (publicKey) {
    headers.Authorization = `Bearer ${publicKey}`;
    headers.apikey = publicKey;
  }

  const response = await fetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = await expectOkJson(response);
  const latencyMs = Number(json.latency_ms || 0);
  const modelLatencyMs = Number(json.model_latency_ms || 0);
  const proxyOverheadMs = Number(json.proxy_overhead_ms || Math.max(0, latencyMs - modelLatencyMs));
  const dominantStage = modelLatencyMs >= proxyOverheadMs ? 'model-dominant' : 'proxy-dominant';

  return {
    iteration,
    name,
    translatedText: json.translated_text,
    latencyMs,
    modelLatencyMs,
    proxyOverheadMs,
    dominantStage,
    modelRoute: json.model_route || '-',
    responseSource: json.response_source || '-',
    promptVariant: json.prompt_variant || '-',
    styleProfile: json.style_profile || '-',
    traceId: json.trace_id || '-',
  };
};

const printRow = (result) => {
  console.log(
    [
      `[diag] run=${result.iteration} ${result.name}`,
      `latency_ms=${result.latencyMs}`,
      `model_latency_ms=${result.modelLatencyMs}`,
      `proxy_overhead_ms=${result.proxyOverheadMs}`,
      `dominant=${result.dominantStage}`,
      `route=${result.modelRoute}`,
      `source=${result.responseSource}`,
      `variant=${result.promptVariant}`,
      `style=${result.styleProfile}`,
      `trace_id=${result.traceId}`,
    ].join(' '),
  );
};

const summarize = (name, results) => {
  const latencyValues = results.map((item) => item.latencyMs);
  const modelLatencyValues = results.map((item) => item.modelLatencyMs);
  const proxyOverheadValues = results.map((item) => item.proxyOverheadMs);
  const routeCounts = results.reduce((counts, item) => {
    counts[item.modelRoute] = (counts[item.modelRoute] || 0) + 1;
    return counts;
  }, {});
  const sourceCounts = results.reduce((counts, item) => {
    counts[item.responseSource] = (counts[item.responseSource] || 0) + 1;
    return counts;
  }, {});

  const summary = {
    name,
    runs: results.length,
    latencyP50: percentile(latencyValues, 0.5),
    latencyP95: percentile(latencyValues, 0.95),
    latencyAvg: average(latencyValues),
    modelLatencyAvg: average(modelLatencyValues),
    proxyOverheadAvg: average(proxyOverheadValues),
    fastLaneRate: rate(routeCounts['fast-lane'] || 0, results.length),
    fastFallbackRate: rate(routeCounts['fast-fallback'] || 0, results.length),
    primaryRate: rate(routeCounts.primary || 0, results.length),
    cacheHitRate: rate((sourceCounts['memory-cache'] || 0) + (sourceCounts['shared-inflight'] || 0), results.length),
    dominantStage: average(modelLatencyValues) >= average(proxyOverheadValues) ? 'model-dominant' : 'proxy-dominant',
  };

  console.log(
    [
      `[diag-summary] ${summary.name}`,
      `runs=${summary.runs}`,
      `p50=${summary.latencyP50}`,
      `p95=${summary.latencyP95}`,
      `avg=${summary.latencyAvg}`,
      `model_avg=${summary.modelLatencyAvg}`,
      `proxy_avg=${summary.proxyOverheadAvg}`,
      `fast_lane_rate=${summary.fastLaneRate}%`,
      `fast_fallback_rate=${summary.fastFallbackRate}%`,
      `primary_rate=${summary.primaryRate}%`,
      `cache_hit_rate=${summary.cacheHitRate}%`,
      `dominant=${summary.dominantStage}`,
    ].join(' '),
  );

  return summary;
};

try {
  console.log(`[diag] base_url=${baseUrl}`);
  console.log(`[diag] runs=${runs} delay_ms=${delayMs}`);
  if (!publicKey) {
    console.log('[diag] public key not provided; assuming proxy auth is disabled.');
  }

  const groupedResults = new Map(baseScenarios.map((scenario) => [scenario.name, []]));

  for (let iteration = 1; iteration <= runs; iteration += 1) {
    const suffix = `iter-${iteration}-${Date.now()}`;

    for (const scenario of baseScenarios) {
      const scenarioSuffix = scenario.name === 'rewrite_pro_other' ? suffix : suffix;
      const payload = scenario.buildPayload(scenarioSuffix);
      const result = await requestScenario({
        name: scenario.name,
        payload,
        iteration,
      });
      groupedResults.get(scenario.name).push(result);
      printRow(result);
      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  const summaries = [...groupedResults.entries()].map(([name, results]) => summarize(name, results));
  const cold = summaries.find((item) => item.name === 'cold_translate_auto_dota2');
  const repeat = summaries.find((item) => item.name === 'repeat_translate_auto_dota2');
  const rewrite = summaries.find((item) => item.name === 'rewrite_pro_other');

  const feasibility =
    cold.fastFallbackRate >= 50 || cold.latencyP50 >= 6_000
      ? 'not-viable'
      : cold.fastLaneRate >= 50 && cold.latencyP50 <= 4_000
        ? 'viable'
        : 'borderline';

  console.log(
    [
      '[diag-conclusion]',
      `cold_dominant=${cold.dominantStage}`,
      `cold_fast_fallback_rate=${cold.fastFallbackRate}%`,
      `repeat_cache_hit_rate=${repeat.cacheHitRate}%`,
      `rewrite_fast_lane_rate=${rewrite.fastLaneRate}%`,
      `assessment=${feasibility}`,
    ].join(' '),
  );
} catch (error) {
  console.error('[diag] failed:', error?.message || error);
  process.exitCode = 1;
}
