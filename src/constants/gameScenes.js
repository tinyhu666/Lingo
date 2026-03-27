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

export const DEFAULT_GAME_SCENE = 'dota2';

const LEGACY_GAME_SCENE_MAP = {
  general: DEFAULT_GAME_SCENE,
  moba: DEFAULT_GAME_SCENE,
  fps: DEFAULT_GAME_SCENE,
  mmo: DEFAULT_GAME_SCENE,
};

export const GAME_SCENE_OPTIONS = [
  {
    id: 'dota2',
    labels: {
      zh: 'Dota 2',
      en: 'Dota 2',
      ru: 'Dota 2',
    },
  },
  {
    id: 'lol',
    labels: {
      zh: '英雄联盟',
      en: 'League of Legends',
      ru: 'League of Legends',
    },
  },
  {
    id: 'wow',
    labels: {
      zh: '魔兽世界',
      en: 'World of Warcraft',
      ru: 'World of Warcraft',
    },
  },
  {
    id: 'overwatch',
    labels: {
      zh: '守望先锋',
      en: 'Overwatch',
      ru: 'Overwatch',
    },
  },
  {
    id: 'other',
    labels: {
      zh: '其他游戏',
      en: 'Other Game',
      ru: 'Другая игра',
    },
  },
];

export const GAME_SCENE_MAP = GAME_SCENE_OPTIONS.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export const normalizeGameScene = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (GAME_SCENE_MAP[normalized]) {
    return normalized;
  }
  if (LEGACY_GAME_SCENE_MAP[normalized]) {
    return LEGACY_GAME_SCENE_MAP[normalized];
  }
  return DEFAULT_GAME_SCENE;
};

export const getGameSceneLabel = (id, uiLocale = 'zh-CN') => {
  const bucket = localeBucket(uiLocale);
  const target = GAME_SCENE_MAP[normalizeGameScene(id)] || GAME_SCENE_MAP[DEFAULT_GAME_SCENE];
  return target?.labels?.[bucket] || target?.labels?.zh || target?.id || DEFAULT_GAME_SCENE;
};

export const getGameSceneMeta = (id, uiLocale = 'zh-CN') => {
  const normalized = normalizeGameScene(id);
  const target = GAME_SCENE_MAP[normalized] || GAME_SCENE_MAP[DEFAULT_GAME_SCENE];
  return {
    ...target,
    id: normalized,
    label: getGameSceneLabel(normalized, uiLocale),
  };
};
