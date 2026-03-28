export const ANALYTICS_TIMEZONE = 'Asia/Shanghai';
export const ANALYTICS_QUEUE_LIMIT = 200;

export const EMPTY_ANALYTICS_STATE = Object.freeze({
  last_seen_version: null,
  last_active_ping_date: null,
  install_reported_at: null,
});

const dayKeyFormatters = new Map();

export const toNonEmptyString = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

export const coerceIsoTimestamp = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

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

export const normalizeAnalyticsState = (value) => {
  const source = value && typeof value === 'object' ? value : {};

  return {
    last_seen_version: toNonEmptyString(source.last_seen_version),
    last_active_ping_date: toNonEmptyString(source.last_active_ping_date),
    install_reported_at: coerceIsoTimestamp(source.install_reported_at),
  };
};

const getDayKeyFormatter = (timeZone) => {
  const cacheKey = timeZone || ANALYTICS_TIMEZONE;
  if (!dayKeyFormatters.has(cacheKey)) {
    dayKeyFormatters.set(
      cacheKey,
      new Intl.DateTimeFormat('en', {
        timeZone: cacheKey,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }

  return dayKeyFormatters.get(cacheKey);
};

export const getAnalyticsDayKey = (date = new Date(), timeZone = ANALYTICS_TIMEZONE) => {
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

export const normalizeAnalyticsEvent = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const installationId = toNonEmptyString(value.installation_id);
  const eventName = toNonEmptyString(value.event_name);
  const occurredAt = coerceIsoTimestamp(value.occurred_at);
  if (!installationId || !eventName || !occurredAt) {
    return null;
  }

  const occurredDate = new Date(occurredAt);

  return {
    installation_id: installationId,
    event_name: eventName,
    occurred_at: occurredAt,
    session_id: toNonEmptyString(value.session_id) || '',
    analytics_day: toNonEmptyString(value.analytics_day) || getAnalyticsDayKey(occurredDate),
    platform: toNonEmptyString(value.platform),
    app_version: toNonEmptyString(value.app_version),
    ui_locale: toNonEmptyString(value.ui_locale),
    runtime: toNonEmptyString(value.runtime),
    previous_app_version: toNonEmptyString(value.previous_app_version),
    current_app_version: toNonEmptyString(value.current_app_version),
  };
};

export const normalizeAnalyticsQueue = (value) => {
  const items = Array.isArray(value) ? value : [];
  return items
    .map(normalizeAnalyticsEvent)
    .filter(Boolean)
    .slice(-ANALYTICS_QUEUE_LIMIT);
};
