/**
 * Reaction-Diffusion algorithm (Gray-Scott)
 * Runs a 2D simulation and extracts contours from the B field.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

const CASE_SEGMENTS = [
  null,
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 2], [0, 1]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 3], [1, 2]],
  [[1, 3]],
  [[1, 3]],
  [[0, 1]],
  [[3, 0]],
  null,
];

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 4, min: 2, max: 12, step: 1 },
    { label: 'Iterations', value: 300, min: 50, max: 2000, step: 50 },
    { label: 'Diffuse A', value: 1, min: 0.2, max: 2, step: 0.05 },
    { label: 'Diffuse B', value: 0.5, min: 0.1, max: 1.5, step: 0.05 },
    { label: 'Feed', value: 0.035, min: 0.001, max: 0.08, step: 0.001 },
    { label: 'Kill', value: 0.062, min: 0.01, max: 0.09, step: 0.001 },
    { label: 'Seed Strength', value: 1, min: 0, max: 1.5, step: 0.05 },
    { label: 'Seed Power', value: 1.1, min: 0.2, max: 3, step: 0.1 },
    { label: 'Seed Noise', value: 0.08, min: 0, max: 0.2, step: 0.01 },
    { label: 'Seed Invert', type: 'checkbox', checked: true },
    { label: 'Levels', value: 7, min: 1, max: 12, step: 1 },
    { label: 'Min Level', value: 0.05, min: 0, max: 1, step: 0.01 },
    { label: 'Max Level', value: 0.6, min: 0, max: 1, step: 0.01 },
    { label: 'Optimize Route', type: 'checkbox', checked: true },
  ]),
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function interp(a, b, threshold) {
  if (a === b) return 0.5;
  const t = (threshold - a) / (b - a);
  return Math.min(1, Math.max(0, t));
}

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const width = config.width;
  const height = config.height;

  const cellSize = Math.max(2, Math.round(config['Cell Size']));
  const iterations = Math.max(1, Math.round(config.Iterations));
  const da = config['Diffuse A'];
  const db = config['Diffuse B'];
  const feed = config.Feed;
  const kill = config.Kill;
  const seedStrength = config['Seed Strength'];
  const seedPower = config['Seed Power'];
  const seedNoise = config['Seed Noise'];
  const seedInvert = config['Seed Invert'];
  const levels = Math.max(1, Math.round(config.Levels));
  const minLevel = config['Min Level'];
  const maxLevel = config['Max Level'];
  const optimize = config['Optimize Route'];

  const gw = Math.max(2, Math.floor(width / cellSize));
  const gh = Math.max(2, Math.floor(height / cellSize));
  const size = gw * gh;

  let A = new Float32Array(size);
  let B = new Float32Array(size);
  let A2 = new Float32Array(size);
  let B2 = new Float32Array(size);

  for (let i = 0; i < size; i++) A[i] = 1;

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const px = (x + 0.5) * cellSize;
      const py = (y + 0.5) * cellSize;
      const darkness = getPixel(px, py) / 255;
      const base = Math.pow(seedInvert ? 1 - darkness : darkness, seedPower) * seedStrength;
      const noise = seedNoise > 0 ? (Math.random() * 2 - 1) * seedNoise : 0;
      const seeded = clamp(base + noise, 0, 1.5);
      if (seeded > 0) {
        const idx = x + y * gw;
        B[idx] = seeded;
        A[idx] = clamp(1 - seeded * 0.5, 0, 1);
      }
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < gh; y++) {
      const y0 = y === 0 ? 0 : y - 1;
      const y1 = y === gh - 1 ? gh - 1 : y + 1;
      for (let x = 0; x < gw; x++) {
        const x0 = x === 0 ? 0 : x - 1;
        const x1 = x === gw - 1 ? gw - 1 : x + 1;

        const idx = x + y * gw;
        const a = A[idx];
        const b = B[idx];

        const lapA =
          -a +
          A[x0 + y * gw] * 0.2 +
          A[x1 + y * gw] * 0.2 +
          A[x + y0 * gw] * 0.2 +
          A[x + y1 * gw] * 0.2 +
          A[x0 + y0 * gw] * 0.05 +
          A[x1 + y0 * gw] * 0.05 +
          A[x0 + y1 * gw] * 0.05 +
          A[x1 + y1 * gw] * 0.05;

        const lapB =
          -b +
          B[x0 + y * gw] * 0.2 +
          B[x1 + y * gw] * 0.2 +
          B[x + y0 * gw] * 0.2 +
          B[x + y1 * gw] * 0.2 +
          B[x0 + y0 * gw] * 0.05 +
          B[x1 + y0 * gw] * 0.05 +
          B[x0 + y1 * gw] * 0.05 +
          B[x1 + y1 * gw] * 0.05;

        const reaction = a * b * b;
        let nextA = a + (da * lapA - reaction + feed * (1 - a));
        let nextB = b + (db * lapB + reaction - (kill + feed) * b);
        A2[idx] = clamp(nextA, 0, 1);
        B2[idx] = clamp(nextB, 0, 1);
      }
    }

    [A, A2] = [A2, A];
    [B, B2] = [B2, B];
  }

  const levelMin = Math.min(minLevel, maxLevel);
  const levelMax = Math.max(minLevel, maxLevel);
  const thresholds = [];
  if (levels === 1) {
    thresholds.push((levelMin + levelMax) * 0.5);
  } else {
    for (let i = 0; i < levels; i++) {
      thresholds.push(levelMin + ((levelMax - levelMin) * i) / (levels - 1));
    }
  }

  const lines = [];

  for (const threshold of thresholds) {
    for (let y = 0; y < gh - 1; y++) {
      const y0 = y * cellSize;
      const y1 = y0 + cellSize;
      for (let x = 0; x < gw - 1; x++) {
        const x0 = x * cellSize;
        const x1 = x0 + cellSize;

        const tl = B[x + y * gw];
        const tr = B[x + 1 + y * gw];
        const br = B[x + 1 + (y + 1) * gw];
        const bl = B[x + (y + 1) * gw];

        const idx =
          (tl >= threshold ? 1 : 0) |
          (tr >= threshold ? 2 : 0) |
          (br >= threshold ? 4 : 0) |
          (bl >= threshold ? 8 : 0);

        const segments = CASE_SEGMENTS[idx];
        if (!segments) continue;

        const top = [x0 + interp(tl, tr, threshold) * cellSize, y0];
        const right = [x1, y0 + interp(tr, br, threshold) * cellSize];
        const bottom = [x0 + cellSize - interp(br, bl, threshold) * cellSize, y1];
        const left = [x0, y0 + cellSize - interp(bl, tl, threshold) * cellSize];
        const edges = [top, right, bottom, left];

        for (const [e0, e1] of segments) {
          lines.push([edges[e0], edges[e1]]);
        }
      }
    }
  }

  if (lines.length === 0) {
    self.postMessage(['svg-path', '']);
    return;
  }

  const output = optimize ? sortlines(lines) : lines;
  postLines(output);
};
