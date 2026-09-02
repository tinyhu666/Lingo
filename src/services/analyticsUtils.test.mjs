import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAnalyticsDayKey,
  normalizeAnalyticsQueue,
  normalizeAnalyticsState,
} from './analyticsUtils.js';

test('getAnalyticsDayKey uses Asia/Shanghai day boundaries', () => {
  assert.equal(getAnalyticsDayKey(new Date('2026-03-28T15:59:59.000Z')), '2026-03-28');
  assert.equal(getAnalyticsDayKey(new Date('2026-03-28T16:00:00.000Z')), '2026-03-29');
});

test('normalizeAnalyticsState strips invalid values and preserves strings', () => {
  assert.deepEqual(
    normalizeAnalyticsState({
      last_seen_version: ' 0.6.2 ',
      last_active_ping_date: '',
      install_reported_at: 123,
    }),
    {
      last_seen_version: '0.6.2',
      last_active_ping_date: null,
      install_reported_at: null,
    },
  );

  assert.deepEqual(normalizeAnalyticsState(null), {
    last_seen_version: null,
    last_active_ping_date: null,
    install_reported_at: null,
  });
});

test('normalizeAnalyticsQueue keeps only valid events within queue limit', () => {
  const normalized = normalizeAnalyticsQueue([
    {
      installation_id: ' install-1 ',
      event_name: 'app_launch',
      occurred_at: '2026-03-28T12:00:00.000Z',
      session_id: ' session-1 ',
      ui_locale: ' zh-CN ',
    },
    {
      installation_id: '',
      event_name: 'app_launch',
      occurred_at: '2026-03-28T12:00:00.000Z',
    },
  ]);

  assert.deepEqual(normalized, [
    {
      installation_id: 'install-1',
      event_name: 'app_launch',
      occurred_at: '2026-03-28T12:00:00.000Z',
      session_id: 'session-1',
      analytics_day: '2026-03-28',
      platform: null,
      app_version: null,
      ui_locale: 'zh-CN',
      runtime: null,
      previous_app_version: null,
      current_app_version: null,
    },
  ]);
});

test('normalizeAnalyticsQueue preserves bounded translation diagnostics without text content', () => {
  const [event] = normalizeAnalyticsQueue([
    {
      installation_id: 'install-1',
      event_name: 'translation_diagnostic',
      occurred_at: '2026-09-02T09:00:00.000Z',
      operation_id: 'operation-1',
      stage: 'request',
      status: 'failed',
      elapsed_ms: 1568.4,
      text_length: 12,
      translation_from: 'zh',
      translation_to: 'en',
      error_code: 'request_failed',
      error_message: 'x'.repeat(600),
      source_text: '不会被保留',
    },
  ]);

  assert.equal(event.operation_id, 'operation-1');
  assert.equal(event.elapsed_ms, 1568);
  assert.equal(event.text_length, 12);
  assert.equal(event.error_message.length, 500);
  assert.equal('source_text' in event, false);
});

test('normalizeAnalyticsQueue rejects incomplete translation diagnostics', () => {
  assert.deepEqual(
    normalizeAnalyticsQueue([
      {
        installation_id: 'install-1',
        event_name: 'translation_diagnostic',
        occurred_at: '2026-09-02T09:00:00.000Z',
        operation_id: 'operation-1',
        stage: 'request',
      },
    ]),
    [],
  );
});
