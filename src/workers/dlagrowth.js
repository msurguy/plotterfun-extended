/**
 * DLA Growth algorithm
 * Diffusion-limited aggregation with optional darkness bias.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 3, min: 1, max: 10, step: 1 },
    { label: 'Particles', value: 2200, min: 100, max: 8000, step: 100 },
    { label: 'Steps per Particle', value: 600, min: 50, max: 2000, step: 50 },
    { label: 'Stick Radius', value: 1, min: 1, max: 4, step: 1 },
    { label: 'Stickiness', value: 1.5, min: 0.1, max: 3, step: 0.1 },
    { label: 'Darkness Power', value: 1.1, min: 0.3, max: 3, step: 0.1 },
    { label: 'Min Darkness', value: 0, min: 0, max: 200, step: 5 },
    { label: 'Darkness Bias', value: 0.8, min: 0, max: 3, step: 0.1 },
    { label: 'Seed Count', value: 1, min: 1, max: 12, step: 1 },
    { label: 'Seed Mode', type: 'select', value: 'center', options: ['center', 'darkest', 'random'] },
    { label: 'Spawn Mode', type: 'select', value: 'edge', options: ['edge', 'circle', 'random'] },
    { label: 'Optimize Route', type: 'checkbox', checked: true },
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

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const width = config.width;
  const height = config.height;

  const cellSize = Math.max(1, Math.round(config['Cell Size']));
  const particleTarget = Math.max(0, Math.round(config.Particles));
  const maxSteps = Math.max(10, Math.round(config['Steps per Particle']));
  const stickRadius = Math.max(1, Math.round(config['Stick Radius']));
  const stickiness = config.Stickiness;
  const power = config['Darkness Power'];
  const minDarkness = config['Min Darkness'];
  const bias = config['Darkness Bias'];
  const seedCount = Math.max(1, Math.round(config['Seed Count']));
  const seedMode = config['Seed Mode'];
  const spawnMode = config['Spawn Mode'];
  const optimize = config['Optimize Route'];

  const rng = makeRng(config.Seed);

  const gw = Math.max(1, Math.floor(width / cellSize));
  const gh = Math.max(1, Math.floor(height / cellSize));
  const gridSize = gw * gh;
  const occupancy = new Int32Array(gridSize);
  occupancy.fill(-1);

  const points = [];
  const lines = [];

  function gridIndex(gx, gy) {
    return gx + gy * gw;
  }

  function gridToWorld(gx, gy) {
    return [(gx + 0.5) * cellSize, (gy + 0.5) * cellSize];
  }

  function addPoint(gx, gy, connectTo) {
    const idx = gridIndex(gx, gy);
    if (occupancy[idx] !== -1) return false;
    const [x, y] = gridToWorld(gx, gy);
    const pointIndex = points.length;
    points.push([x, y]);
    occupancy[idx] = pointIndex;
    if (connectTo !== null) {
      const [nx, ny] = points[connectTo];
      lines.push([
        [x, y],
        [nx, ny],
      ]);
    }
    return true;
  }

  function findNearestOccupied(gx, gy) {
    let best = -1;
    let bestDist = Infinity;
    for (let oy = -stickRadius; oy <= stickRadius; oy++) {
      const y = gy + oy;
      if (y < 0 || y >= gh) continue;
      for (let ox = -stickRadius; ox <= stickRadius; ox++) {
        const x = gx + ox;
        if (x < 0 || x >= gw) continue;
        const idx = occupancy[gridIndex(x, y)];
        if (idx === -1) continue;
        const dist = ox * ox + oy * oy;
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      }
    }
    return best;
  }

  function pickDarkestCell(samples) {
    let best = null;
    let bestDarkness = -1;
    for (let i = 0; i < samples; i++) {
      const gx = Math.floor(rng() * gw);
      const gy = Math.floor(rng() * gh);
      const [x, y] = gridToWorld(gx, gy);
      const darkness = getPixel(x, y);
      if (darkness > bestDarkness) {
        bestDarkness = darkness;
        best = [gx, gy];
      }
    }
    return best;
  }

  for (let i = 0; i < seedCount; i++) {
    let gx = Math.floor(gw / 2);
    let gy = Math.floor(gh / 2);
    if (seedMode === 'random') {
      gx = Math.floor(rng() * gw);
      gy = Math.floor(rng() * gh);
    } else if (seedMode === 'darkest') {
      const best = pickDarkestCell(120);
      if (best) {
        gx = best[0];
        gy = best[1];
      }
    }
    addPoint(gx, gy, null);
  }

  const targetPoints = points.length + particleTarget;
  const radius = Math.min(gw, gh) * 0.45;
  const cx = gw / 2;
  const cy = gh / 2;

  let attempts = 0;
  const maxAttempts = targetPoints * 6;
  while (points.length < targetPoints && attempts < maxAttempts) {
    attempts++;
    let gx = 0;
    let gy = 0;
    if (spawnMode === 'random') {
      gx = Math.floor(rng() * gw);
      gy = Math.floor(rng() * gh);
    } else if (spawnMode === 'circle') {
      const angle = rng() * Math.PI * 2;
      gx = clamp(Math.round(cx + Math.cos(angle) * radius), 0, gw - 1);
      gy = clamp(Math.round(cy + Math.sin(angle) * radius), 0, gh - 1);
    } else {
      if (rng() < 0.5) {
        gx = Math.floor(rng() * gw);
        gy = rng() < 0.5 ? 0 : gh - 1;
      } else {
        gx = rng() < 0.5 ? 0 : gw - 1;
        gy = Math.floor(rng() * gh);
      }
    }

    for (let step = 0; step < maxSteps; step++) {
      const neighbor = findNearestOccupied(gx, gy);
      if (neighbor !== -1) {
        const [x, y] = gridToWorld(gx, gy);
        const darkness = getPixel(x, y);
        const adjusted = Math.max(darkness, minDarkness);
        const prob = Math.min(1, Math.pow(adjusted / 255, power) * stickiness);
        if (rng() < prob) {
          if (addPoint(gx, gy, neighbor)) {
            break;
          }
        }
      }

      let rx = rng() * 2 - 1;
      let ry = rng() * 2 - 1;
      if (bias > 0) {
        const [x, y] = gridToWorld(gx, gy);
        const gxGrad = getPixel(clamp(x + 1, 0, width - 1), y) - getPixel(clamp(x - 1, 0, width - 1), y);
        const gyGrad = getPixel(x, clamp(y + 1, 0, height - 1)) - getPixel(x, clamp(y - 1, 0, height - 1));
        const norm = Math.hypot(gxGrad, gyGrad) || 1;
        rx += (gxGrad / norm) * bias;
        ry += (gyGrad / norm) * bias;
      }

      const len = Math.hypot(rx, ry) || 1;
      gx += Math.round(rx / len);
      gy += Math.round(ry / len);

      if (gx < 0 || gx >= gw || gy < 0 || gy >= gh) {
        break;
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
