import { modelRequestOptions } from './model-request-options.mjs';

// Everything that talks to a model provider lives here so the retry,
// truncation and hedging policies can be unit-tested with a fake fetch.

const summarizeText = (value) => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '<empty>';
  }
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
};

const extractErrorMessage = (payload) => {
  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }
  if (typeof payload?.error?.message === 'string' && payload.error.message.trim()) {
    return payload.error.message.trim();
  }
  return '';
};

const readJsonResponse = async (response) => {
  const raw = await response.text();
  if (!raw.trim()) {
    return { json: {}, raw };
  }
  try {
    return { json: JSON.parse(raw), raw };
  } catch {
    return { json: null, raw };
  }
};

const extractOpenAIContent = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim();
  }
  return '';
};

const extractAnthropicContent = (payload) =>
  Array.isArray(payload?.content)
    ? payload.content
        .map((item) => (typeof item?.text === 'string' ? item.text : ''))
        .join('')
        .trim()
    : '';

const isTruncated = (payload, provider) => {
  if (provider === 'anthropic') {
    return payload?.stop_reason === 'max_tokens';
  }
  return payload?.choices?.[0]?.finish_reason === 'length';
};

const upstreamError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  error.fromUpstream = true;
  return error;
};

export const shouldRetryEmptyResponse = (error) =>
  String(error?.message || '').includes('Empty model response');

