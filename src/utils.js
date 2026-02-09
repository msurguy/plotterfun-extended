// General utility functions for Plotterfun

import { OUTPUT_UNIT_TO_MM, OUTPUT_VALUE_DECIMALS, MAX_PATH_LENGTH, PATH_DECIMALS } from './constants.js';

// Range/Input synchronization
export function syncRangePair(rangeEl, numberEl, onChange) {
  if (!rangeEl || !numberEl) return;
  const applyValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    rangeEl.value = String(numeric);
    numberEl.value = String(numeric);
    onChange(numeric);
  };
  rangeEl.addEventListener('input', () => applyValue(rangeEl.value));
  numberEl.addEventListener('input', () => applyValue(numberEl.value));
  applyValue(rangeEl.value);
}

// Output size utilities
export function normalizeOutputUnit(unit) {
  return unit === 'mm' ? 'mm' : 'in';
}

export function normalizeOutputDpi(value) {
  const numeric = Number(value);
  return numeric === 72 ? 72 : 96;
}

export function roundOutputValue(value, decimals = OUTPUT_VALUE_DECIMALS) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatOutputValue(value, decimals = OUTPUT_VALUE_DECIMALS) {
  if (!Number.isFinite(value)) return '';
  return String(roundOutputValue(value, decimals));
}

export function convertOutputValue(value, fromUnit, toUnit) {
  const from = OUTPUT_UNIT_TO_MM[normalizeOutputUnit(fromUnit)];
  const to = OUTPUT_UNIT_TO_MM[normalizeOutputUnit(toUnit)];
  if (!Number.isFinite(value) || !from || !to) return value;
  return (value * from) / to;
}

// Color utilities
export function normalizeHexColor(value) {
  if (!value) return null;
  let hex = value.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex.toLowerCase();
}

export function hexToRgb(hex) {
  const value = normalizeHexColor(hex);
  if (!value) return [0, 0, 0];
  return [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  ];
}

export function sanitizeId(value, fallback) {
  const cleaned = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function clampByte(value) {
  if (value > 255) return 255;
  if (value < 0) return 0;
  return Math.floor(value);
}

export function weightedColorDistance(r, g, b, pr, pg, pb) {
  const dr = r - pr;
  const dg = g - pg;
  const db = b - pb;
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

// SVG path utilities
const svgNS = 'http://www.w3.org/2000/svg';
const pathLengthProbe = typeof document !== 'undefined' ? document.createElementNS(svgNS, 'path') : null;

export function formatPathPoint(value, decimals = PATH_DECIMALS) {
  return Number(value).toFixed(decimals);
}

export function buildPathFromPoints(points, decimals = PATH_DECIMALS) {
  if (!points || !points.length) return '';
  let pathData = `M${formatPathPoint(points[0][0], decimals)},${formatPathPoint(points[0][1], decimals)}`;
  for (let i = 1; i < points.length; i += 1) {
    pathData += `L${formatPathPoint(points[i][0], decimals)},${formatPathPoint(points[i][1], decimals)}`;
  }
  return pathData;
}

export function parseLinePoints(pathData) {
  const numbers = pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!numbers || numbers.length < 2) return [];
  const points = [];
  for (let i = 0; i < numbers.length - 1; i += 2) {
    points.push([Number(numbers[i]), Number(numbers[i + 1])]);
  }
  return points;
}

export function splitPointsByLength(points, maxLength) {
  if (!points || points.length <= 1) return points && points.length ? [points] : [];
  const chunks = [];
  let current = [points[0]];
  let currentLength = 0;

  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const segmentLength = Math.hypot(x2 - x1, y2 - y1);
    if (currentLength + segmentLength > maxLength && current.length > 1) {
      chunks.push(current);
      current = [points[i - 1], points[i]];
      currentLength = segmentLength;
    } else {
      current.push(points[i]);
      currentLength += segmentLength;
    }
  }

  if (current.length) chunks.push(current);
  return chunks;
}

export function isSimpleLinePath(pathData) {
  return !/[AaCcHhQqSsTtVvZz]/.test(pathData);
}

export function splitPathDataByLength(pathData, maxLength = MAX_PATH_LENGTH) {
  if (!pathData || !pathData.trim()) return [];
  const segments = pathData.match(/M[^M]*/g);
  if (!segments) return [];
  const output = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    let totalLength = 0;
    try {
      if (pathLengthProbe) {
        pathLengthProbe.setAttribute('d', trimmed);
        totalLength = pathLengthProbe.getTotalLength();
      }
    } catch (err) {
      output.push(trimmed);
      continue;
    }

    if (totalLength <= maxLength) {
      output.push(trimmed);
      continue;
    }

    if (!isSimpleLinePath(trimmed)) {
      output.push(trimmed);
      continue;
    }

    const points = parseLinePoints(trimmed);
    if (points.length < 2) {
      output.push(trimmed);
      continue;
    }

    const chunks = splitPointsByLength(points, maxLength);
    chunks.forEach((chunk) => {
      const pathChunk = buildPathFromPoints(chunk);
      if (pathChunk) output.push(pathChunk);
    });
  }

  return output;
}
