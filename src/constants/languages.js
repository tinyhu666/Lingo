const localeBucket = (locale = 'zh-CN') => {
  const raw = String(locale || '').toLowerCase();
  if (raw.startsWith('en')) {
    return 'en';
  }
  if (raw.startsWith('ru')) {
    return 'ru';
  }
  return 'zh';
};

export const LANGUAGE_OPTIONS = [
  {
    id: 'zh',
    countryCode: 'CN',
    labels: {
      zh: '中文',
      en: 'Chinese',
      ru: 'Китайский',
    },
  },
  {
    id: 'en-SEA',
    countryCode: 'SG',
    labels: {
      zh: '东南亚英语',
      en: 'SEA English',
      ru: 'Английский (SEA)',
    },
  },
  {
    id: 'ko',
    countryCode: 'KR',
    labels: {
      zh: '韩语',
      en: 'Korean',
      ru: 'Корейский',
    },
  },
  {
    id: 'en',
    countryCode: 'US',
    labels: {
      zh: '英语',
      en: 'English',
      ru: 'Английский',
    },
  },
  {
    id: 'fr',
    countryCode: 'FR',
    labels: {
      zh: '法语',
      en: 'French',
      ru: 'Французский',
    },
  },
  {
    id: 'ru',
    countryCode: 'RU',
    labels: {
      zh: '俄语',
      en: 'Russian',
      ru: 'Русский',
    },
  },
  {
    id: 'es',
    countryCode: 'ES',
    labels: {
      zh: '西班牙语',
      en: 'Spanish',
      ru: 'Испанский',
    },
  },
  {
    id: 'ja',
    countryCode: 'JP',
    labels: {
      zh: '日语',
      en: 'Japanese',
      ru: 'Японский',
    },
  },
  {
    id: 'de',
    countryCode: 'DE',
    labels: {
      zh: '德语',
      en: 'German',
      ru: 'Немецкий',
    },
  },
];

export const LANGUAGE_MAP = LANGUAGE_OPTIONS.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const getLanguageLabel = (id, uiLocale = 'zh-CN') => {
  const bucket = localeBucket(uiLocale);
  const target = LANGUAGE_MAP[id] || LANGUAGE_MAP.zh;
  return target?.labels?.[bucket] || target?.labels?.zh || id;
};

export const getLanguageMeta = (id, uiLocale = 'zh-CN') => {
  const target = LANGUAGE_MAP[id] || LANGUAGE_MAP.zh;
  return {
    ...target,
    label: getLanguageLabel(target.id, uiLocale),
  };
};
