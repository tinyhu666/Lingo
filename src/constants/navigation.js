import {
  HomeHLine,
  Translate,
  ChatBubbleMessage,
  Settings02,
  AT,
} from '../icons';

export const NAV_ITEMS = [
  {
    id: 'home',
    name: '主页',
    title: '战局工作台',
    subtitle: '管理翻译语言、快捷键与软件状态，保持整个翻译链路随时可用。',
    eyebrow: 'Workspace',
    icon: HomeHLine,
  },
  {
    id: 'translate',
    name: '模式',
    title: '翻译模式',
    subtitle: '按对局强度和交流风格选择输出语气，切换后立即生效。',
    eyebrow: 'Modes',
    icon: Translate,
  },
  {
    id: 'phrases',
    name: '常用语',
    title: '常用语面板',
    subtitle: '为高频短句分配快捷入口，减少重复输入和战局内停顿。',
    eyebrow: 'Phrases',
    icon: ChatBubbleMessage,
  },
  {
    id: 'settings',
    name: '服务',
    title: '服务状态',
    subtitle: '查看当前翻译服务、默认策略和客户端可用状态。',
    eyebrow: 'Service',
    icon: Settings02,
  },
  {
    id: 'about',
    name: '关于',
    title: '关于 Lingo',
    subtitle: '检查版本更新、查看项目说明和当前客户端信息。',
    eyebrow: 'About',
    icon: AT,
  },
];

export const NAV_ITEMS_BY_ID = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, item]));
