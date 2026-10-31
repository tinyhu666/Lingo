/**
 * Procedural top-down battlefield used as the demo-stage backdrop for games
 * without bundled imagery. Everything is generated at runtime (value noise +
 * vector overlays), so no third-party art is involved.
 */

const makeNoise = (seed) => {
  let q = seed >>> 0;
  const rnd = () => {
    q = (q * 1664525 + 1013904223) >>> 0;
    return q / 4294967296;
  };
  const N = 64;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < N * N; i += 1) grid[i] = rnd();
  const fade = (t) => t * t * (3 - 2 * t);
  const at = (x, y) => grid[((y % N) + N) % N * N + (((x % N) + N) % N)];
  const one = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
  };
  return (x, y, octaves = 4) => {
    let value = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      value += one(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return value / norm;
  };
};

const NOISE = makeNoise(1337);
const NOISE_FINE = makeNoise(9001);

const TOWERS = [
  [0.12, 0.5, 'a'], [0.12, 0.24, 'a'], [0.3, 0.7, 'a'], [0.4, 0.6, 'a'], [0.5, 0.88, 'a'], [0.26, 0.88, 'a'],
  [0.88, 0.5, 'b'], [0.88, 0.76, 'b'], [0.7, 0.3, 'b'], [0.6, 0.4, 'b'], [0.5, 0.12, 'b'], [0.74, 0.12, 'b'],
];
const HEROES = [
  [0.43, 0.57, 'a'], [0.48, 0.63, 'a'], [0.34, 0.7, 'a'],
  [0.57, 0.45, 'b'], [0.63, 0.38, 'b'],
];

const riverDistance = (u, v) => Math.abs(v - (u + 0.06 * Math.sin(u * 9 + 1))) / 1.414;
const laneDistance = (u, v) =>
  Math.min(
    Math.abs(u - 0.12) + (v > 0.9 ? 1 : 0),
    Math.abs(v - 0.12) + (u < 0.1 ? 1 : 0),
    Math.abs(v - 0.88) + (u > 0.9 ? 1 : 0),
    Math.abs(u - 0.88) + (v < 0.1 ? 1 : 0),
    Math.abs(u + v - 1) / 1.414,
  );
const baseDistance = (u, v) => Math.min(Math.hypot(u - 0.1, v - 0.9), Math.hypot(u - 0.9, v - 0.1));

const hexToRgb = (hex) => {
  const value = String(hex || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(value)) return [120, 200, 255];
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
};

/**
 * Draw the map region [u0,u1]×[v0,v1] (normalized map coordinates) into `canvas`.
 */
