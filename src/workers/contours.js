/**
 * Contours algorithm
 * Uses marching squares to draw topographic contour lines by darkness.
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
    { label: 'Cell Size', value: 6, min: 3, max: 20, step: 1 },
    { label: 'Levels', value: 6, min: 1, max: 16, step: 1 },
    { label: 'Min Level', value: 30, min: 0, max: 200, step: 5 },
    { label: 'Max Level', value: 220, min: 50, max: 255, step: 5 },
    { label: 'Optimize Route', type: 'checkbox', checked: true },
  ]),
]);

function interp(a, b, threshold) {
  if (a === b) return 0.5;
  const t = (threshold - a) / (b - a);
  return Math.min(1, Math.max(0, t));
}

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const cell = config['Cell Size'];
  const levels = Math.max(1, Math.round(config.Levels));
  const minLevel = config['Min Level'];
  const maxLevel = config['Max Level'];
  const levelMin = Math.min(minLevel, maxLevel);
  const levelMax = Math.max(minLevel, maxLevel);
  const optimize = config['Optimize Route'];

  const width = config.width;
  const height = config.height;

  const cols = Math.floor((width - 1) / cell) + 1;
  const rows = Math.floor((height - 1) / cell) + 1;
  const grid = new Float32Array(cols * rows);

  for (let gy = 0; gy < rows; gy++) {
    const py = Math.min(height - 1, gy * cell);
    for (let gx = 0; gx < cols; gx++) {
      const px = Math.min(width - 1, gx * cell);
      grid[gx + gy * cols] = getPixel(px, py);
    }
  }

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
    for (let gy = 0; gy < rows - 1; gy++) {
      const y0 = gy * cell;
      const y1 = Math.min(y0 + cell, height);
      const ch = y1 - y0;
      for (let gx = 0; gx < cols - 1; gx++) {
        const x0 = gx * cell;
        const x1 = Math.min(x0 + cell, width);
        const cw = x1 - x0;

        const tl = grid[gx + gy * cols];
        const tr = grid[gx + 1 + gy * cols];
        const br = grid[gx + 1 + (gy + 1) * cols];
        const bl = grid[gx + (gy + 1) * cols];

        const idx =
          (tl >= threshold ? 1 : 0) |
          (tr >= threshold ? 2 : 0) |
          (br >= threshold ? 4 : 0) |
          (bl >= threshold ? 8 : 0);

        const segments = CASE_SEGMENTS[idx];
        if (!segments) continue;

        const top = [x0 + interp(tl, tr, threshold) * cw, y0];
        const right = [x1, y0 + interp(tr, br, threshold) * ch];
        const bottom = [x0 + cw - interp(br, bl, threshold) * cw, y1];
        const left = [x0, y0 + ch - interp(bl, tl, threshold) * ch];
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
