import { useMemo } from 'react';
import {
  Sparkles,
  KeyboardAlt,
  PowerToggle,
  ChatBubbleMessage,
  Settings02,
  AT,
  Translate,
  Globe,
  Server,
  InfoCircle,
} from '../icons';
import { useStore } from './StoreProvider';
import { useUpdater } from './UpdateProvider';
import { getLanguageMeta } from '../constants/languages';
import { defaultTranslatorHotkeyLabel } from '../constants/hotkeys';
import { APP_VERSION_LABEL } from '../constants/version';

const modeLabels = {
  auto: '自动',
  pro: '职业',
  toxic: '竞技',
};

const sceneLabels = {
  general: '通用',
  moba: 'MOBA',
  fps: 'FPS',
  mmo: 'MMO',
};

function ContextCard({ icon: Icon, title, children, tone = 'neutral' }) {
  return (
    <section className={`context-card context-card--${tone}`}>
      <div className='context-card__head'>
        {Icon ? <Icon className='context-card__icon' /> : null}
        <h3 className='context-card__title'>{title}</h3>
      </div>
      <div className='context-card__body'>{children}</div>
    </section>
  );
}

function MetaRow({ label, value, accent = false }) {
  return (
    <div className='context-meta-row'>
      <span className='context-meta-row__label'>{label}</span>
      <span className={accent ? 'context-meta-row__value text-blue-700' : 'context-meta-row__value'}>{value}</span>
    </div>
  );
}

export default function PageContextPanel({ activeItem, pageMeta }) {
  const { settings } = useStore();
  const { hasUpdate, latestVersion, currentVersion, checkedAt } = useUpdater();

  const fromLabel = getLanguageMeta(settings?.translation_from || 'zh').label;
  const toLabel = getLanguageMeta(settings?.translation_to || 'en').label;
  const hotkeyLabel = settings?.trans_hotkey?.shortcut || defaultTranslatorHotkeyLabel();
  const appEnabled = settings?.app_enabled !== false;
  const phrasesCount = settings?.phrases?.length || 0;
  const translationMode = modeLabels[settings?.translation_mode || 'auto'] || '自动';
  const sceneLabel = sceneLabels[settings?.game_scene || 'general'] || '通用';
  const checkedLabel = useMemo(() => {
    if (!checkedAt) return '未检查';
    try {
      return new Date(checkedAt).toLocaleString();
    } catch {
      return '未检查';
    }
  }, [checkedAt]);

  const homeCards = [
    <ContextCard key='status' icon={Sparkles} title='当前工作区'>
      <MetaRow label='翻译语言' value={`${fromLabel} → ${toLabel}`} accent />
      <MetaRow label='快捷键' value={hotkeyLabel} />
      <MetaRow label='软件状态' value={appEnabled ? '已启用' : '已暂停'} />
    </ContextCard>,
    <ContextCard key='tips' icon={KeyboardAlt} title='使用提示'>
      <p className='tool-body'>复制游戏聊天内容后，按快捷键即可触发翻译并自动回填，无需切出游戏。</p>
      <div className='context-bullet-list'>
        <div>建议保持默认语言配置，减少战局内误操作。</div>
        <div>暂停状态下不会响应翻译快捷键，可用于赛后整理。</div>
      </div>
    </ContextCard>,
    <ContextCard key='service' icon={PowerToggle} title='快速状态' tone={appEnabled ? 'success' : 'muted'}>
      <p className='context-emphasis'>{appEnabled ? '翻译链路已就绪' : '翻译链路已暂停'}</p>
      <p className='tool-body'>{appEnabled ? '当前可直接发起翻译。' : '恢复开关后即可重新接收快捷键。'}</p>
    </ContextCard>,
  ];

  const translateCards = [
    <ContextCard key='mode' icon={Translate} title='当前模式'>
      <MetaRow label='输出风格' value={translationMode} accent />
      <MetaRow label='适用场景' value={sceneLabel} />
    </ContextCard>,
    <ContextCard key='guide' icon={InfoCircle} title='选择建议'>
      <div className='context-bullet-list'>
        <div>自动：适合日常沟通和平衡表达。</div>
        <div>职业：更短句、术语更集中。</div>
        <div>竞技：语气更直接，适合高压对局。</div>
      </div>
    </ContextCard>,
  ];

  const phraseCards = [
    <ContextCard key='library' icon={ChatBubbleMessage} title='短语库概览'>
      <MetaRow label='已保存短语' value={`${phrasesCount} / 20`} accent />
      <MetaRow label='快捷修饰键' value='Alt / Option' />
    </ContextCard>,
    <ContextCard key='rules' icon={KeyboardAlt} title='录入规则'>
      <div className='context-bullet-list'>
        <div>避免与翻译快捷键冲突。</div>
        <div>建议使用短句，减少战局中阅读负担。</div>
        <div>保存后会立即更新本地快捷入口。</div>
      </div>
    </ContextCard>,
  ];

  const settingsCards = [
    <ContextCard key='service' icon={Server} title='服务摘要'>
      <MetaRow label='客户端' value={appEnabled ? '已启用' : '已暂停'} accent={appEnabled} />
      <MetaRow label='翻译模式' value={translationMode} />
      <MetaRow label='游戏场景' value={sceneLabel} />
    </ContextCard>,
    <ContextCard key='routing' icon={Settings02} title='运行说明'>
      <p className='tool-body'>模型参数由服务端统一管理，客户端仅负责触发翻译、接收结果并回填到当前输入框。</p>
    </ContextCard>,
  ];

  const aboutCards = [
    <ContextCard key='version' icon={AT} title='版本信息' tone={hasUpdate ? 'highlight' : 'neutral'}>
      <MetaRow label='当前版本' value={currentVersion ? `V${currentVersion}` : APP_VERSION_LABEL} />
      <MetaRow label='最新版本' value={latestVersion ? `V${latestVersion}` : '暂未获取'} accent={hasUpdate} />
      <MetaRow label='上次检查' value={checkedLabel} />
    </ContextCard>,
    <ContextCard key='project' icon={Globe} title='项目说明'>
      <p className='tool-body'>Lingo 聚焦游戏内即时沟通翻译，并会持续扩展到更多游戏场景。</p>
      {hasUpdate ? <p className='context-emphasis text-red-500'>检测到新版本，可在关于页直接更新。</p> : null}
    </ContextCard>,
  ];

  const cardMap = {
    home: homeCards,
    translate: translateCards,
    phrases: phraseCards,
    settings: settingsCards,
    about: aboutCards,
  };

  return (
    <div className='context-panel'>
      <div className='context-panel__hero'>
        <span className='context-panel__eyebrow'>{pageMeta?.eyebrow || 'Workspace'}</span>
        <h2 className='context-panel__title'>{pageMeta?.title || 'Lingo'}</h2>
        <p className='context-panel__subtitle'>{pageMeta?.subtitle || '保持沟通流畅，减少战局内切换成本。'}</p>
      </div>
      <div className='context-panel__stack'>{cardMap[activeItem] || homeCards}</div>
    </div>
  );
}
