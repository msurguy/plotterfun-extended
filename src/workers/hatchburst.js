/**
 * Hatch Burst algorithm
 * Uses radial angle fields with optional crosshatching.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import { PVector, Polygon, degreesToRadians } from '../lib/hatcher.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 22, min: 8, max: 60, step: 1 },
    { label: 'Base Spacing', value: 2, min: 0.5, max: 8, step: 0.5 },
    { label: 'Spacing Range', value: 6, min: 0, max: 18, step: 0.5 },
    { label: 'Radial Bias', value: 0.8, min: 0, max: 1, step: 0.05 },
    { label: 'Swirl', value: 20, min: -90, max: 90, step: 5 },
    { label: 'Angle Offset', value: 0, min: -90, max: 90, step: 5 },
    { label: 'Cross Angle', value: 90, min: 30, max: 150, step: 5 },
    { label: 'Cross Threshold', value: 0.65, min: 0, max: 1, step: 0.05 },
    { label: 'Inset', value: 0, min: 0, max: 6, step: 0.5 },
    { label: 'Density Power', value: 1.15, min: 0.5, max: 3, step: 0.1 },
    { label: 'Optimize route', type: 'checkbox', checked: true },
  ]),
]);

const easePulse = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

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
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const maxRadius = Math.hypot(centerX, centerY) || 1;

  const cellSize = config['Cell Size'];
  const baseSpacing = config['Base Spacing'];
  const spacingRange = config['Spacing Range'];
  const radialBias = config['Radial Bias'];
  const swirl = degreesToRadians(config['Swirl']);
  const angleOffset = degreesToRadians(config['Angle Offset']);
  const crossAngle = degreesToRadians(config['Cross Angle']);
  const crossThreshold = config['Cross Threshold'];
  const inset = config['Inset'];
  const densityPower = config['Density Power'];

  let lines = [];

  for (let y = 0; y < height; y += cellSize) {
    for (let x = 0; x < width; x += cellSize) {
      const cx = x + cellSize * 0.5;
      const cy = y + cellSize * 0.5;
      if (cx >= width || cy >= height) continue;

      let density = getPixel(cx, cy) / 255;
      if (density <= 0.02) continue;
      density = Math.pow(density, densityPower);

      const spacing = Math.max(0.4, baseSpacing + (1 - density) * spacingRange);

      const dx = cx - centerX;
      const dy = cy - centerY;
      const radial = Math.atan2(dy, dx);
      const radiusFactor = Math.hypot(dx, dy) / maxRadius;
      const angle = radial + angleOffset + (1 - radialBias) * Math.PI * 0.5 + swirl * radiusFactor;

      let poly = cellPolygon(x, y, cellSize);
      if (inset > 0) {
        const maxInset = cellSize * 0.5 - 0.5;
        const safeInset = Math.min(inset, maxInset);
        poly = Polygon.offset(poly, -safeInset);
        if (!poly) continue;
      }

      const hatches = poly.getHatchesParametric(
        angle,
        spacing,
        spacing * (1 + density * 0.6),
        easePulse,
        0,
        false
      );
      addHatches(lines, hatches);

      if (density >= crossThreshold) {
        const crossHatches = poly.getHatchesParametric(
          angle + crossAngle,
          spacing * 1.05,
          spacing * (1 + density * 0.4),
          easePulse,
          0,
          true
        );
        addHatches(lines, crossHatches);
      }
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
