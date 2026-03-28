import dota2Icon from '../assets/game-icons/dota2.jpg';
import leagueOfLegendsIcon from '../assets/game-icons/lol.svg';
import worldOfWarcraftIcon from '../assets/game-icons/wow.png';
import overwatchIcon from '../assets/game-icons/overwatch.ico';

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
    icon: dota2Icon,
    iconFit: 'cover',
    labels: {
      zh: 'Dota 2',
      en: 'Dota 2',
      ru: 'Dota 2',
    },
  },
  {
    id: 'lol',
    icon: leagueOfLegendsIcon,
    iconFit: 'contain',
    labels: {
      zh: '\u82f1\u96c4\u8054\u76df',
      en: 'League of Legends',
      ru: 'League of Legends',
    },
  },
  {
    id: 'wow',
    icon: worldOfWarcraftIcon,
    iconFit: 'contain',
    labels: {
      zh: '\u9b54\u517d\u4e16\u754c',
      en: 'World of Warcraft',
      ru: 'World of Warcraft',
    },
  },
  {
    id: 'overwatch',
    icon: overwatchIcon,
    iconFit: 'contain',
    labels: {
      zh: '\u5b88\u671b\u5148\u950b',
      en: 'Overwatch',
      ru: 'Overwatch',
    },
  },
  {
    id: 'other',
    icon: null,
    iconFit: 'contain',
    labels: {
      zh: '\u5176\u4ed6\u6e38\u620f',
      en: 'Other Game',
      ru: '\u0414\u0440\u0443\u0433\u0430\u044f \u0438\u0433\u0440\u0430',
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
