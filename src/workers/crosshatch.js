/**
 * Crosshatch algorithm
 * Creates cross-hatching lines with density based on image brightness
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Cell Size', value: 8, min: 3, max: 30, step: 1 },
    { label: 'Max Lines', value: 4, min: 1, max: 6, step: 1 },
    { label: 'Line Length', value: 1, min: 0.5, max: 1.5, step: 0.1 },
    { label: 'Angle Offset', value: 45, min: 0, max: 90, step: 5 },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const cellSize = config['Cell Size'];
  const maxLines = config['Max Lines'];
  const lineLength = config['Line Length'];
  const angleOffset = (config['Angle Offset'] * Math.PI) / 180;

  let lines = [];

  // Define hatching angles (will use more angles for darker areas)
  const angles = [
    0, // horizontal
    Math.PI / 2, // vertical
    angleOffset, // diagonal 1
    Math.PI - angleOffset, // diagonal 2
    angleOffset / 2, // half angle
    Math.PI - angleOffset / 2, // opposite half angle
  ];

  for (let y = cellSize / 2; y < config.height; y += cellSize) {
    for (let x = cellSize / 2; x < config.width; x += cellSize) {
      // Sample brightness at cell center
      const brightness = getPixel(x, y);

      // Number of hatch lines based on darkness (darker = more lines)
      const numLines = Math.floor((brightness / 255) * maxLines);

      if (numLines === 0) continue;

      const halfLen = (cellSize * lineLength) / 2;

      // Add hatching lines based on darkness level
      for (let i = 0; i < numLines && i < angles.length; i++) {
        const angle = angles[i];
        const dx = Math.cos(angle) * halfLen;
        const dy = Math.sin(angle) * halfLen;

        lines.push([
          [x - dx, y - dy],
          [x + dx, y + dy],
        ]);
      }
    }
  }

  // Sort lines to optimize plotter path
  if (lines.length > 0) {
    lines = sortlines(lines);
  }

  postLines(lines);
};
