/**
 * Hatch Moire algorithm
 * Overlays two hatch layers with slight offsets to create moire interference.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import { PVector, Polygon, degreesToRadians } from '../lib/hatcher.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 20, min: 8, max: 50, step: 1 },
    { label: 'Base Spacing', value: 2, min: 0.5, max: 8, step: 0.5 },
    { label: 'Spacing Range', value: 5, min: 0, max: 16, step: 0.5 },
    { label: 'Spacing Delta', value: 1, min: 0, max: 6, step: 0.5 },
    { label: 'Base Angle', value: 15, min: -90, max: 90, step: 5 },
    { label: 'Angle Delta', value: 12, min: 1, max: 45, step: 1 },
    { label: 'Drift Amount', value: 8, min: 0, max: 45, step: 1 },
    { label: 'Drift Scale', value: 0.18, min: 0.02, max: 1, step: 0.02 },
    { label: 'Spacing Curve', value: 1.4, min: 0.5, max: 3, step: 0.1 },
    { label: 'Density Power', value: 1.1, min: 0.5, max: 3, step: 0.1 },
    { label: 'Inset', value: 0, min: 0, max: 6, step: 0.5 },
    { label: 'Optimize route', type: 'checkbox', checked: true },
  ]),
]);

function addHatches(lines, hatches) {
  for (const seg of hatches) {
    lines.push([
      [seg.a.x, seg.a.y],
      [seg.b.x, seg.b.y],
    ]);
  }
}

function cellPolygon(x, y, size) {
  return new Polygon(
    PVector(x, y),
    PVector(x + size, y),
    PVector(x + size, y + size),
    PVector(x, y + size)
  );
}

onmessage = function (e) {
  const [config, pixData] = e.data;
  if (!pixData) return;

  const getPixel = pixelProcessor(config, pixData);
  const width = config.width;
  const height = config.height;

  const cellSize = config['Cell Size'];
  const baseSpacing = config['Base Spacing'];
  const spacingRange = config['Spacing Range'];
  const spacingDelta = config['Spacing Delta'];
  const baseAngle = degreesToRadians(config['Base Angle']);
  const angleDelta = degreesToRadians(config['Angle Delta']);
  const driftAmount = degreesToRadians(config['Drift Amount']);
  const driftScale = config['Drift Scale'];
  const spacingCurve = config['Spacing Curve'];
  const densityPower = config['Density Power'];
  const inset = config['Inset'];

  let lines = [];

  for (let y = 0; y < height; y += cellSize) {
    const row = Math.floor(y / cellSize);
    for (let x = 0; x < width; x += cellSize) {
      const col = Math.floor(x / cellSize);
      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;
      if (cx >= width || cy >= height) continue;

      let density = getPixel(cx, cy) / 255;
      if (density <= 0.02) continue;
      density = Math.pow(density, densityPower);

      const spacingA = Math.max(0.4, baseSpacing + (1 - density) * spacingRange);
      const spacingB = Math.max(0.4, spacingA + spacingDelta);
      const drift = driftAmount * Math.sin((row + col) * driftScale);
      const angleA = baseAngle + drift;
      const angleB = angleA + angleDelta;

      let poly = cellPolygon(x, y, cellSize);
      if (inset > 0) {
        const maxInset = cellSize * 0.5 - 0.5;
        const safeInset = Math.min(inset, maxInset);
        poly = Polygon.offset(poly, -safeInset);
        if (!poly) continue;
      }

      const hatchesA = poly.getHatchesParametric(
        angleA,
        spacingA,
        spacingA * (1 + density * 0.5),
        (t) => t ** spacingCurve,
        0,
        false
      );
      addHatches(lines, hatchesA);

      const hatchesB = poly.getHatchesParametric(
        angleB,
        spacingB,
        spacingB * (1 + density * 0.35),
        (t) => t ** spacingCurve,
        0,
        true
      );
      addHatches(lines, hatchesB);
    }
  }

  if (!lines.length) {
    postMessage(['svg-path', '']);
    return;
  }

  if (config['Optimize route'] && lines.length > 1) {
    lines = sortlines(lines);
  }

  postLines(lines);
};
