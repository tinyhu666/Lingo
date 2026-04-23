import { motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { ChevronRight, GamingPad } from '../../../icons';
import { useStore } from '../../../components/StoreProvider';
import PanelCard from '../../../components/PanelCard';
import DropdownMenu from '../../../components/DropdownMenu';
import {
  DEFAULT_GAME_SCENE,
  GAME_SCENE_OPTIONS,
  getGameSceneLabel,
  getGameSceneMeta,
} from '../../../constants/gameScenes';
import { showError } from '../../../utils/toast';
import { toErrorMessage } from '../../../utils/error';
import { useI18n } from '../../../i18n/I18nProvider';

const MENU_HEIGHT_PX = 276;

function GameSceneGlyph({ meta, className = '' }) {
  const hasImage = Boolean(meta?.icon);
  const imageClassName =
    meta?.iconFit === 'cover'
      ? 'home-game-icon__image home-game-icon__image--cover'
      : 'home-game-icon__image home-game-icon__image--contain';

  return (
    <span className={`home-game-icon ${!hasImage ? 'home-game-icon--generic' : ''} ${className}`.trim()}>
      {hasImage ? (
        <img src={meta.icon} alt='' className={imageClassName} loading='lazy' />
      ) : (
        <GamingPad className='home-game-icon__fallback' />
      )}
    </span>
  );
}

function GameSceneChip({ value, onClick, expanded, direction, uiLocale }) {
  const meta = getGameSceneMeta(value, uiLocale);
  const caretClass =
    expanded && direction === 'up'
      ? 'home-language-chip__caret-icon home-language-chip__caret-icon--up'
      : 'home-language-chip__caret-icon home-language-chip__caret-icon--down';

  return (
    <button
      type='button'
      onClick={onClick}
      aria-haspopup='menu'
      aria-expanded={expanded}
      className={`home-language-chip w-full min-w-0 ${expanded ? 'home-language-chip--active' : ''}`}>
      <span className='home-language-chip__meta'>
        <GameSceneGlyph meta={meta} />
        <span className='tool-control-text home-language-chip__label whitespace-nowrap'>{meta.label}</span>
      </span>
      <span className='home-language-chip__caret' aria-hidden='true'>
        <ChevronRight className={caretClass} />
      </span>
    </button>
  );
}

export default function GameSceneCard() {
  const { settings, updateSettings } = useStore();
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [menuDirection, setMenuDirection] = useState('up');
  const triggerRef = useRef(null);

  const currentScene = settings?.game_scene || DEFAULT_GAME_SCENE;

  const options = useMemo(
    () =>
      Object.fromEntries(
        GAME_SCENE_OPTIONS.map((item) => [item.id, getGameSceneLabel(item.id, locale)]),
      ),
    [locale],
  );
  const renderSceneOption = (value, label) => {
    const meta = getGameSceneMeta(value, locale);

    return (
      <span className='home-game-option'>
        <GameSceneGlyph meta={meta} className='home-game-option__icon' />
        <span className='home-game-option__label'>{label}</span>
      </span>
    );
  };

  const resolveDirection = () => {
    if (!triggerRef.current || typeof window === 'undefined') {
      return 'up';
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow >= MENU_HEIGHT_PX) {
      return 'down';
    }

    if (spaceAbove >= MENU_HEIGHT_PX) {
      return 'up';
    }

    return spaceBelow > spaceAbove ? 'down' : 'up';
  };

  const handleToggle = () => {
    setMenuDirection(resolveDirection());
    setExpanded((current) => !current);
  };

  const handleSceneChange = async (nextScene) => {
    setExpanded(false);
    try {
      await updateSettings({ game_scene: nextScene });
    } catch (error) {
      showError(t('home.gameScene.updateFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}>
      <PanelCard
        className='home-stat-card tool-rise relative'
        icon={<GamingPad className='home-stat-card__header-icon' />}
        title={t('home.gameScene.title')}
        bodyClassName='home-stat-card__body'>
        <div className='home-top-copy home-stat-card__copy'>
          <p className='tool-body'>{t('home.gameScene.desc1')}</p>
          <p className='tool-body'>{t('home.gameScene.desc2')}</p>
        </div>

        <div className='home-top-actions'>
          <div className='tool-control-slot home-top-control-slot'>
            <div className='home-top-control-shell'>
              <div className='relative w-full min-w-0' ref={triggerRef}>
                <GameSceneChip
                  value={currentScene}
                  onClick={handleToggle}
                  expanded={expanded}
                  direction={menuDirection}
                  uiLocale={locale}
                />
                <DropdownMenu
                  show={expanded}
                  onClose={() => setExpanded(false)}
                  options={options}
                  currentValue={currentScene}
                  onSelect={handleSceneChange}
                  direction={menuDirection}
                  anchorRef={triggerRef}
                  renderOption={renderSceneOption}
                />
              </div>
            </div>
          </div>
        </div>
      </PanelCard>
    </motion.div>
  );
}