export const createModelClient = ({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
  logger = console,
} = {}) => {
  const requestOnce = async ({
    config,
    apiKey,
    systemPrompt,
    text,
    traceId,
    effectiveMaxTokens,
    effectiveTemperature,
    timeoutMs,
    signal,
  }) => {
    const startedAt = now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = schedule(abort, timeoutMs);
    if (signal) {
      if (signal.aborted) {
        abort();
      } else {
        signal.addEventListener('abort', abort, { once: true });
      }
    }

    try {
      const anthropic = config.provider === 'anthropic';
      const response = await fetchImpl(config.api_url, {
        method: 'POST',
        headers: anthropic
          ? {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            }
          : {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
        signal: controller.signal,
        body: JSON.stringify(
          anthropic
            ? {
                model: config.model_name,
                system: systemPrompt,
                max_tokens: effectiveMaxTokens,
                temperature: effectiveTemperature,
                messages: [{ role: 'user', content: text }],
              }
            : {
                model: config.model_name,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: text },
                ],
                ...modelRequestOptions(config, effectiveMaxTokens, effectiveTemperature),
              },
        ),
      });

      const { json: body, raw } = await readJsonResponse(response);
      if (!response.ok) {
        throw upstreamError(
          extractErrorMessage(body) ||
            `${anthropic ? 'Anthropic' : 'Model'} request failed (HTTP ${response.status}): ${summarizeText(raw)}`,
          response.status,
        );
      }

      const translatedText = anthropic ? extractAnthropicContent(body) : extractOpenAIContent(body);
      if (!translatedText) {
        logger.warn(
          JSON.stringify({
            trace_id: traceId,
            provider: config.provider,
            model: config.model_name,
            message: `${anthropic ? 'Anthropic' : 'OpenAI-compatible provider'} returned empty content`,
            raw_summary: summarizeText(raw),
          }),
        );
        throw upstreamError('Empty model response', 502);
      }

      return {
        translatedText,
        truncated: isTruncated(body, config.provider),
        modelLatencyMs: now() - startedAt,
      };
    } finally {
      cancel(timer);
      if (signal) {
        signal.removeEventListener('abort', abort);
      }
    }
  };

  /**
   * One model call with the full policy:
   *  - a hedged duplicate request after `hedgeAfterMs` when the first one is
   *    still pending (tail-latency insurance; the loser is aborted),
   *  - one retry with a larger token budget when the output was cut off,
   *  - one retry when the provider returned empty content.
   * All of it shares a single deadline of `config.timeout_ms`.
   */
  const requestModel = async ({
    config,
    apiKey,
    systemPrompt,
    text,
    traceId,
    effectiveMaxTokens,
    effectiveTemperature,
    hedgeAfterMs = 0,
    maxTokensCeiling = effectiveMaxTokens,
  }) => {
    const startedAt = now();
    const deadline = startedAt + config.timeout_ms;
    const remaining = () => Math.max(0, deadline - now());
    let attemptCount = 0;

    const base = { config, apiKey, text, traceId, effectiveTemperature };

    const runHedged = async (options) => {
      const primaryAbort = new AbortController();
      attemptCount += 1;
      const primary = requestOnce({ ...options, timeoutMs: remaining(), signal: primaryAbort.signal });

      if (!(hedgeAfterMs > 0) || remaining() <= hedgeAfterMs) {
        return { ...(await primary), hedged: false };
      }

      let hedgeTimer = null;
      let hedgeAbort = null;
      const hedge = new Promise((resolve) => {
        hedgeTimer = schedule(() => {
          hedgeAbort = new AbortController();
          attemptCount += 1;
          logger.warn(
            JSON.stringify({
              trace_id: traceId,
              provider: config.provider,
              model: config.model_name,
              message: 'Primary model call is slow, sending hedged duplicate',
              hedge_after_ms: hedgeAfterMs,
            }),
          );
          resolve(
            requestOnce({ ...options, timeoutMs: remaining(), signal: hedgeAbort.signal }).then(
              (result) => ({ result, source: 'hedge' }),
              (error) => ({ error, source: 'hedge' }),
            ),
          );
        }, hedgeAfterMs);
      });
      const tagged = primary.then(
        (result) => ({ result, source: 'primary' }),
        (error) => ({ error, source: 'primary' }),
      );

      const settle = async () => {
        const first = await Promise.race([tagged, hedge]);
        if (first.result) {
          return { ...first.result, hedged: first.source === 'hedge' };
        }
        // The first finisher failed; whoever is still running gets to answer.
        const other = first.source === 'primary' ? hedge : tagged;
        if (first.source === 'primary' && hedgeAbort === null && hedgeTimer !== null) {
          // The primary failed before the hedge timer fired; no duplicate exists.
          throw first.error;
        }
        const second = await other;
        if (second.result) {
          return { ...second.result, hedged: second.source === 'hedge' };
        }
        throw second.error;
      };

      try {
        return await settle();
      } finally {
        cancel(hedgeTimer);
        primaryAbort.abort();
        hedgeAbort?.abort();
      }
    };

    const runWithPolicies = async (options) => {
      const first = await runHedged(options);
      if (!first.truncated || options.effectiveMaxTokens >= maxTokensCeiling || remaining() <= 0) {
        return first;
      }
      const widened = Math.min(maxTokensCeiling, Math.max(options.effectiveMaxTokens * 2, options.effectiveMaxTokens + 16));
      logger.warn(
        JSON.stringify({
          trace_id: traceId,
          provider: config.provider,
          model: config.model_name,
          message: 'Model output was cut off, retrying with a larger token budget',
          max_tokens: options.effectiveMaxTokens,
          retry_max_tokens: widened,
        }),
      );
      try {
        attemptCount += 1;
        const retried = await requestOnce({ ...options, effectiveMaxTokens: widened, timeoutMs: remaining() });
        return { ...retried, hedged: first.hedged, widenedTokens: widened };
      } catch {
        // The cut-off text is still better than an error for the player.
        return first;
      }
    };

    try {
      const result = await runWithPolicies({ ...base, systemPrompt, effectiveMaxTokens });
      return { ...result, attemptCount, modelLatencyMs: now() - startedAt };
    } catch (error) {
      if (!shouldRetryEmptyResponse(error) || remaining() <= 0) {
        error.attemptCount = attemptCount;
        error.modelLatencyMs = now() - startedAt;
        throw error;
      }

      logger.warn(
        JSON.stringify({
          trace_id: traceId,
          provider: config.provider,
          model: config.model_name,
          message: 'Retrying translation after empty model response',
        }),
      );

      try {
        attemptCount += 1;
        const retryResult = await requestOnce({
          ...base,
          systemPrompt: `${systemPrompt} Never return an empty response.`,
          effectiveMaxTokens,
          timeoutMs: remaining(),
        });
        return { ...retryResult, hedged: false, attemptCount, modelLatencyMs: now() - startedAt };
      } catch (retryError) {
        retryError.attemptCount = attemptCount;
        retryError.modelLatencyMs = now() - startedAt;
        throw retryError;
      }
    }
  };

  return { requestOnce, requestModel };
};
