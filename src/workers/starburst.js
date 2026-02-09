/**
 * Starburst algorithm
 * Creates radial lines emanating from points, with length based on image brightness
 * Can create multiple focal points for interesting effects
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Ray Count', value: 360, min: 36, max: 720, step: 12 },
    { label: 'Max Length', value: 400, min: 50, max: 800, step: 25 },
    { label: 'Min Length', value: 5, min: 1, max: 50, step: 1 },
    { label: 'Center Mode', type: 'select', value: 'single', options: ['single', 'corners', 'grid', 'edges'] },
    { label: 'Taper', type: 'checkbox' },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const rayCount = config['Ray Count'];
  const maxLength = config['Max Length'];
  const minLength = config['Min Length'];
  const centerMode = config['Center Mode'];
  const taper = config['Taper'];

  const width = config.width;
  const height = config.height;

  let lines = [];

  // Determine center points based on mode
  let centers = [];

  if (centerMode === 'single') {
    centers = [[width / 2, height / 2]];
  } else if (centerMode === 'corners') {
    centers = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
  } else if (centerMode === 'grid') {
    const gridX = 3;
    const gridY = 3;
    for (let i = 0; i < gridX; i++) {
      for (let j = 0; j < gridY; j++) {
        centers.push([(width * (i + 0.5)) / gridX, (height * (j + 0.5)) / gridY]);
      }
    }
  } else if (centerMode === 'edges') {
    centers = [
      [width / 2, 0],
      [width / 2, height],
      [0, height / 2],
      [width, height / 2],
    ];
  }

  // Generate rays from each center
  const raysPerCenter = Math.floor(rayCount / centers.length);

  for (const [cx, cy] of centers) {
    for (let i = 0; i < raysPerCenter; i++) {
      const angle = (i / raysPerCenter) * Math.PI * 2;

      // Cast ray and sample brightness along it
      let rayLine = [];
      let lastAddedPoint = null;

      // Start from min length
      const startX = cx + Math.cos(angle) * minLength;
      const startY = cy + Math.sin(angle) * minLength;
      rayLine.push([startX, startY]);

      // Sample along the ray
      const sampleStep = 3;
      let drawing = true;
      let currentSegment = [[startX, startY]];

      for (let dist = minLength; dist < maxLength; dist += sampleStep) {
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;

        // Check bounds
        if (px < 0 || px >= width || py < 0 || py >= height) {
          if (currentSegment.length > 1) {
            lines.push(currentSegment);
          }
          break;
        }

        const brightness = getPixel(px, py);

        // Draw in darker areas
        const threshold = taper ? (dist / maxLength) * 128 + 64 : 80;

        if (brightness > threshold) {
          currentSegment.push([px, py]);
          drawing = true;
        } else {
          // Break the line in bright areas
          if (currentSegment.length > 1) {
            lines.push(currentSegment);
          }
          currentSegment = [];
          drawing = false;
        }
      }

      // Add final segment
      if (currentSegment.length > 1) {
        lines.push(currentSegment);
      }
    }
  }

  // Sort lines for optimal plotting
  if (lines.length > 0) {
    lines = sortlines(lines);
  }

  postLines(lines);
};
