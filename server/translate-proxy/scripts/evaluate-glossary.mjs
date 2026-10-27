import { readFile } from 'node:fs/promises';
import { buildSystemPrompt, PROMPT_REVISION } from '../src/translation-prompt.mjs';

// Deliberately opt-in: unit tests and scheduled catalog sync never spend API credits.
// Output contains synthetic fixture text only; no real chat or credential is recorded.
if (!process.argv.includes('--live')) {
  throw new Error('Live evaluation is opt-in: set DEEPSEEK_API_KEY and pass --live. This sends synthetic quality cases to the official API.');
}
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');
const cases = JSON.parse(await readFile(new URL('../src/glossary/quality-cases.json', import.meta.url), 'utf8'));
const results = [];
for (const row of cases) {
  const started = performance.now();
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-flash', thinking: { type: 'disabled' }, temperature: 0.05, max_tokens: 128,
      messages: [{ role: 'system', content: buildSystemPrompt(row, row.text) }, { role: 'user', content: row.text }],
    }),
  });
  if (!response.ok) throw new Error(`Case ${row.id}: HTTP ${response.status}`);
  const body = await response.json();
  results.push({ ...row, output: body.choices?.[0]?.message?.content || '', finish_reason: body.choices?.[0]?.finish_reason,
    model: body.model, latency_ms: Math.round(performance.now() - started), usage: body.usage });
}
console.log(JSON.stringify({ prompt_revision: PROMPT_REVISION, evaluated_at: new Date().toISOString(), results }, null, 2));
