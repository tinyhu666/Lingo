export const LANGUAGE_OPTIONS = [
  { id: 'zh', label: '中文', countryCode: 'CN' },
  { id: 'en-SEA', label: '东南亚英语', countryCode: 'SG' },
  { id: 'ko', label: '韩文', countryCode: 'KR' },
  { id: 'en', label: '英文', countryCode: 'US' },
  { id: 'fr', label: '法文', countryCode: 'FR' },
  { id: 'ru', label: '俄文', countryCode: 'RU' },
  { id: 'es', label: '西班牙文', countryCode: 'ES' },
  { id: 'ja', label: '日文', countryCode: 'JP' },
  { id: 'de', label: '德文', countryCode: 'DE' },
];

export const LANGUAGE_MAP = LANGUAGE_OPTIONS.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const getLanguageMeta = (id) => LANGUAGE_MAP[id] || LANGUAGE_MAP.zh;
