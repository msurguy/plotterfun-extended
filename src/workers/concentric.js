/**
 * Concentric algorithm
 * Creates concentric circles/rings with thickness based on image brightness
 * Circles emanate from the center of the image
 */

import { defaultControls, pixelProcessor, postLines, perlinNoise } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Ring Spacing', value: 6, min: 2, max: 20, step: 1 },
    { label: 'Amplitude', value: 3, min: 0.5, max: 10, step: 0.5 },
    { label: 'Segments', value: 180, min: 36, max: 360, step: 12 },
    { label: 'Wobble', value: 0.3, min: 0, max: 2, step: 0.1 },
    { label: 'Mode', type: 'select', value: 'modulated', options: ['modulated', 'broken', 'thickness'] },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const ringSpacing = config['Ring Spacing'];
  const amplitude = config['Amplitude'];
  const segments = config['Segments'];
  const wobble = config['Wobble'];
  const mode = config['Mode'];

  const width = config.width;
  const height = config.height;
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);

  let lines = [];

  // Generate concentric rings
  for (let r = ringSpacing; r < maxRadius; r += ringSpacing) {
    let line = [];
    let skipSegment = false;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;

      // Base position on circle
      const baseX = cx + Math.cos(angle) * r;
      const baseY = cy + Math.sin(angle) * r;

      // Get brightness at this position
      const brightness = getPixel(baseX, baseY);

      if (mode === 'broken') {
        // Break the circle in bright areas
        if (brightness < 80) {
          if (line.length > 2) {
            lines.push(line);
          }
          line = [];
          skipSegment = true;
          continue;
        }
        skipSegment = false;
      }

      // Calculate modulation
      let offset = 0;

      if (mode === 'modulated' || mode === 'thickness') {
        // Modulate radius based on brightness
        offset = (brightness / 255) * amplitude;

        // Add some Perlin noise wobble for organic feel
        if (wobble > 0) {
          offset += perlinNoise(angle * 3, r * 0.1) * wobble * amplitude;
        }
      }

      const finalR = r + offset;
      const px = cx + Math.cos(angle) * finalR;
      const py = cy + Math.sin(angle) * finalR;

      line.push([px, py]);

      // For thickness mode, add inner ring too
      if (mode === 'thickness' && brightness > 100) {
        const innerR = r - offset * 0.5;
        if (innerR > 0) {
          // We'll add these as separate lines later
        }
      }
    }

    if (line.length > 2) {
      // Close the ring if in modulated mode
      if (mode === 'modulated' && line.length > 0) {
        line.push(line[0]);
      }
      lines.push(line);
    }
  }

  // For thickness mode, add additional inner rings in dark areas
  if (mode === 'thickness') {
    for (let r = ringSpacing + ringSpacing / 2; r < maxRadius; r += ringSpacing) {
      let line = [];

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const baseX = cx + Math.cos(angle) * r;
        const baseY = cy + Math.sin(angle) * r;
        const brightness = getPixel(baseX, baseY);

        // Only draw inner ring in darker areas
        if (brightness > 150) {
          const offset = (brightness / 255) * amplitude * 0.3;
          const finalR = r - offset;
          const px = cx + Math.cos(angle) * finalR;
          const py = cy + Math.sin(angle) * finalR;
          line.push([px, py]);
        } else {
          if (line.length > 2) {
            lines.push(line);
          }
          line = [];
        }
      }

      if (line.length > 2) {
        lines.push(line);
      }
    }
  }

  postLines(lines);
};
