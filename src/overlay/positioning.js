const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

/**
 * Calculate an edge anchor in one coordinate space. Callers pass physical
 * pixels on Windows and logical points on macOS, matching GameWindow bounds.
 */
export function calculateOverlayPosition({ game, display, overlay, anchor = 'right', gap = 12 }) {
  const gameBounds = {
    x: finite(game?.x),
    y: finite(game?.y),
    w: Math.max(0, finite(game?.w)),
    h: Math.max(0, finite(game?.h)),
  };
  const overlaySize = {
    w: Math.max(0, finite(overlay?.w)),
    h: Math.max(0, finite(overlay?.h)),
  };
  const safeGap = Math.max(0, finite(gap));

  let x = gameBounds.x;
  let y = gameBounds.y;
  if (anchor === 'left') {
    x = gameBounds.x - overlaySize.w - safeGap;
  } else if (anchor === 'top') {
    y = gameBounds.y - overlaySize.h - safeGap;
  } else if (anchor === 'bottom') {
    y = gameBounds.y + gameBounds.h + safeGap;
  } else {
    x = gameBounds.x + gameBounds.w + safeGap;
  }

  if (display) {
    const displayBounds = {
      x: finite(display.x),
      y: finite(display.y),
      w: Math.max(0, finite(display.w)),
      h: Math.max(0, finite(display.h)),
    };
    const displayRight = displayBounds.x + displayBounds.w;
    const displayBottom = displayBounds.y + displayBounds.h;

    if (anchor === 'left' && x < displayBounds.x) {
      x = gameBounds.x + safeGap;
    } else if (anchor === 'right' && x + overlaySize.w > displayRight) {
      x = gameBounds.x + gameBounds.w - overlaySize.w - safeGap;
    } else if (anchor === 'top' && y < displayBounds.y) {
      y = gameBounds.y + safeGap;
    } else if (anchor === 'bottom' && y + overlaySize.h > displayBottom) {
      y = gameBounds.y + gameBounds.h - overlaySize.h - safeGap;
    }

    const maxX = Math.max(displayBounds.x, displayRight - overlaySize.w);
    const maxY = Math.max(displayBounds.y, displayBottom - overlaySize.h);
    x = Math.min(Math.max(x, displayBounds.x), maxX);
    y = Math.min(Math.max(y, displayBounds.y), maxY);
  }

  return { x: Math.round(x), y: Math.round(y) };
}