export function drawBattlefield(canvas, { u0 = 0, u1 = 1, v0 = 0, v1 = 1, ally = '#8bffb0', enemy = '#ff8a7a', mini = false } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const scale = mini ? 2 : 3;
  const w = Math.ceil(W / scale);
  const h = Math.ceil(H / scale);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  const img = octx.createImageData(w, h);
  const data = img.data;
  const A = hexToRgb(ally);
  const B = hexToRgb(enemy);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = u0 + ((u1 - u0) * x) / w;
      const v = v0 + ((v1 - v0) * y) / h;
      const n = NOISE(u * 7, v * 7);
      const n2 = NOISE_FINE(u * 22, v * 22, 3);
      const grass = 0.32 + n * 0.5;
      let r = 38 + grass * 40;
      let g = 74 + grass * 62;
      let b = 34 + grass * 34;

      if (n > 0.57) {
        const t = (n - 0.57) * 6;
        r = r * (1 - t) + (24 + n2 * 18) * t;
        g = g * (1 - t) + (52 + n2 * 22) * t;
        b = b * (1 - t) + (26 + n2 * 10) * t;
      }

      const rd = riverDistance(u, v);
      if (rd < 0.05) {
        const t = 1 - Math.min(1, rd / 0.05);
        const wt = t * t;
        const hl = n2 > 0.68 ? 60 : 0;
        r = r * (1 - wt) + (28 + hl) * wt;
        g = g * (1 - wt) + (96 + hl) * wt;
        b = b * (1 - wt) + (128 + hl) * wt;
      } else if (rd < 0.062) {
        const t = (rd - 0.05) / 0.012;
        r = r * t + 150 * (1 - t);
        g = g * t + 136 * (1 - t);
        b = b * t + 96 * (1 - t);
      }

      const ld = laneDistance(u, v);
      if (ld < 0.02) {
        const t = 1 - Math.min(1, ld / 0.02);
        const wt = Math.min(1, t * 1.6);
        r = r * (1 - wt) + (118 + n2 * 30) * wt;
        g = g * (1 - wt) + (96 + n2 * 24) * wt;
        b = b * (1 - wt) + (62 + n2 * 14) * wt;
      }

      const bd = baseDistance(u, v);
      if (bd < 0.13) {
        const wt = (1 - bd / 0.13) * 0.55;
        const C = u < 0.5 ? A : B;
        r = r * (1 - wt) + C[0] * wt;
        g = g * (1 - wt) + C[1] * wt;
        b = b * (1 - wt) + C[2] * wt;
      }

      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(off, 0, 0, W, H);

  const px = (u) => ((u - u0) / (u1 - u0)) * W;
  const py = (v) => ((v - v0) / (v1 - v0)) * H;

  if (!mini) {
    let q = 7;
    const rnd = () => {
      q = (q * 1664525 + 1013904223) >>> 0;
      return q / 4294967296;
    };
    for (let y = 6; y < H; y += 11) {
      for (let x = 6; x < W; x += 11) {
        const u = u0 + ((u1 - u0) * x) / W;
        const v = v0 + ((v1 - v0) * y) / H;
        if (NOISE(u * 7, v * 7) > 0.6 && riverDistance(u, v) > 0.06 && laneDistance(u, v) > 0.03 && rnd() > 0.35) {
          const radius = 4 + rnd() * 4;
          const cx = x + rnd() * 6 - 3;
          const cy = y + rnd() * 6 - 3;
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.beginPath();
          ctx.arc(cx + 2, cy + 3, radius, 0, 7);
          ctx.fill();
          const gradient = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.4, 1, cx, cy, radius);
          gradient.addColorStop(0, '#5e9a46');
          gradient.addColorStop(1, '#1d3a1e');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, 7);
          ctx.fill();
        }
      }
    }
  }

  for (const [u, v, team] of TOWERS) {
    const x = px(u);
    const y = py(v);
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const color = team === 'a' ? ally : enemy;
    const R = mini ? 3 : 9;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.ellipse(x + R * 0.3, y + R * 0.9, R * 1.1, R * 0.5, 0, 0, 7);
    ctx.fill();
    const stone = ctx.createLinearGradient(x - R, y, x + R, y);
    stone.addColorStop(0, '#cfd3d8');
    stone.addColorStop(1, '#6b7079');
    ctx.fillStyle = stone;
    ctx.fillRect(x - R * 0.55, y - R * 1.4, R * 1.1, R * 1.9);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - R * 1.4, R * 0.7, 0, 7);
    ctx.fill();
  }

  for (const [u, v, team] of HEROES) {
    const x = px(u);
    const y = py(v);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    const color = team === 'a' ? ally : enemy;
    const R = mini ? 3.2 : 7;
    ctx.shadowColor = color;
    ctx.shadowBlur = mini ? 6 : 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = mini ? 1.5 : 2.5;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 7);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.45, 0, 7);
    ctx.fill();
    if (!mini) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(x - 11, y - R - 9, 22, 4);
      ctx.fillStyle = color;
      ctx.fillRect(x - 11, y - R - 9, 22 * 0.75, 4);
    }
  }

  if (mini) {
    const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }
}
