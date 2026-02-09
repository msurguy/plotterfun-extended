/**
 * Differential Growth algorithm
 * Splits and relaxes a line while steering toward darker regions.
 */

import { defaultControls, pixelProcessor, postLines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Start Radius', value: 220, min: 20, max: 400, step: 5 },
    { label: 'Start Segments', value: 90, min: 12, max: 200, step: 2 },
    { label: 'Iterations', value: 200, min: 10, max: 500, step: 5 },
    { label: 'Split Length', value: 12, min: 4, max: 40, step: 1 },
    { label: 'Split Jitter', value: 0.25, min: 0, max: 1, step: 0.05 },
    { label: 'Max Points', value: 4000, min: 200, max: 10000, step: 100 },
    { label: 'Repel Radius', value: 12, min: 2, max: 40, step: 1 },
    { label: 'Repel Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
    { label: 'Smooth Strength', value: 0.25, min: 0, max: 1, step: 0.05 },
    { label: 'Attract Strength', value: 0.8, min: 0, max: 3, step: 0.1 },
    { label: 'Closed Loop', type: 'checkbox', checked: true },
    { label: 'Seed', value: -1, min: -1, max: 100000, step: 1 },
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

function makeRng(seed) {
  if (!Number.isFinite(seed) || seed < 0) return Math.random;
  return mulberry32(Math.floor(seed));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildGrid(points, cellSize, width, height) {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cells = Array.from({ length: cols * rows }, () => []);

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    const cx = clamp(Math.floor(x / cellSize), 0, cols - 1);
    const cy = clamp(Math.floor(y / cellSize), 0, rows - 1);
    cells[cx + cy * cols].push(i);
  }

  return { cells, cols, rows };
}

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const width = config.width;
  const height = config.height;

  const startRadius = config['Start Radius'];
  const startSegments = Math.max(6, Math.round(config['Start Segments']));
  const iterations = Math.max(1, Math.round(config.Iterations));
  const splitLength = config['Split Length'];
  const splitJitter = config['Split Jitter'];
  const maxPoints = Math.max(10, Math.round(config['Max Points']));
  const repelRadius = config['Repel Radius'];
  const repelStrength = config['Repel Strength'];
  const smoothStrength = config['Smooth Strength'];
  const attractStrength = config['Attract Strength'];
  const closed = config['Closed Loop'];
  const rng = makeRng(config.Seed);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(startRadius, Math.min(cx, cy) - 2);

  let points = [];
  for (let i = 0; i < startSegments; i++) {
    const angle = (i / startSegments) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    if (points.length < 2) break;

    if (points.length < maxPoints) {
      const nextPoints = [];
      const count = points.length;
      const maxIndex = closed ? count : count - 1;
      for (let i = 0; i < maxIndex; i++) {
        const a = points[i];
        const b = points[(i + 1) % count];
        nextPoints.push(a);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dist = Math.hypot(dx, dy);
        if (dist > splitLength && nextPoints.length < maxPoints) {
          const midx = a[0] + dx * 0.5;
          const midy = a[1] + dy * 0.5;
          const jitter = (rng() * 2 - 1) * splitJitter * splitLength;
          const nx = midx + (-dy / dist) * jitter;
          const ny = midy + (dx / dist) * jitter;
          nextPoints.push([nx, ny]);
        }
      }
      if (!closed) nextPoints.push(points[points.length - 1]);
      points = nextPoints;
    }

    const { cells, cols, rows } = buildGrid(points, repelRadius, width, height);
    const next = points.map((p) => [p[0], p[1]]);
    const count = points.length;

    for (let i = 0; i < count; i++) {
      const [x, y] = points[i];
      let fx = 0;
      let fy = 0;

      if (repelStrength > 0 && repelRadius > 0) {
        const gx = clamp(Math.floor(x / repelRadius), 0, cols - 1);
        const gy = clamp(Math.floor(y / repelRadius), 0, rows - 1);
        for (let oy = -1; oy <= 1; oy++) {
          const ny = gy + oy;
          if (ny < 0 || ny >= rows) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = gx + ox;
            if (nx < 0 || nx >= cols) continue;
            const cell = cells[nx + ny * cols];
            for (const j of cell) {
              if (j === i) continue;
              if (Math.abs(j - i) <= 1 || (closed && (i === 0 || i === count - 1) && Math.abs(j - i) === count - 1))
                continue;
              const [qx, qy] = points[j];
              const dx = x - qx;
              const dy = y - qy;
              const dist = Math.hypot(dx, dy);
              if (dist > 0 && dist < repelRadius) {
                const strength = (1 - dist / repelRadius) * repelStrength;
                fx += (dx / dist) * strength;
                fy += (dy / dist) * strength;
              }
            }
          }
        }
      }

      if (smoothStrength > 0) {
        const prev = points[(i - 1 + count) % count];
        const nextPoint = points[(i + 1) % count];
        if (closed || (i > 0 && i < count - 1)) {
          fx += ((prev[0] + nextPoint[0]) * 0.5 - x) * smoothStrength;
          fy += ((prev[1] + nextPoint[1]) * 0.5 - y) * smoothStrength;
        }
      }

      if (attractStrength > 0) {
        const gx = getPixel(clamp(x + 1, 0, width - 1), y) - getPixel(clamp(x - 1, 0, width - 1), y);
        const gy = getPixel(x, clamp(y + 1, 0, height - 1)) - getPixel(x, clamp(y - 1, 0, height - 1));
        fx += (gx / 255) * attractStrength;
        fy += (gy / 255) * attractStrength;
      }

      next[i][0] = clamp(x + fx, 0, width - 1);
      next[i][1] = clamp(y + fy, 0, height - 1);
    }

    points = next;
  }

  if (points.length < 2) {
    self.postMessage(['svg-path', '']);
    return;
  }

  const output = closed ? points.concat([points[0]]) : points;
  postLines(output);
};
