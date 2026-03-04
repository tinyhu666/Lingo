import { defaultTranslatorHotkeyLabel } from '../constants/hotkeys';
import { useStore } from './StoreProvider';
import { useUpdater } from './UpdateProvider';
import { Sparkles, SwitchArrowHorizontal, KeyboardAlt, PowerToggle } from '../icons';

const CONTEXT_HINTS = {
  home: [
    '先设置翻译语言，再确认快捷键与软件状态。',
    '默认快捷键建议使用 ⌘+T / Ctrl+T。',
    '语言相同可用作润色与语气增强。',
  ],
  translate: [
    '模式切换后会立即写入设置。',
    '职业模式更强调 Dota2 术语与短句。',
    '竞技模式输出更直接，适合高压沟通。',
  ],
  phrases: [
    '建议将高频沟通句放在前 5 项。',
    '避免与翻译主快捷键冲突。',
    '保存后会同步到本地 store.json。',
  ],
  settings: [
    'Provider 与 URL 需匹配对应接口。',
    'Anthropic 使用 /v1/messages 接口。',
    '建议每个厂商单独保存一组配置。',
  ],
  about: [
    '应用内更新会下载并自动重启安装。',
    '有新版本时左侧菜单会显示“可更新”。',
    '若网络受限可在 Release 页面手动下载。',
  ],
};

const SECTION_TITLE = {
  home: '主页摘要',
  translate: '模式说明',
  phrases: '常用语提示',
  settings: '模型配置提示',
  about: '更新说明',
};

const formatReleaseDate = (value) => {
  if (!value) {
    return '未知';
  }
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
};

export default function PageContextPanel({ activeItem, setActiveItem }) {
  const { settings } = useStore();
  const {
    hasUpdate,
    checking,
    downloading,
    latestVersion,
    releaseDate,
    checkForUpdates,
    installUpdate,
  } = useUpdater();

  const actionLabel = checking
    ? '检查中...'
    : downloading
      ? '下载并安装中...'
      : hasUpdate
        ? '立即更新'
        : '检查更新';
  const onAction = hasUpdate ? installUpdate : () => checkForUpdates({ silent: false });
  const disabled = checking || downloading;

  return (
    <aside className='ui-context-panel'>
      <div className='ui-context-scroll space-y-4'>
        <section className='ui-card ui-card-glass p-4 space-y-3'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='ui-card-title text-[15px]'>实时状态</h3>
            <span className='ui-chip'>
              {settings?.app_enabled ?? true ? 'RUNNING' : 'PAUSED'}
            </span>
          </div>

          <div className='space-y-2'>
            <div className='ui-soft-card px-3 py-2'>
              <div className='ui-caption'>翻译语言</div>
              <div className='ui-control-text mt-1 flex items-center gap-1.5'>
                <SwitchArrowHorizontal className='h-4 w-4' />
                {(settings?.translation_from || 'zh').toUpperCase()} →{' '}
                {(settings?.translation_to || 'en').toUpperCase()}
              </div>
            </div>

            <div className='ui-soft-card px-3 py-2'>
              <div className='ui-caption'>快捷键</div>
              <div className='ui-control-text mt-1 flex items-center gap-1.5'>
                <KeyboardAlt className='h-4 w-4' />
                {settings?.trans_hotkey?.shortcut || defaultTranslatorHotkeyLabel()}
              </div>
            </div>

            <div className='ui-soft-card px-3 py-2'>
              <div className='ui-caption'>软件状态</div>
              <div className='ui-control-text mt-1 flex items-center gap-1.5'>
                <PowerToggle className='h-4 w-4' />
                {settings?.app_enabled ?? true ? '已启用' : '已暂停'}
              </div>
            </div>
          </div>
        </section>

        <section className='ui-card p-4 space-y-3'>
          <h3 className='ui-card-title text-[15px]'>{SECTION_TITLE[activeItem] || '使用提示'}</h3>
          <div className='space-y-2'>
            {(CONTEXT_HINTS[activeItem] || CONTEXT_HINTS.home).map((line) => (
              <div key={line} className='ui-soft-card px-3 py-2 ui-body'>
                {line}
              </div>
            ))}
          </div>
        </section>

        <section className='ui-card p-4 space-y-3'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='ui-card-title text-[15px]'>版本更新</h3>
            {hasUpdate ? <span className='ui-chip !bg-[#6c1e2e] !border-[#a54a5c]'>可更新</span> : null}
          </div>

          <div className='ui-soft-card px-3 py-2'>
            <div className='ui-caption'>最新版本</div>
            <div className='ui-control-text mt-1'>
              {latestVersion ? `V${latestVersion}` : '未获取'}
            </div>
            <div className='ui-caption mt-1'>发布日期：{formatReleaseDate(releaseDate)}</div>
          </div>

          <button
            type='button'
            className={`${hasUpdate ? 'ui-btn-primary' : 'ui-btn'} w-full`}
            onClick={onAction}
            disabled={disabled}>
            {actionLabel}
          </button>

          {hasUpdate ? (
            <button type='button' className='ui-btn w-full' onClick={() => setActiveItem('about')}>
              打开关于页查看详情
            </button>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
