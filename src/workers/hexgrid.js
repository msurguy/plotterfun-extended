/**
 * Hexagonal Grid algorithm
 * Creates a hexagonal grid with various fill patterns based on brightness
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Hex Size', value: 15, min: 5, max: 50, step: 1 },
    { label: 'Fill Style', type: 'select', value: 'spiral', options: ['spiral', 'lines', 'dots', 'nested'] },
    { label: 'Max Detail', value: 5, min: 1, max: 10, step: 1 },
    { label: 'Draw Borders', type: 'checkbox' },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const hexSize = config['Hex Size'];
  const fillStyle = config['Fill Style'];
  const maxDetail = config['Max Detail'];
  const drawBorders = config['Draw Borders'];

  const width = config.width;
  const height = config.height;

  let lines = [];

  // Hexagon geometry
  const hexWidth = hexSize * 2;
  const hexHeight = Math.sqrt(3) * hexSize;
  const horizSpacing = hexWidth * 0.75;
  const vertSpacing = hexHeight;

  // Generate hex grid
  let row = 0;
  for (let y = 0; y < height + hexHeight; y += vertSpacing) {
    const offsetX = (row % 2) * (horizSpacing / 2);

    for (let x = -hexSize; x < width + hexSize; x += horizSpacing) {
      const cx = x + offsetX;
      const cy = y;

      // Get brightness at hex center
      const brightness = getPixel(cx, cy);

      // Skip very bright areas
      if (brightness < 20) continue;

      // Calculate detail level based on brightness
      const detailLevel = Math.ceil((brightness / 255) * maxDetail);

      // Draw hexagon border if enabled
      if (drawBorders && brightness > 50) {
        const hexPoints = [];
        for (let i = 0; i <= 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          hexPoints.push([cx + Math.cos(angle) * hexSize * 0.95, cy + Math.sin(angle) * hexSize * 0.95]);
        }
        lines.push(hexPoints);
      }

      // Draw fill pattern based on style
      if (fillStyle === 'spiral') {
        // Spiral fill
        const spiralPoints = [];
        const maxR = hexSize * 0.8;
        const turns = detailLevel;
        const steps = turns * 20;

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const r = t * maxR;
          const angle = t * turns * Math.PI * 2;
          spiralPoints.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
        }

        if (spiralPoints.length > 2) {
          lines.push(spiralPoints);
        }
      } else if (fillStyle === 'lines') {
        // Parallel lines fill
        const lineSpacing = hexSize / (detailLevel + 1);
        const angle = (brightness / 255) * Math.PI; // Vary angle by brightness

        for (let i = -detailLevel; i <= detailLevel; i++) {
          const offset = i * lineSpacing;
          const perpX = Math.cos(angle + Math.PI / 2) * offset;
          const perpY = Math.sin(angle + Math.PI / 2) * offset;

          // Line endpoints clipped to hex
          const lineLen = hexSize * 0.8;
          lines.push([
            [cx + perpX - Math.cos(angle) * lineLen, cy + perpY - Math.sin(angle) * lineLen],
            [cx + perpX + Math.cos(angle) * lineLen, cy + perpY + Math.sin(angle) * lineLen],
          ]);
        }
      } else if (fillStyle === 'dots') {
        // Concentric dots/circles
        for (let i = 1; i <= detailLevel; i++) {
          const r = (i / (detailLevel + 1)) * hexSize * 0.8;
          const circlePoints = [];
          const circleSegments = Math.max(8, Math.floor(r * 2));

          for (let j = 0; j <= circleSegments; j++) {
            const angle = (j / circleSegments) * Math.PI * 2;
            circlePoints.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
          }
          lines.push(circlePoints);
        }
      } else if (fillStyle === 'nested') {
        // Nested hexagons
        for (let i = 1; i <= detailLevel; i++) {
          const scale = i / (detailLevel + 1);
          const innerSize = hexSize * scale * 0.85;
          const hexPoints = [];

          for (let j = 0; j <= 6; j++) {
            const angle = (Math.PI / 3) * j - Math.PI / 6;
            hexPoints.push([cx + Math.cos(angle) * innerSize, cy + Math.sin(angle) * innerSize]);
          }
          lines.push(hexPoints);
        }
      }
    }
    row++;
  }

  // Sort lines for optimal plotting
  if (lines.length > 0) {
    lines = sortlines(lines);
  }

  postLines(lines);
};
