import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Squiggles', value: 2000, min: 500, max: 10000 },
    { label: 'Max Length', value: 10, min: 0.1, max: 20, step: 0.1 },
    { label: 'Min Arc', value: 10, min: 0, max: 180, step: 5 }, // degrees
    { label: 'Max Arc', value: 120, min: 0, max: 180, step: 5 }, // degrees
    { label: 'Rotation Factor', value: 0.5, min: -1, max: 1, step: 0.1 },
    { label: 'Optimize route', type: 'checkbox', checked: false },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const w = config.width,
    h = config.height;
  let output = [];

  // Calculate grid size to evenly distribute squiggles
  const gridSize = Math.sqrt((w * h) / config.Squiggles) | 0;
  for (let y = gridSize; y < h - gridSize; y += gridSize) {
    for (let x = gridSize; x < w - gridSize; x += gridSize) {
      let i = y * w + x;

      let length = config['Max Length'];
      let minArc = (config['Min Arc'] * Math.PI) / 180; // degrees to radians
      let maxArc = (config['Max Arc'] * Math.PI) / 180; // degrees to radians
      let normStrength = getPixel(x, y) / 255;
      let arcAngle = minArc + (maxArc - minArc) * normStrength;

      // rotate the arc based on strength and rotation factor
      let baseAngle = config['Rotation Factor'] * normStrength * Math.PI * 2;

      // Arc center is at (x, y)
      let points = [];
      let numPoints = 5;
      for (let j = 0; j < numPoints; j++) {
        let t = j / (numPoints - 1); // 0..1
        let theta = baseAngle - arcAngle / 2 + arcAngle * t;
        let px = x + Math.cos(theta) * length;
        let py = y + Math.sin(theta) * length;
        points.push([px, py]);
      }
      output.push(points);
    }
  }

  if (config['Optimize route']) {
    postMessage(['msg', 'Optimizing...']);
    output = sortlines(output);
  }

  postLines(output);
  postMessage(['msg', 'Done']);
};
