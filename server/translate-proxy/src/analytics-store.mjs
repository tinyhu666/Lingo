import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ANALYTICS_TIMEZONE = 'Asia/Shanghai';
const SUSPECTED_UNINSTALL_WINDOW_DAYS = 30;
const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = process.env.ANALYTICS_DB_PATH || join(moduleDir, '..', 'data', 'analytics.sqlite');
const MAX_BATCH_EVENTS = 100;
const ALLOWED_EVENT_NAMES = new Set([
  'install_registered',
  'app_launch',
  'app_active_ping',
  'update_applied',
]);

const dayKeyFormatters = new Map();

const getDayKeyFormatter = (timeZone = ANALYTICS_TIMEZONE) => {
  if (!dayKeyFormatters.has(timeZone)) {
    dayKeyFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }

  return dayKeyFormatters.get(timeZone);
};

const getDayKey = (date = new Date(), timeZone = ANALYTICS_TIMEZONE) => {
  const formatter = getDayKeyFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const partMap = parts.reduce((acc, item) => {
    if (item.type !== 'literal') {
      acc[item.type] = item.value;
    }
    return acc;
  }, {});

  return `${partMap.year}-${partMap.month}-${partMap.day}`;
};

const toNonEmptyString = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const coerceIsoDate = (value) => {
  const normalized = toNonEmptyString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const parseRangeDate = (value) => {
  const normalized = toNonEmptyString(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : normalized;
};

const normalizeRange = ({ from, to, maxDays = 90 } = {}) => {
  const today = getDayKey();
  let normalizedFrom = parseRangeDate(from);
  let normalizedTo = parseRangeDate(to);

  if (!normalizedTo) {
    normalizedTo = today;
  }

  if (!normalizedFrom) {
    normalizedFrom = getDayKey(addDays(new Date(`${normalizedTo}T00:00:00.000Z`), -(maxDays - 1)));
  }

  if (normalizedFrom > normalizedTo) {
    const temp = normalizedFrom;
    normalizedFrom = normalizedTo;
    normalizedTo = temp;
  }

  const range = [];
  let cursor = new Date(`${normalizedFrom}T00:00:00.000Z`);
  const end = new Date(`${normalizedTo}T00:00:00.000Z`);

  while (cursor <= end && range.length < maxDays) {
    range.push(getDayKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return {
    from: range[0] || today,
    to: range[range.length - 1] || today,
    days: range,
  };
};

const ensureAnalyticsDir = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

const createDatabase = () => {
  ensureAnalyticsDir(DEFAULT_DB_PATH);
  const db = new Database(DEFAULT_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      installation_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT '',
      analytics_day TEXT NOT NULL,
      platform TEXT,
      app_version TEXT,
      ui_locale TEXT,
      runtime TEXT,
      inserted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (installation_id, event_name, occurred_at, session_id)
    );

    CREATE INDEX IF NOT EXISTS analytics_events_day_event_idx
      ON analytics_events (analytics_day, event_name);

    CREATE TABLE IF NOT EXISTS analytics_installations (
      installation_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      install_reported_at TEXT,
      last_active_ping_at TEXT,
      latest_platform TEXT,
      latest_app_version TEXT,
      latest_ui_locale TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS analytics_installations_last_active_idx
      ON analytics_installations (last_active_ping_at);
  `);

  return db;
};

const db = createDatabase();

const insertEventStatement = db.prepare(`
  INSERT OR IGNORE INTO analytics_events (
    installation_id,
    event_name,
    occurred_at,
    session_id,
    analytics_day,
    platform,
    app_version,
    ui_locale,
    runtime
  ) VALUES (
    @installation_id,
    @event_name,
    @occurred_at,
    @session_id,
    @analytics_day,
    @platform,
    @app_version,
    @ui_locale,
    @runtime
  )
`);

const upsertInstallationStatement = db.prepare(`
  INSERT INTO analytics_installations (
    installation_id,
    first_seen_at,
    install_reported_at,
    last_active_ping_at,
    latest_platform,
    latest_app_version,
    latest_ui_locale,
    updated_at
  ) VALUES (
    @installation_id,
    @first_seen_at,
    @install_reported_at,
    @last_active_ping_at,
    @latest_platform,
    @latest_app_version,
    @latest_ui_locale,
    @updated_at
  )
  ON CONFLICT(installation_id) DO UPDATE SET
    first_seen_at = CASE
      WHEN excluded.first_seen_at < analytics_installations.first_seen_at
        THEN excluded.first_seen_at
      ELSE analytics_installations.first_seen_at
    END,
    install_reported_at = CASE
      WHEN excluded.install_reported_at IS NULL THEN analytics_installations.install_reported_at
      WHEN analytics_installations.install_reported_at IS NULL THEN excluded.install_reported_at
      WHEN excluded.install_reported_at < analytics_installations.install_reported_at
        THEN excluded.install_reported_at
      ELSE analytics_installations.install_reported_at
    END,
    last_active_ping_at = CASE
      WHEN excluded.last_active_ping_at IS NULL THEN analytics_installations.last_active_ping_at
      WHEN analytics_installations.last_active_ping_at IS NULL THEN excluded.last_active_ping_at
      WHEN excluded.last_active_ping_at > analytics_installations.last_active_ping_at
        THEN excluded.last_active_ping_at
      ELSE analytics_installations.last_active_ping_at
    END,
    latest_platform = COALESCE(excluded.latest_platform, analytics_installations.latest_platform),
    latest_app_version = COALESCE(excluded.latest_app_version, analytics_installations.latest_app_version),
    latest_ui_locale = COALESCE(excluded.latest_ui_locale, analytics_installations.latest_ui_locale),
    updated_at = excluded.updated_at
`);

const eventCountStatement = db.prepare(`
  SELECT
    analytics_day,
    event_name,
    COUNT(*) AS total_count,
    COUNT(DISTINCT installation_id) AS unique_installations
  FROM analytics_events
  WHERE analytics_day BETWEEN ? AND ?
  GROUP BY analytics_day, event_name
`);

const installationsStatement = db.prepare(`
  SELECT
    installation_id,
    install_reported_at,
    last_active_ping_at,
    latest_platform,
    latest_app_version,
    latest_ui_locale
  FROM analytics_installations
`);

const overviewTotalsStatement = db.prepare(`
  SELECT COUNT(*) AS installations_total
  FROM analytics_installations
`);

const activeInstallationsStatement = db.prepare(`
  SELECT COUNT(*) AS active_installations_30d
  FROM analytics_installations
  WHERE last_active_ping_at IS NOT NULL
    AND last_active_ping_at >= ?
`);

const platformDistributionStatement = db.prepare(`
  SELECT
    COALESCE(latest_platform, 'unknown') AS platform,
    COUNT(*) AS count
  FROM analytics_installations
  GROUP BY platform
  ORDER BY count DESC
`);

const versionDistributionStatement = db.prepare(`
  SELECT
    COALESCE(latest_app_version, 'unknown') AS version,
    COUNT(*) AS count
  FROM analytics_installations
  GROUP BY version
  ORDER BY count DESC
  LIMIT 15
`);

const localeDistributionStatement = db.prepare(`
  SELECT
    COALESCE(latest_ui_locale, 'unknown') AS locale,
    COUNT(*) AS count
  FROM analytics_installations
  GROUP BY locale
  ORDER BY count DESC
  LIMIT 15
`);

const newInstallsTrendStatement = db.prepare(`
  SELECT
    analytics_day,
    COUNT(DISTINCT installation_id) AS installs
  FROM analytics_events
  WHERE event_name = 'install_registered'
    AND analytics_day BETWEEN ? AND ?
  GROUP BY analytics_day
  ORDER BY analytics_day
`);

const normalizeAnalyticsEvent = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const installationId = toNonEmptyString(value.installation_id);
  const eventName = toNonEmptyString(value.event_name);
  const occurredAt = coerceIsoDate(value.occurred_at);
  if (!installationId || !eventName || !occurredAt || !ALLOWED_EVENT_NAMES.has(eventName)) {
    return null;
  }

  const occurredDate = new Date(occurredAt);
  return {
    installation_id: installationId,
    event_name: eventName,
    occurred_at: occurredAt,
    session_id: toNonEmptyString(value.session_id) || '',
    analytics_day: parseRangeDate(value.analytics_day) || getDayKey(occurredDate),
    platform: toNonEmptyString(value.platform),
    app_version: toNonEmptyString(value.app_version),
    ui_locale: toNonEmptyString(value.ui_locale),
    runtime: toNonEmptyString(value.runtime),
  };
};

const ingestTransaction = db.transaction((events) => {
  let inserted = 0;
  let duplicates = 0;

  for (const event of events) {
    const result = insertEventStatement.run(event);
    if (result.changes > 0) {
      inserted += 1;
    } else {
      duplicates += 1;
    }

    upsertInstallationStatement.run({
      installation_id: event.installation_id,
      first_seen_at: event.occurred_at,
      install_reported_at: event.event_name === 'install_registered' ? event.occurred_at : null,
      last_active_ping_at: event.event_name === 'app_active_ping' ? event.occurred_at : null,
      latest_platform: event.platform,
      latest_app_version: event.app_version,
      latest_ui_locale: event.ui_locale,
      updated_at: new Date().toISOString(),
    });
  }

  return {
    accepted: events.length,
    inserted,
    duplicates,
  };
});

export const ingestAnalyticsEvents = (inputEvents = []) => {
  const normalizedEvents = (Array.isArray(inputEvents) ? inputEvents : [])
    .slice(0, MAX_BATCH_EVENTS)
    .map(normalizeAnalyticsEvent)
    .filter(Boolean);

  if (!normalizedEvents.length) {
    return {
      accepted: 0,
      inserted: 0,
      duplicates: 0,
    };
  }

  return ingestTransaction(normalizedEvents);
};

const buildDailyMetricMap = (range) =>
  range.days.reduce((acc, day) => {
    acc.set(day, {
      date: day,
      dau: 0,
      launches: 0,
      installs: 0,
      suspected_uninstalls: 0,
    });
    return acc;
  }, new Map());

const accumulateInstallationLifecycle = (metricMap, now = new Date()) => {
  const nowMs = now.getTime();
  const inactivityThresholdMs = nowMs - SUSPECTED_UNINSTALL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let suspectedCurrent = 0;

  for (const row of installationsStatement.iterate()) {
    if (row.last_active_ping_at) {
      const lastActiveDate = new Date(row.last_active_ping_at);
      if (!Number.isNaN(lastActiveDate.getTime())) {
        if (lastActiveDate.getTime() <= inactivityThresholdMs) {
          suspectedCurrent += 1;
        }

        const suspectedDate = addDays(lastActiveDate, SUSPECTED_UNINSTALL_WINDOW_DAYS);
        const suspectedDay = getDayKey(suspectedDate);
        const dayMetrics = metricMap.get(suspectedDay);
        if (dayMetrics) {
          dayMetrics.suspected_uninstalls += 1;
        }
      }
    }
  }

  return suspectedCurrent;
};

export const queryAnalyticsDaily = ({ from, to } = {}) => {
  const range = normalizeRange({ from, to });
  const metricMap = buildDailyMetricMap(range);

  for (const row of eventCountStatement.all(range.from, range.to)) {
    const dayMetrics = metricMap.get(row.analytics_day);
    if (!dayMetrics) {
      continue;
    }

    if (row.event_name === 'app_active_ping') {
      dayMetrics.dau = Number(row.unique_installations || 0);
    } else if (row.event_name === 'app_launch') {
      dayMetrics.launches = Number(row.total_count || 0);
    } else if (row.event_name === 'install_registered') {
      dayMetrics.installs = Number(row.unique_installations || 0);
    }
  }

  accumulateInstallationLifecycle(metricMap);

  return {
    timezone: ANALYTICS_TIMEZONE,
    from: range.from,
    to: range.to,
    days: range.days.map((day) => metricMap.get(day)),
  };
};

export const queryAnalyticsOverview = () => {
  const today = getDayKey();
  const daily = queryAnalyticsDaily({ from: today, to: today });
  const todayMetrics = daily.days[0] || {
    dau: 0,
    launches: 0,
    installs: 0,
    suspected_uninstalls: 0,
  };
  const now = new Date();
  const activeSinceIso = addDays(now, -SUSPECTED_UNINSTALL_WINDOW_DAYS).toISOString();
  const totals = overviewTotalsStatement.get() || { installations_total: 0 };
  const active = activeInstallationsStatement.get(activeSinceIso) || { active_installations_30d: 0 };

  const suspectedMetricMap = buildDailyMetricMap({
    from: today,
    to: today,
    days: [today],
  });
  const suspectedCurrent = accumulateInstallationLifecycle(suspectedMetricMap, now);

  return {
    generated_at: now.toISOString(),
    timezone: ANALYTICS_TIMEZONE,
    metrics: {
      dau_today: todayMetrics.dau,
      launches_today: todayMetrics.launches,
      installs_today: todayMetrics.installs,
      installations_total: Number(totals.installations_total || 0),
      active_installations_30d: Number(active.active_installations_30d || 0),
      suspected_uninstalls_current: suspectedCurrent,
    },
  };
};

export const queryAnalyticsDistributions = () => {
  const platforms = platformDistributionStatement.all().map((row) => ({
    name: row.platform,
    count: Number(row.count),
  }));

  const versions = versionDistributionStatement.all().map((row) => ({
    name: row.version,
    count: Number(row.count),
  }));

  const locales = localeDistributionStatement.all().map((row) => ({
    name: row.locale,
    count: Number(row.count),
  }));

  return { platforms, versions, locales };
};
