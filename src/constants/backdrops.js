import homeBanner from '../assets/backdrops/home-banner.jpg';
import styleAurora from '../assets/backdrops/style-aurora.jpg';
import aboutHeroes from '../assets/backdrops/about-heroes.jpg';
import ambientBlur from '../assets/backdrops/ambient-blur.jpg';
import stageDota2 from '../assets/backdrops/stage-dota2.jpg';
import minimapDota2 from '../assets/backdrops/minimap-dota2.jpg';
import tutorialPanorama from '../assets/backdrops/tutorial-panorama.jpg';

/**
 * Per-page backdrops rendered behind the workspace. Pages with dense
 * content (tutorial, phrases) only get a blurred, low-strength ambient layer.
 */
export const PAGE_BACKDROPS = {
  home: { image: homeBanner, position: 'center 30%', strength: 1 },
  translate: { image: styleAurora, position: 'right 20%', strength: 1 },
  about: { image: aboutHeroes, position: 'center 10%', strength: 1 },
  tutorial: { image: ambientBlur, position: 'center', strength: 0.55 },
  phrases: { image: ambientBlur, position: 'center', strength: 0.55 },
};

export const STAGE_ASSETS = {
  dota2: { photo: stageDota2, minimap: minimapDota2 },
};

export const TUTORIAL_PANORAMA = tutorialPanorama;
