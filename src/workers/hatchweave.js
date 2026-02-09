/**
 * Hatch Weave algorithm
 * Creates woven hatching by alternating angles and spacing per cell.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import { PVector, Polygon, degreesToRadians } from '../lib/hatcher.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 24, min: 8, max: 60, step: 1 },
    { label: 'Base Spacing', value: 1.5, min: 0.5, max: 8, step: 0.5 },
    { label: 'Spacing Range', value: 6, min: 0, max: 20, step: 0.5 },
    { label: 'Base Angle', value: 0, min: -90, max: 90, step: 5 },
    { label: 'Twist Amount', value: 25, min: 0, max: 90, step: 5 },
    { label: 'Twist Scale', value: 0.2, min: 0.02, max: 1, step: 0.02 },
    { label: 'Cross Angle', value: 90, min: 30, max: 150, step: 5 },
    { label: 'Cross Threshold', value: 0.6, min: 0, max: 1, step: 0.05 },
    { label: 'Inset', value: 0, min: 0, max: 6, step: 0.5 },
    { label: 'Density Power', value: 1.2, min: 0.5, max: 3, step: 0.1 },
    { label: 'Alternate Cells', type: 'checkbox', checked: true },
    { label: 'Optimize route', type: 'checkbox', checked: true },
  ]),
]);

const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

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
  const baseAngle = degreesToRadians(config['Base Angle']);
  const twistAmount = degreesToRadians(config['Twist Amount']);
  const twistScale = config['Twist Scale'];
  const crossAngle = degreesToRadians(config['Cross Angle']);
  const crossThreshold = config['Cross Threshold'];
  const inset = config['Inset'];
  const densityPower = config['Density Power'];
  const alternateCells = config['Alternate Cells'];

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

      const spacing = Math.max(0.4, baseSpacing + (1 - density) * spacingRange);
      const twist = twistAmount * Math.sin((row + col) * twistScale);
      const angle = baseAngle + twist;

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
        easeSine,
        0,
        alternateCells && (row + col) % 2 === 0
      );
      addHatches(lines, hatches);

      if (density >= crossThreshold) {
        const crossHatches = poly.getHatchesParametric(
          angle + crossAngle,
          spacing * 1.1,
          spacing * (1 + density * 0.4),
          easeSine,
          0,
          false
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
