import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../components/StoreProvider';
import { getGameSceneMeta, normalizeGameScene } from '../../constants/gameScenes';
import { hotkeyLabelsFromSettings } from '../../constants/hotkeys';
import { STAGE_ASSETS } from '../../constants/backdrops';
import { Kbd } from '../../components/lg';
import { drawBattlefield } from './battlefield';

/** Scoreboard flavour per game. Team names are proper nouns and stay untranslated. */
const SCENES = {
  dota2: { teamA: 'Radiant', teamB: 'Dire', ally: '#8bffb0', enemy: '#ff8a7a', score: '23 : 19' },
  lol: { teamA: 'Blue', teamB: 'Red', ally: '#5ea8ff', enemy: '#ff6b6b', score: '12 : 8' },
  wow: { teamA: 'Alliance', teamB: 'Horde', ally: '#6fb3ff', enemy: '#ff5c5c', score: '3 : 1' },
  overwatch: { teamA: 'Team 1', teamB: 'Team 2', ally: '#4da3ff', enemy: '#ffa43c', score: '2 : 2' },
  other: { teamA: 'Team A', teamB: 'Team B', ally: '#4da3ff', enemy: '#ff8a7a', score: '1 : 1' },
};

/** Demo lines: what the player types, what Lingo writes back, and a teammate reply. */
const DEMO_LINES = [
  ['兄弟们集合打肉山', "let's stack rosh", 'Kuro', 'omw'],
  ['开大了，跟上', 'ult ready, follow up', 'Miracle', 'go go'],
  ['中路没人，小心', 'mid missing, care', 'Yatoro', 'ty'],
  ['去打野，别送', "farm jungle, don't feed", 'Collapse', 'ok ok'],
];

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>/|#%&*+=-';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function DemoStage({ paused = false }) {
  const { t, locale } = useI18n();
  const { settings } = useStore();
  const gameId = normalizeGameScene(settings?.game_scene);
  const gameMeta = getGameSceneMeta(gameId, locale);
  const scene = SCENES[gameId] || SCENES.other;
  const assets = STAGE_ASSETS[gameId] || null;
  const hotkeyKeys = useMemo(() => hotkeyLabelsFromSettings(settings), [settings]);
  const hotkeyRef = useRef(hotkeyKeys);
  hotkeyRef.current = hotkeyKeys;

  const textRef = useRef(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const keysRef = useRef(null);
  const enterRef = useRef(null);
  const sweepRef = useRef(null);
  const stepsRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const miniCanvasRef = useRef(null);
  const youLabel = t('home.stage.you');
  const youLabelRef = useRef(youLabel);
  youLabelRef.current = youLabel;

  // Procedural battlefield for games without bundled imagery.
  useEffect(() => {
    if (assets) return;
    drawBattlefield(bgCanvasRef.current, { u0: 0.1, u1: 0.9, v0: 0.36, v1: 0.69, ally: scene.ally, enemy: scene.enemy });
    drawBattlefield(miniCanvasRef.current, { ally: scene.ally, enemy: scene.enemy, mini: true });
  }, [assets, scene.ally, scene.enemy]);

  // The translation loop: type → hotkey → decode → send → teammate reply.
  useEffect(() => {
    let cancelled = false;
    const reduce = prefersReducedMotion();
    const wait = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, reduce ? 0 : ms);
      });
    const guard = () => {
      if (cancelled) throw new Error('stage-cancelled');
    };

    const setStep = (k) => {
      const spans = stepsRef.current?.querySelectorAll('span') || [];
      spans.forEach((span, i) => {
        span.classList.toggle('is-on', i === k);
        span.classList.toggle('is-done', i < k);
      });
    };

    const typeText = async (text, ms) => {
      const el = textRef.current;
      if (!el) return;
      el.textContent = '';
      for (const ch of text) {
        guard();
        el.textContent += ch;
        await wait(ms);
      }
    };

    const scramble = (target, duration = 1000) =>
      new Promise((resolve) => {
        const el = textRef.current;
        if (!el || reduce) {
          if (el) el.textContent = target;
          resolve();
          return;
        }
        const n = target.length;
        const start = performance.now();
        const frame = (now) => {
          if (cancelled) {
            resolve();
            return;
          }
          const p = now - start;
          let out = '';
          for (let i = 0; i < n; i += 1) {
            const settle = 260 + i * ((duration - 320) / n);
            out += p >= settle || target[i] === ' ' ? target[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          el.textContent = out;
          if (p < duration) {
            requestAnimationFrame(frame);
          } else {
            el.textContent = target;
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });

    const addLine = (cls, who, text) => {
      const log = logRef.current;
      if (!log) return;
      const line = document.createElement('div');
      line.className = `stage__line ${cls}`;
      const whoEl = document.createElement('span');
      whoEl.className = 'who';
      whoEl.textContent = who;
      const msgEl = document.createElement('span');
      msgEl.textContent = text;
      line.append(whoEl, msgEl);
      log.appendChild(line);
      while (log.children.length > 3) log.firstChild.remove();
      Array.from(log.children)
        .slice(0, -1)
        .forEach((node) => node.classList.add('stage__line--fade'));
    };

    const setClasses = (el, add = [], remove = []) => {
      if (!el) return;
      remove.forEach((c) => el.classList.remove(c));
      add.forEach((c) => el.classList.add(c));
    };

    const pressKeys = async (container) => {
      const caps = container?.querySelectorAll('.lg-kbd') || [];
      caps.forEach((cap) => cap.classList.add('lg-kbd--press'));
      await wait(240);
      caps.forEach((cap) => cap.classList.remove('lg-kbd--press'));
    };

    if (logRef.current) {
      logRef.current.innerHTML = '';
    }
    addLine('stage__line--mate', '[ALLIES] Dendi:', 'ward river pls');

    const loop = async () => {
      let i = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        guard();
        const [source, target, mate, reply] = DEMO_LINES[i % DEMO_LINES.length];
        i += 1;

        setStep(0);
        setClasses(inputRef.current, [], ['stage__input--hot', 'stage__input--ping', 'stage__input--busy', 'stage__input--done']);
        textRef.current?.classList.remove('stage__text--scr');
        await wait(500);
        await typeText(source, 75);
        await wait(650);

        setStep(1);
        setClasses(keysRef.current, ['stage__keys--show']);
        await wait(420);
        setClasses(inputRef.current, ['stage__input--hot', 'stage__input--ping', 'stage__input--busy']);
        await pressKeys(keysRef.current);
        await wait(320);
        setClasses(keysRef.current, [], ['stage__keys--show']);

        setStep(2);
        setClasses(sweepRef.current, ['stage__sweep--go']);
        textRef.current?.classList.add('stage__text--scr');
        await scramble(target, 1000);
        guard();
        textRef.current?.classList.remove('stage__text--scr');
        setClasses(inputRef.current, ['stage__input--done'], ['stage__input--hot', 'stage__input--ping']);
        setClasses(sweepRef.current, [], ['stage__sweep--go']);
        await wait(900);

        setStep(3);
        setClasses(enterRef.current, ['stage__keys--show']);
        await wait(380);
        await pressKeys(enterRef.current);
        addLine('stage__line--me', `[ALL] ${youLabelRef.current}:`, target);
        if (textRef.current) textRef.current.textContent = '';
        setClasses(inputRef.current, [], ['stage__input--done', 'stage__input--busy']);
        await wait(260);
        setClasses(enterRef.current, [], ['stage__keys--show']);
        await wait(700);
        addLine('stage__line--mate', `[ALLIES] ${mate}:`, reply);
        await wait(1500);
      }
    };

    loop().catch(() => {
      /* cancelled on unmount */
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const stageStyle = { '--ga': scene.ally, '--gb': scene.enemy };

  return (
    <div className={`stage${paused ? ' stage--paused' : ''}`} style={stageStyle} data-game={gameId}>
      <div className='stage__scene' aria-hidden='true'>
        {assets ? (
          <div className='stage__photo' style={{ backgroundImage: `url(${assets.photo})` }} />
        ) : (
          <canvas ref={bgCanvasRef} className='stage__canvas' width={800} height={340} />
        )}
        <div className='stage__shade' />
        <div className='stage__score'>
          <span className='stage__team stage__team--a'>{scene.teamA}</span>
          <span className='stage__heroes stage__heroes--a'>
            <i /><i /><i /><i /><i />
          </span>
          <b>{scene.score}</b>
          <span className='stage__heroes stage__heroes--b'>
            <i /><i /><i /><i /><i />
          </span>
          <span className='stage__team stage__team--b'>{scene.teamB}</span>
        </div>
        <div className='stage__clock'>34:12</div>
        <div className='stage__feed'>
          <div><em className='a'>lol</em><s /><em className='b'>大福</em></div>
          <div><em className='b'>power</em><s /><em className='a'>shaosha</em></div>
        </div>
        <div className='stage__map'>
          {assets ? (
            <>
              <div className='stage__map-photo' style={{ backgroundImage: `url(${assets.minimap})` }} />
              <div className='stage__dots'>
                <i className='a' style={{ left: '28%', top: '64%' }} />
                <i className='a' style={{ left: '34%', top: '58%' }} />
                <i className='a' style={{ left: '22%', top: '76%' }} />
                <i className='a' style={{ left: '46%', top: '52%' }} />
                <i className='b' style={{ left: '60%', top: '42%' }} />
                <i className='b' style={{ left: '68%', top: '34%' }} />
                <i className='b ping' style={{ left: '52%', top: '47%' }} />
              </div>
            </>
          ) : (
            <canvas ref={miniCanvasRef} width={300} height={300} />
          )}
          <i className='stage__view' />
        </div>
      </div>

      <div className='stage__hud'>
        <span>
          {gameMeta.label} · {t('home.stage.allChat')}
        </span>
        <b>
          <i />
          {t('home.stage.live')}
        </b>
      </div>

      <div className='stage__left'>
        <div className='stage__log' ref={logRef} aria-hidden='true' />
        <div className='stage__inputwrap'>
          <div className='stage__input' ref={inputRef} aria-hidden='true'>
            <span className='ch'>[ALL]</span>
            <span className='stage__text' ref={textRef} />
            <span className='stage__caret' />
            <span className='stage__sweep' ref={sweepRef} />
          </div>
          <div className='stage__keys' ref={keysRef} aria-hidden='true'>
            <Kbd keys={hotkeyKeys} />
          </div>
          <div className='stage__keys' ref={enterRef} aria-hidden='true'>
            <Kbd keys={['Enter ↵']} />
          </div>
        </div>
      </div>

      <div className='stage__steps' ref={stepsRef} aria-hidden='true'>
        <span className='is-on'>{t('home.stage.stepInput')}</span>
        <i />
        <span>{t('home.stage.stepHotkey')}</span>
        <i />
        <span>{t('home.stage.stepReplace')}</span>
        <i />
        <span>{t('home.stage.stepSend')}</span>
      </div>
    </div>
  );
}
