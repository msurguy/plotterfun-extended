/**
 * Circle Pack algorithm
 * Packs circles into darker areas using an RBush for fast collision checks.
 */

import { defaultControls, pixelProcessor, postCircles } from '../helpers.js';
import RBush from 'rbush';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Samples', value: 8000, min: 1000, max: 50000, step: 500 },
    { label: 'Max Circles', value: 2000, min: 200, max: 15000, step: 100 },
    { label: 'Min Radius', value: 1, min: 0.5, max: 10, step: 0.5 },
    { label: 'Max Radius', value: 8, min: 2, max: 30, step: 1 },
    { label: 'Padding', value: 0.4, min: 0, max: 4, step: 0.1 },
    { label: 'Darkness Power', value: 1.4, min: 0.4, max: 3, step: 0.1 },
    { label: 'Min Darkness', value: 10, min: 0, max: 200, step: 5 },
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

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const samples = config.Samples;
  const maxCircles = config['Max Circles'];
  const minRadius = config['Min Radius'];
  const maxRadius = config['Max Radius'];
  const padding = config.Padding;
  const power = config['Darkness Power'];
  const minDarkness = config['Min Darkness'];

  const width = config.width;
  const height = config.height;
  const rng = makeRng(config.Seed);

  const tree = new RBush();
  const circles = [];

  for (let i = 0; i < samples && circles.length < maxCircles; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const darkness = getPixel(x, y);
    if (darkness < minDarkness) continue;

    const t = Math.pow(darkness / 255, power);
    const r = minRadius + t * (maxRadius - minRadius);
    if (r <= 0) continue;

    if (x - r < 0 || x + r > width || y - r < 0 || y + r > height) continue;

    const padded = r + padding;
    const candidate = {
      minX: x - padded,
      minY: y - padded,
      maxX: x + padded,
      maxY: y + padded,
      x,
      y,
      r,
    };

    const hits = tree.search(candidate);
    let ok = true;
    for (const hit of hits) {
      const dx = hit.x - x;
      const dy = hit.y - y;
      const minDist = hit.r + r + padding;
      if (dx * dx + dy * dy < minDist * minDist) {
        ok = false;
        break;
      }
    }

    if (ok) {
      tree.insert(candidate);
      circles.push([x, y, r]);
    }
  }

  if (circles.length === 0) {
    self.postMessage(['svg-path', '']);
    return;
  }

  postCircles(circles);
};
