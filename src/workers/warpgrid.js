/**
 * Warp Grid algorithm
 * Warps grid lines using simplex noise and image darkness.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

const SIMPLEX_GRAD3 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0, 1],
  [0, -1],
];

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Grid Spacing', value: 12, min: 4, max: 40, step: 1 },
    { label: 'Sample Step', value: 4, min: 1, max: 12, step: 1 },
    { label: 'Noise Scale', value: 0.01, min: 0.002, max: 0.05, step: 0.001 },
    { label: 'Warp Strength', value: 12, min: 0, max: 40, step: 1 },
    { label: 'Darkness Power', value: 1.3, min: 0.3, max: 3, step: 0.1 },
    { label: 'Min Darkness', value: 20, min: 0, max: 200, step: 5 },
    { label: 'Direction', type: 'select', value: 'both', options: ['both', 'horizontal', 'vertical'] },
    { label: 'Seed', value: -1, min: -1, max: 100000, step: 1 },
    { label: 'Optimize Route', type: 'checkbox', checked: true },
  ]),
]);

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createSimplex2D(rng) {
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i >= 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return function (xin, yin) {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = permMod12[ii + perm[jj]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1]];
    const gi2 = permMod12[ii + 1 + perm[jj + 1]];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const g = SIMPLEX_GRAD3[gi0];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const g = SIMPLEX_GRAD3[gi1];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const g = SIMPLEX_GRAD3[gi2];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  };
}

function makeNoise(seed) {
  if (!Number.isFinite(seed) || seed < 0) {
    return createSimplex2D(Math.random);
  }
  return createSimplex2D(mulberry32(seed >>> 0));
}

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const spacing = config['Grid Spacing'];
  const step = config['Sample Step'];
  const scale = config['Noise Scale'];
  const strength = config['Warp Strength'];
  const power = config['Darkness Power'];
  const minDarkness = config['Min Darkness'];
  const direction = config['Direction'];
  const optimize = config['Optimize Route'];

  const width = config.width;
  const height = config.height;

  const baseSeed = Number.isFinite(config.Seed) && config.Seed >= 0 ? config.Seed : Math.floor(Math.random() * 1e9);
  const noiseX = makeNoise(baseSeed);
  const noiseY = makeNoise(baseSeed + 1013904223);

  const lines = [];

  function warpPoint(x, y) {
    const darkness = getPixel(x, y);
    if (darkness < minDarkness) return null;
    const amp = strength * Math.pow(darkness / 255, power);
    const nx = noiseX(x * scale, y * scale);
    const ny = noiseY(x * scale + 17.3, y * scale + 29.1);
    return [x + nx * amp, y + ny * amp];
  }

  if (direction === 'both' || direction === 'horizontal') {
    for (let y = 0; y < height; y += spacing) {
      let line = [];
      for (let x = 0; x < width; x += step) {
        const pt = warpPoint(x, y);
        if (!pt) {
          if (line.length > 1) lines.push(line);
          line = [];
          continue;
        }
        line.push(pt);
      }
      if (line.length > 1) lines.push(line);
    }
  }

  if (direction === 'both' || direction === 'vertical') {
    for (let x = 0; x < width; x += spacing) {
      let line = [];
      for (let y = 0; y < height; y += step) {
        const pt = warpPoint(x, y);
        if (!pt) {
          if (line.length > 1) lines.push(line);
          line = [];
          continue;
        }
        line.push(pt);
      }
      if (line.length > 1) lines.push(line);
    }
  }

  if (lines.length === 0) {
    self.postMessage(['svg-path', '']);
    return;
  }

  const output = optimize ? sortlines(lines) : lines;
  postLines(output);
};
