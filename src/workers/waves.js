import { defaultControls, pixelProcessor, depthProcessor, postLines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Angle', value: 0, min: 0, max: 360 },
    { label: 'Step size', value: 5, min: 1, max: 20, step: 0.1 },
    { label: 'Depth Displace', value: 0, min: 0, max: 100, step: 1 },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;

  const displaceAmount = Number(config['Depth Displace']) || 0;
  const depthData = config.depthData;
  const useDepthDisplace =
    displaceAmount > 0 && depthData && depthData.data && depthData.width && depthData.height;

  // When depth displacement is active, ignore depth modulation in brightness
  // so the wave amplitude comes purely from image brightness, not flattened by depth.
  const getPixel = pixelProcessor(config, pixData, undefined, {
    ignoreDepth: useDepthDisplace,
  });

  const pi = Math.PI;
  const cos = Math.cos((config.Angle / 180) * pi);
  const sin = Math.sin((config.Angle / 180) * pi);
  const a = config['Step size'];
  const w = config.width;
  const h = config.height;
  const L = Math.sqrt(w * w + h * h);
  let getDepth = null;
  if (useDepthDisplace) {
    getDepth = depthProcessor(config, depthData);
  }

  let left = [],
    right = [];

  let lastline,
    line = [];

  function inside(x, y) {
    return x >= 0 && y >= 0 && x < w && y < h;
  }
  function pix(x, y) {
    return inside(x, y) ? ((255 - getPixel(Math.floor(x), Math.floor(y))) * a) / 255 : 0;
  }

  // initial straight line

  let x = (w - L * cos) / 2,
    y = (h - L * sin) / 2;
  for (let i = 0; i < L; i++) {
    x += cos;
    y += sin;
    line.push([x, y]);
  }
  left.push(line);

  for (let j = 0; j < L / 2 / a; j++) {
    lastline = line;
    line = [];
    for (let i = 0; i < L; i++) {
      x = lastline[i][0] + sin * a;
      y = lastline[i][1] - cos * a;
      let z = pix(x, y);
      x += sin * z;
      y -= cos * z;
      line.push([x, y]);
    }

    left.push(line);
  }

  line = left[0];

  for (let j = 0; j < L / 2 / a; j++) {
    lastline = line;
    line = [];
    for (let i = 0; i < L; i++) {
      x = lastline[i][0] - sin * a;
      y = lastline[i][1] + cos * a;
      let z = pix(x, y);
      x -= sin * z;
      y += cos * z;
      line.push([x, y]);
    }

    right.push(line);
  }

  right.reverse();
  let temp = right.concat(left),
    output = [];

  for (let i = 0; i < temp.length; i++) {
    let line = temp[i],
      newline = [];
    for (let j = 0; j < line.length; j++) {
      if (inside(line[j][0], line[j][1])) newline.push(line[j]);
    }
    if (newline.length > 1) output.push(newline);
  }

  // Apply depth displacement as a post-process so it doesn't cascade between lines.
  // Each point is shifted perpendicular to the line angle by the depth value,
  // creating a topographic 3D relief effect.
  if (useDepthDisplace) {
    for (let i = 0; i < output.length; i++) {
      const line = output[i];
      for (let j = 0; j < line.length; j++) {
        const px = line[j][0];
        const py = line[j][1];
        if (inside(px, py)) {
          const d = (getDepth(Math.floor(px), Math.floor(py)) / 255) * displaceAmount;
          line[j] = [px + sin * d, py - cos * d];
        }
      }
    }

    // Hidden line removal: process lines front-to-back (output is already
    // ordered from the front side of the perpendicular to the back side).
    // Track a "horizon" — the minimum height at each column along the line
    // direction. A point is visible only when its height is below the horizon,
    // meaning it is more displaced (closer to the viewer) than anything drawn
    // before at that column.
    const diagLen = Math.ceil(L) + 2;
    const horizonSize = 2 * diagLen + 2;
    const horizonOffset = diagLen;
    const horizon = new Float32Array(horizonSize);
    for (let k = 0; k < horizonSize; k++) horizon[k] = 1e9;

    const visible = [];
    for (let i = 0; i < output.length; i++) {
      const line = output[i];
      let seg = [];
      for (let j = 0; j < line.length; j++) {
        const dx = line[j][0];
        const dy = line[j][1];
        // Column along the line direction
        const col = Math.round(dx * cos + dy * sin);
        const ci = Math.max(0, Math.min(horizonSize - 1, col + horizonOffset));
        // Height in the perpendicular (displacement) direction
        const ht = -dx * sin + dy * cos;
        if (ht < horizon[ci]) {
          seg.push(line[j]);
          horizon[ci] = ht;
        } else {
          if (seg.length > 1) visible.push(seg);
          seg = [];
        }
      }
      if (seg.length > 1) visible.push(seg);
    }
    output = visible;
  }

  postLines(output);
};
