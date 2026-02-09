import { defaultControls, pixelProcessor, postCurves } from '../helpers.js';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Frequency', value: 150, min: 5, max: 512 },
    { label: 'Line Count', value: 50, min: 10, max: 200 },
    { label: 'Amplitude', value: 1, min: 0.1, max: 5, step: 0.1 },
    { label: 'Sampling', value: 1, min: 0.5, max: 2.9, step: 0.1 },
    { label: 'Modulation', type: 'select', value: 'Both', options: ['Both', 'AM', 'FM'] },
    { label: 'Join Ends', type: 'select', value: 'No', options: ['No', 'Straight', 'Straight Smooth', 'Round', 'Pointy'] },
  ]),
]);

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const width = parseInt(config.width);
  const height = parseInt(config.height);
  const lineCount = Math.max(1, parseInt(config['Line Count']));
  const spacing = Math.max(0.1, parseFloat(config.Sampling));
  const amplitude = parseFloat(config.Amplitude);
  const frequency = Math.max(1, parseFloat(config.Frequency));
  const modulation = String(config.Modulation || 'Both').toLowerCase();
  const AM = modulation !== 'fm';
  const FM = modulation !== 'am';
  const rawJoin = config['Join Ends'];
  let joinStyle = 'No';
  if (typeof rawJoin === 'string') joinStyle = rawJoin;
  else if (rawJoin) joinStyle = 'Straight';
  const joined = joinStyle !== 'No';

  let squiggleData = [];
  if (joined) squiggleData[0] = [];
  let toggle = false;
  const horizontalLineSpacing = Math.max(1, Math.floor(height / lineCount));
  const baseInset = joined ? Math.max(6, Math.round(Math.min(width, height) * 0.05)) : 0;
  const maxInset = Math.max(0, Math.floor(width / 2) - 1);
  const inset = Math.min(baseInset, maxInset);
  const xMin = inset;
  const xMax = width - inset;
  const joinRadius = joined ? Math.max(2, Math.min(inset, Math.round(horizontalLineSpacing * 0.5))) : 0;
  const minPhaseIncr = (10 * Math.PI * 2 * spacing) / Math.max(1, width);
  const penWidthValue = Number(config.penWidth ?? config['Pen Width']);
  const strokeWidth = Number.isFinite(penWidthValue) && penWidthValue > 0 ? penWidthValue : 2;
  let maxPhaseIncr = (2 * Math.PI * spacing) / strokeWidth;
  if (!Number.isFinite(maxPhaseIncr) || maxPhaseIncr <= 0) maxPhaseIncr = Infinity;
  if (maxPhaseIncr < minPhaseIncr) maxPhaseIncr = minPhaseIncr;

  const clampX = (x) => Math.max(0, Math.min(width, x));
  const appendJoinPoints = (line, endX, y, yNext) => {
    if (!joined || joinStyle === 'No') return;

    const midY = (y + yNext) / 2;
    const outward = Math.abs(endX - xMin) < 0.001 ? -1 : 1;
    const bulgeX = clampX(endX + outward * joinRadius);

    if (joinStyle === 'Straight') {
      line.push([endX, yNext]);
      return;
    }

    if (joinStyle === 'Straight Smooth') {
      const insetY = horizontalLineSpacing * 0.33;
      line.push([bulgeX, y + insetY]);
      line.push([bulgeX, yNext - insetY]);
      line.push([endX, yNext]);
      return;
    }

    if (joinStyle === 'Pointy') {
      line.push([bulgeX, midY]);
      line.push([endX, yNext]);
      return;
    }

    if (joinStyle === 'Round') {
      const radius = joinRadius;
      const centerX = endX + outward * radius;
      const centerY = midY;
      const steps = 6;
      const startAngle = outward > 0 ? Math.PI / 2 : -Math.PI / 2;
      const endAngle = outward > 0 ? (Math.PI * 3) / 2 : Math.PI / 2;

      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const angle = startAngle + (endAngle - startAngle) * t;
        line.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius]);
      }
      line.push([endX, yNext]);
    }
  };

  const startXMin = xMax <= xMin ? 0 : xMin;
  const startXMax = xMax <= xMin ? width : xMax;

  for (let y = 0; y < height; y += horizontalLineSpacing) {
    toggle = !toggle;
    const reverseRow = !toggle;
    const startX = reverseRow ? startXMax : startXMin;
    const endX = reverseRow ? startXMin : startXMax;

    let phase = 0;
    let lastPhase = 0;
    let lastAmpl = 0;
    let lastX = startXMin;
    let x = startXMin;
    let finalStep = false;
    const xPoints = [];
    const yPoints = [];

    while (!finalStep) {
      x += spacing;
      if (x + spacing >= startXMax) finalStep = true;

      const z = getPixel(x, y);
      const targetAmpl = (amplitude * (AM ? z : 255)) / lineCount;
      let df = (FM ? z : 255) / frequency;
      if (df < minPhaseIncr) df = minPhaseIncr;
      if (df > maxPhaseIncr) df = maxPhaseIncr;

      phase += df;
      const deltaX = x - lastX;
      const deltaAmpl = targetAmpl - lastAmpl;
      const deltaPhase = phase - lastPhase;

      if (!finalStep && deltaPhase > Math.PI / 2) {
        const vertexCount = Math.floor(deltaPhase / (Math.PI / 2));
        const integerPart = ((vertexCount * (Math.PI / 2)) / deltaPhase);
        const deltaXTruncate = deltaX * integerPart;
        const xPerVertex = deltaXTruncate / vertexCount;
        const amplPerVertex = (integerPart * deltaAmpl) / vertexCount;

        for (let i = 0; i < vertexCount; i += 1) {
          lastX += xPerVertex;
          lastPhase += Math.PI / 2;
          lastAmpl += amplPerVertex;
          xPoints.push(lastX);
          yPoints.push(y + Math.sin(lastPhase) * lastAmpl);
        }
      }
    }

    if (reverseRow) {
      xPoints.reverse();
      yPoints.reverse();
    }

    let currentLine = [];
    currentLine.push([startX, y]);
    for (let i = 0; i < xPoints.length; i += 1) {
      currentLine.push([xPoints[i], yPoints[i]]);
    }
    currentLine.push([endX, y]);

    if (joined) {
      const nextY = y + horizontalLineSpacing;
      if (squiggleData[0].length > 0 && currentLine.length > 1) {
        currentLine = currentLine.slice(1);
      }
      if (nextY < height) appendJoinPoints(currentLine, endX, y, nextY);
      squiggleData[0] = squiggleData[0].concat(currentLine);
    } else {
      squiggleData.push(currentLine);
    }
  }

  postCurves(squiggleData);
};
