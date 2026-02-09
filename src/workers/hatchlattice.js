/**
 * Hatch Lattice algorithm
 * Builds nested hatch layers per cell using polygon offsets.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import { PVector, Polygon, degreesToRadians } from '../lib/hatcher.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 24, min: 10, max: 60, step: 1 },
    { label: 'Base Spacing', value: 1.5, min: 0.5, max: 8, step: 0.5 },
    { label: 'Spacing Range', value: 5, min: 0, max: 18, step: 0.5 },
    { label: 'Max Layers', value: 3, min: 1, max: 6, step: 1 },
    { label: 'Layer Inset', value: 2, min: 0.5, max: 10, step: 0.5 },
    { label: 'Base Angle', value: 45, min: -90, max: 90, step: 5 },
    { label: 'Layer Angle Step', value: 30, min: 0, max: 90, step: 5 },
    { label: 'Spacing Curve', value: 1.3, min: 0.5, max: 3, step: 0.1 },
    { label: 'Density Power', value: 1.2, min: 0.5, max: 3, step: 0.1 },
    { label: 'Alternate Layers', type: 'checkbox', checked: true },
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
  const maxLayers = config['Max Layers'];
  const layerInset = config['Layer Inset'];
  const baseAngle = degreesToRadians(config['Base Angle']);
  const layerAngleStep = degreesToRadians(config['Layer Angle Step']);
  const spacingCurve = config['Spacing Curve'];
  const densityPower = config['Density Power'];
  const alternateLayers = config['Alternate Layers'];

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
      const layers = Math.max(1, Math.ceil(density * maxLayers));
      const maxInset = cellSize * 0.5 - 0.5;

      const basePoly = cellPolygon(x, y, cellSize);

      for (let layer = 0; layer < layers; layer++) {
        const inset = layerInset * layer;
        if (inset >= maxInset) break;

        let poly = basePoly;
        if (inset > 0) {
          poly = Polygon.offset(basePoly, -inset);
          if (!poly) break;
        }

        const angle = baseAngle + layer * layerAngleStep;
        const hatches = poly.getHatchesParametric(
          angle,
          spacing,
          spacing * (1 + density * 0.5),
          (t) => t ** spacingCurve,
          0,
          alternateLayers && layer % 2 === 1
        );
        addHatches(lines, hatches);
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
