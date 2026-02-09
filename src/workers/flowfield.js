/**
 * Flow Field algorithm
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import RBush from 'rbush';

const EPS = 1e-10;

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Noise Scale', value: 0.001, min: 0.0002, max: 0.02, step: 0.0002 },
    { label: 'Field Copies', value: 1, min: 1, max: 8, step: 1 },
    { label: 'Min Separation', value: 0.8, min: 0.2, max: 12, step: 0.1 },
    { label: 'Max Separation', value: 10, min: 1, max: 30, step: 0.5 },
    { label: 'Min Length', value: 0, min: 0, max: 80, step: 1 },
    { label: 'Max Length', value: 40, min: 10, max: 200, step: 5 },
    { label: 'Test Frequency', value: 2, min: 1, max: 8, step: 0.5 },
    { label: 'Seedpoints per Path', value: 40, min: 4, max: 80, step: 1 },
    { label: 'Field Type', type: 'select', value: 'noise', options: ['noise', 'curl_noise'] },
    { label: 'Edge Field', value: 0, min: 0, max: 4, step: 0.1 },
    { label: 'Dark Field', value: 0, min: 0, max: 4, step: 0.1 },
    { label: 'Rotate Field', value: 0, min: -180, max: 180, step: 1 },
    { label: 'Mask Transparent', type: 'checkbox', checked: true },
    { label: 'Transparent Value', value: 127, min: 0, max: 255, step: 1 },
    { label: 'Max Size', value: 800, min: 200, max: 2000, step: 50 },
    { label: 'Seed', value: -1, min: -1, max: 100000, step: 1 },
    { label: 'Flow Seed', value: -1, min: -1, max: 100000, step: 1 },
    { label: 'Optimize Route', type: 'checkbox', checked: true },
  ]),
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function inside(x, y, width, height) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function remap(x, srcMin, srcMax, dstMin, dstMax) {
  const x01 = (x - srcMin) / (srcMax - srcMin);
  return x01 * (dstMax - dstMin) + dstMin;
}

function norm2vec(vec) {
  return Math.hypot(vec[0], vec[1]);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  if (!Number.isFinite(seed) || seed < 0) {
    return Math.random;
  }
  return mulberry32(Math.floor(seed));
}

function randomInt(rng, max) {
  return Math.floor(rng() * max);
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

class MinQueue {
  constructor() {
    this.data = [];
  }

  push(item) {
    const data = this.data;
    data.push(item);
    let index = data.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (data[parent].dist <= item.dist) break;
      data[index] = data[parent];
      index = parent;
    }
    data[index] = item;
  }

  pop() {
    const data = this.data;
    if (data.length === 0) return null;
    const root = data[0];
    const last = data.pop();
    if (data.length === 0) return root;
    let index = 0;
    const length = data.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= length) break;
      let smallest = left;
      if (right < length && data[right].dist < data[left].dist) {
        smallest = right;
      }
      if (data[smallest].dist >= last.dist) break;
      data[index] = data[smallest];
      index = smallest;
    }
    data[index] = last;
    return root;
  }

  peek() {
    return this.data[0] || null;
  }

  get length() {
    return this.data.length;
  }
}

function rbushKnn(tree, x, y, k = 1, predicate = null, maxDistance = Infinity) {
  const result = [];
  let node = tree.data;
  const queue = new MinQueue();
  const maxDistSq = Number.isFinite(maxDistance) ? maxDistance * maxDistance : Infinity;

  while (node) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const bbox = node.leaf ? tree.toBBox(child) : child;
      const dist = boxDist(x, y, bbox);
      if (dist <= maxDistSq) {
        queue.push({ node: child, isItem: node.leaf, dist });
      }
    }

    while (queue.length && queue.peek().isItem) {
      const candidate = queue.pop().node;
      if (!predicate || predicate(candidate)) {
        result.push(candidate);
        if (result.length === k) return result;
      }
    }

    const next = queue.pop();
    node = next ? next.node : null;
  }

  return result;
}

function boxDist(x, y, box) {
  const dx = axisDist(x, box.minX, box.maxX);
  const dy = axisDist(y, box.minY, box.maxY);
  return dx * dx + dy * dy;
}

function axisDist(k, min, max) {
  if (k < min) return min - k;
  if (k > max) return k - max;
  return 0;
}

const SIMPLEX_GRAD3 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0, 1],
  [0, -1],
];

function createSimplex2D(rng) {
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i >= 0; i--) {
    const j = randomInt(rng, i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return function (xin, yin) {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = permMod12[ii + perm[jj]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1]];
    const gi2 = permMod12[ii + 1 + perm[jj + 1]];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const g = SIMPLEX_GRAD3[gi0];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const g = SIMPLEX_GRAD3[gi1];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const g = SIMPLEX_GRAD3[gi2];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  };
}

function createSimplex2DFromSeed(seed) {
  return createSimplex2D(mulberry32(seed >>> 0));
}

function buildGuideAndMask(getPixel, pixData, width, height, fieldWidth, fieldHeight, scale, transparentVal) {
  const guide = new Float32Array(fieldWidth * fieldHeight);
  const mask = new Uint8Array(fieldWidth * fieldHeight);
  const invScale = 1 / scale;

  for (let y = 0; y < fieldHeight; y++) {
    const srcY = Math.min(height - 1, Math.floor(y * invScale));
    const srcRow = srcY * width;
    const rowOffset = y * fieldWidth;
    for (let x = 0; x < fieldWidth; x++) {
      const srcX = Math.min(width - 1, Math.floor(x * invScale));
      const srcIndex = srcX + srcRow;
      const alpha = pixData.data[4 * srcIndex + 3];
      const idx = rowOffset + x;
      const isOpaque = alpha > 0;
      mask[idx] = isOpaque ? 1 : 0;

      const darkness = getPixel(srcX, srcY);
      const brightness = clamp(255 - darkness, 0, 255);
      guide[idx] = isOpaque ? brightness : transparentVal;
    }
  }

  return { guide, mask };
}

function computeGradient(data, width, height) {
  const gradX = new Float32Array(width * height);
  const gradY = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      const idx = x + y * width;
      gradX[idx] = (data[x1 + y * width] - data[x0 + y * width]) * 0.5;
      gradY[idx] = (data[x + y1 * width] - data[x + y0 * width]) * 0.5;
    }
  }

  return { gradX, gradY };
}

function boxBlur(src, width, height, radius) {
  if (radius <= 0) {
    return src.slice();
  }

  const tmp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    let sum = 0;
    const rowOffset = y * width;
    for (let x = -radius; x <= radius; x++) {
      const cx = clamp(x, 0, width - 1);
      sum += src[rowOffset + cx];
    }
    for (let x = 0; x < width; x++) {
      tmp[rowOffset + x] = sum / windowSize;
      const xRemove = x - radius;
      const xAdd = x + radius + 1;
      sum += src[rowOffset + clamp(xAdd, 0, width - 1)] - src[rowOffset + clamp(xRemove, 0, width - 1)];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      const cy = clamp(y, 0, height - 1);
      sum += tmp[cy * width + x];
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / windowSize;
      const yRemove = y - radius;
      const yAdd = y + radius + 1;
      sum += tmp[clamp(yAdd, 0, height - 1) * width + x] - tmp[clamp(yRemove, 0, height - 1) * width + x];
    }
  }

  return dst;
}

function normalizeFlowField(field, width, height) {
  for (let i = 0; i < width * height; i++) {
    const idx = i * 2;
    const x = field[idx];
    const y = field[idx + 1];
    const norm = Math.hypot(x, y);
    if (norm > EPS) {
      field[idx] = x / norm;
      field[idx + 1] = y / norm;
    }
  }
  return field;
}

function rotateField(field, width, height, degrees) {
  if (degrees === 0) {
    return field;
  }
  const radians = (degrees * Math.PI) / 180;
  const s = Math.sin(radians);
  const c = Math.cos(radians);
  const rotated = new Float32Array(field.length);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 2;
    const x = field[idx];
    const y = field[idx + 1];
    rotated[idx] = c * x - s * y;
    rotated[idx + 1] = s * x + c * y;
  }
  return rotated;
}

function genNoiseField(width, height, mult, rng) {
  const noiseSeedX = randomInt(rng, 0x7fffffff);
  const noiseSeedY = randomInt(rng, 0x7fffffff);
  const xNoise = createSimplex2DFromSeed(noiseSeedX);
  const yNoise = createSimplex2DFromSeed(noiseSeedY);

  const field = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (x + y * width) * 2;
      let xVal = xNoise(x * mult, y * mult);
      let yVal = yNoise(x * mult, y * mult);
      const norm = Math.hypot(xVal, yVal);
      if (norm > EPS) {
        xVal /= norm;
        yVal /= norm;
      } else {
        xVal = 1;
        yVal = 0;
      }
      field[idx] = xVal;
      field[idx + 1] = yVal;
    }
  }

  return field;
}

function genCurlNoiseField(width, height, mult, rng) {
  const noiseSeed = randomInt(rng, 0x7fffffff);
  const noise = createSimplex2DFromSeed(noiseSeed);

  const scalar = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      scalar[x + y * width] = noise(x * mult, y * mult);
    }
  }

  const { gradX, gradY } = computeGradient(scalar, width, height);
  const field = new Float32Array(width * height * 2);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 2;
    field[idx] = gradY[i];
    field[idx + 1] = -gradX[i];
  }

  return normalizeFlowField(field, width, height);
}

function genEdgeField(width, height, guide) {
  const { gradX, gradY } = computeGradient(guide, width, height);
  const field = new Float32Array(width * height * 2);
  const weights = new Float32Array(width * height);
  let maxEdge = 0;

  for (let i = 0; i < width * height; i++) {
    const mag = Math.hypot(gradX[i], gradY[i]);
    weights[i] = mag;
    if (mag > maxEdge) maxEdge = mag;
    const idx = i * 2;
    field[idx] = gradY[i];
    field[idx + 1] = -gradX[i];
  }

  if (maxEdge > 0) {
    for (let i = 0; i < weights.length; i++) {
      weights[i] /= maxEdge;
    }
  }

  return { field: normalizeFlowField(field, width, height), weights };
}

function genDarkField(width, height, guide) {
  let blurKernel = Math.floor(Math.sqrt(width * height) / 4.5);
  if (blurKernel % 2 === 0) {
    blurKernel += 1;
  }
  const radius = Math.max(1, Math.floor(blurKernel / 2));
  const heights = boxBlur(guide, width, height, radius);

  const { gradX, gradY } = computeGradient(heights, width, height);
  const field = new Float32Array(width * height * 2);
  const weights = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 2;
    field[idx] = gradY[i];
    field[idx + 1] = -gradX[i];
    weights[i] = 1 - guide[i] / 255;
  }

  return { field: normalizeFlowField(field, width, height), weights };
}

class VectorField {
  constructor(field, width, height) {
    this.field = field;
    this.width = width;
    this.height = height;
  }

  get(pos) {
    const x = clamp(Math.round(pos[0]), 0, this.width - 1);
    const y = clamp(Math.round(pos[1]), 0, this.height - 1);
    const idx = (x + y * this.width) * 2;
    return [this.field[idx], this.field[idx + 1]];
  }
}

class RBushSearcher {
  constructor() {
    this.tree = new RBush();
    this.count = 0;
  }

  addPoint(point) {
    const x = point[0];
    const y = point[1];
    this.tree.insert({ minX: x, minY: y, maxX: x, maxY: y, x, y });
    this.count += 1;
  }

  getNearest(point) {
    if (this.count === 0) {
      return [Infinity, null];
    }
    const x = point[0];
    const y = point[1];
    const nearest = rbushKnn(this.tree, x, y, 1);
    if (!nearest || nearest.length === 0) {
      return [Infinity, null];
    }
    const item = nearest[0];
    const dist = Math.hypot(item.x - x, item.y - y);
    return [dist, item];
  }
}

class LinePath {
  constructor() {
    this.data = [];
    this.lineLength = 0;
  }

  append(point) {
    if (this.data.length > 0) {
      const last = this.data[this.data.length - 1];
      this.lineLength += Math.hypot(last[0] - point[0], last[1] - point[1]);
    }
    this.data.push(point);
  }

  get length() {
    return this.data.length;
  }
}

function rungeKutta(field, pos, h) {
  const k1 = field.get(pos);

  const k2pos = [pos[0] + (h / 2) * k1[0], pos[1] + (h / 2) * k1[1]];
  const k2 = field.get(k2pos);

  const k3pos = [pos[0] + (h / 2) * k2[0], pos[1] + (h / 2) * k2[1]];
  const k3 = field.get(k3pos);

  const k4pos = [pos[0] + h * k3[0], pos[1] + h * k3[1]];
  const k4 = field.get(k4pos);

  return [(k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6, (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6];
}

function generateSeedpoints(path, dSepFn, count) {
  if (path.length < 2 || count <= 0) {
    return [];
  }

  const seeds = [];
  const seedpointIds = new Set();
  if (count === 1) {
    seedpointIds.add(0);
  } else {
    const step = (path.length - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      seedpointIds.add(Math.round(i * step));
    }
  }

  let curXY = path[0];
  let direction = [path[1][0] - path[0][0], path[1][1] - path[0][1]];
  const dirNorm = Math.max(norm2vec(direction), EPS);
  direction = [direction[0] / dirNorm, direction[1] / dirNorm];
  let normal = [direction[1], -direction[0]];
  const margin = 1.1;

  seeds.push([curXY[0] + margin * dSepFn(curXY) * normal[0], curXY[1] + margin * dSepFn(curXY) * normal[1]]);
  seeds.push([curXY[0] - margin * dSepFn(curXY) * normal[0], curXY[1] - margin * dSepFn(curXY) * normal[1]]);

  seeds.push([curXY[0] - margin * dSepFn(curXY) * direction[0], curXY[1] - margin * dSepFn(curXY) * direction[1]]);
  seeds.push([
    curXY[0] - margin * dSepFn(curXY) * direction[0] + margin * dSepFn(curXY) * normal[0],
    curXY[1] - margin * dSepFn(curXY) * direction[1] + margin * dSepFn(curXY) * normal[1],
  ]);
  seeds.push([
    curXY[0] - margin * dSepFn(curXY) * direction[0] - margin * dSepFn(curXY) * normal[0],
    curXY[1] - margin * dSepFn(curXY) * direction[1] - margin * dSepFn(curXY) * normal[1],
  ]);

  for (let i = 1; i < path.length; i++) {
    if (!seedpointIds.has(i)) continue;
    const lastXY = curXY;
    curXY = path[i];
    direction = [curXY[0] - lastXY[0], curXY[1] - lastXY[1]];
    const dirLen = Math.max(norm2vec(direction), EPS);
    direction = [direction[0] / dirLen, direction[1] / dirLen];
    const normVec = [direction[1], -direction[0]];
    normal[0] = normVec[0];
    normal[1] = normVec[1];
    seeds.push([curXY[0] + margin * dSepFn(curXY) * normal[0], curXY[1] + margin * dSepFn(curXY) * normal[1]]);
    seeds.push([curXY[0] - margin * dSepFn(curXY) * normal[0], curXY[1] - margin * dSepFn(curXY) * normal[1]]);
  }

  seeds.push([curXY[0] + margin * dSepFn(curXY) * direction[0], curXY[1] + margin * dSepFn(curXY) * direction[1]]);
  seeds.push([
    curXY[0] + margin * dSepFn(curXY) * direction[0] + margin * dSepFn(curXY) * normal[0],
    curXY[1] + margin * dSepFn(curXY) * direction[1] + margin * dSepFn(curXY) * normal[1],
  ]);
  seeds.push([
    curXY[0] + margin * dSepFn(curXY) * direction[0] - margin * dSepFn(curXY) * normal[0],
    curXY[1] + margin * dSepFn(curXY) * direction[1] - margin * dSepFn(curXY) * normal[1],
  ]);

  return seeds;
}

function computeStreamline(fieldGetter, seedPos, searcher, dTestFn, dSepFn, shouldStopFn, makeSearcher) {
  let directionSign = 1;
  let pos = seedPos.slice();
  const paths = [];
  let path = new LinePath();
  path.append(pos.slice());
  let stopTracking = false;
  const selfSearcher = makeSearcher();

  while (true) {
    const field = fieldGetter(path.lineLength, directionSign);
    const step = dTestFn(pos);
    const rk = rungeKutta(field, pos, step);
    const newPos = [pos[0] + step * rk[0] * directionSign, pos[1] + step * rk[1] * directionSign];

    if (shouldStopFn(newPos, searcher, path)) {
      stopTracking = true;
    }

    const [nearestDist] = selfSearcher.getNearest(newPos);
    if (nearestDist < dSepFn(pos)) {
      stopTracking = true;
    }

    const lookback = 15;
    if (path.length >= 2 * lookback) {
      selfSearcher.addPoint(path.data[path.length - lookback]);
    }

    if (path.length >= 600) {
      stopTracking = true;
    }

    if (!stopTracking) {
      path.append(newPos.slice());
    }

    if (stopTracking) {
      paths.push(path.data);
      if (directionSign === 1) {
        directionSign = -1;
        pos = seedPos.slice();
        path = new LinePath();
        path.append(pos.slice());
        stopTracking = false;
      } else {
        break;
      }
    } else {
      pos = newPos;
    }
  }

  if (paths.length === 1) {
    return paths[0];
  }

  const reversed = paths[1].slice().reverse();
  return reversed.concat(paths[0].slice(1));
}

function maskPaths(paths, mask, width, height) {
  const masked = [];
  for (const path of paths) {
    let current = [];
    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      const x = clamp(Math.round(pt[0]), 0, width - 1);
      const y = clamp(Math.round(pt[1]), 0, height - 1);
      const onMask = mask[x + y * width] > 0;
      if (!onMask) {
        if (current.length >= 2) {
          masked.push(current);
        }
        current = [];
      } else {
        current.push(pt);
      }
    }
    if (current.length >= 2) {
      masked.push(current);
    }
  }
  return masked;
}

function drawFieldsUniform(fields, dSepFn, options) {
  const {
    width,
    height,
    minLength,
    maxLength,
    minSep,
    seedpointsPerPath,
    testFrequency,
    rng,
  } = options;

  const makeSearcher = () => new RBushSearcher();
  const searcher = makeSearcher();

  const dTestFn = (pos) => dSepFn(pos) / testFrequency;
  const shouldStop = (newPos, searcherRef, path) => {
    if (path.lineLength < minLength) {
      return false;
    }
    const x = Math.round(newPos[0]);
    const y = Math.round(newPos[1]);
    if (!inside(x, y, width, height)) {
      return true;
    }
    if (searcherRef) {
      const [dist] = searcherRef.getNearest(newPos);
      if (dist < dSepFn(newPos)) {
        return true;
      }
    }
    if (path.lineLength > maxLength) {
      return true;
    }
    return false;
  };

  class MemorySelector {
    constructor(fields, rng) {
      this.sameFieldLen = 10;
      this.curLen = 0;
      this.idx = randomInt(rng, fields.length);
      this.fields = fields;
      this.rng = rng;
    }

    selectField(pathLen) {
      if (pathLen - this.curLen > this.sameFieldLen) {
        this.curLen = pathLen;
        const delta = randomInt(this.rng, 3) - 1;
        this.idx = (this.idx + delta + this.fields.length) % this.fields.length;
      }
      return this.fields[this.idx];
    }
  }

  const seedpoints = [[width / 2, height / 2]];
  const paths = [];
  let drawn = 0;

  while (seedpoints.length) {
    let seedPos = null;
    while (seedpoints.length) {
      const candidate = seedpoints.pop();
      const sx = Math.round(candidate[0]);
      const sy = Math.round(candidate[1]);
      if (!inside(sx, sy, width, height)) {
        continue;
      }
      const [dist] = searcher.getNearest(candidate);
      if (dist < dSepFn(candidate)) {
        continue;
      }
      seedPos = candidate;
      break;
    }
    if (!seedPos) {
      break;
    }

    const selector = new MemorySelector(fields, rng);
    const path = computeStreamline(
      selector.selectField.bind(selector),
      seedPos,
      searcher,
      dTestFn,
      dSepFn,
      shouldStop,
      makeSearcher
    );

    if (!path || path.length <= 2) {
      continue;
    }

    for (let i = 0; i < path.length; i++) {
      searcher.addPoint(path[i]);
    }
    paths.push(path);

    const newSeeds = generateSeedpoints(path, dSepFn, seedpointsPerPath);
    shuffleInPlace(newSeeds, rng);
    for (let i = 0; i < newSeeds.length; i++) {
      seedpoints.push(newSeeds[i]);
    }

    drawn++;
    if (drawn % 100 === 0) {
      postMessage(['msg', `Tracing lines: ${drawn}`]);
    }
  }

  return paths;
}

onmessage = function (e) {
  const [config, pixData] = e.data;
  if (!pixData) return;

  const width = Math.floor(config.width);
  const height = Math.floor(config.height);
  const getPixel = pixelProcessor(config, pixData);

  const noiseScale = config['Noise Scale'];
  const fieldCopies = Math.max(1, Math.round(config['Field Copies']));
  const minSep = Math.max(EPS, config['Min Separation']);
  const maxSep = Math.max(minSep, config['Max Separation']);
  const minLength = Math.max(0, config['Min Length']);
  const maxLength = Math.max(minLength, config['Max Length']);
  const testFrequency = Math.max(1, config['Test Frequency']);
  const seedpointsPerPath = Math.max(1, Math.round(config['Seedpoints per Path']));
  const fieldType = config['Field Type'];
  const edgeMultiplier = config['Edge Field'];
  const darkMultiplier = config['Dark Field'];
  const rotate = config['Rotate Field'];
  const maskTransparent = config['Mask Transparent'];
  const transparentVal = config['Transparent Value'];
  const maxSize = Math.max(10, config['Max Size']);
  const seed = config['Seed'];
  const flowSeed = config['Flow Seed'];
  const optimizeRoute = config['Optimize Route'];

  const rng = makeRng(seed);
  const flowRng = makeRng(Number.isFinite(flowSeed) && flowSeed >= 0 ? flowSeed : seed);

  const scale = Math.min(1, maxSize / width, maxSize / height);
  const fieldWidth = Math.max(1, Math.round(width * scale));
  const fieldHeight = Math.max(1, Math.round(height * scale));

  const { guide, mask } = buildGuideAndMask(
    getPixel,
    pixData,
    width,
    height,
    fieldWidth,
    fieldHeight,
    scale,
    transparentVal
  );

  postMessage(['msg', 'Generating flow field']);

  let noiseField;
  if (fieldType === 'curl_noise') {
    noiseField = genCurlNoiseField(fieldWidth, fieldHeight, noiseScale, flowRng);
  } else {
    noiseField = genNoiseField(fieldWidth, fieldHeight, noiseScale, flowRng);
  }

  let field = new Float32Array(fieldWidth * fieldHeight * 2);
  let weights = new Float32Array(fieldWidth * fieldHeight);

  if (edgeMultiplier > 0) {
    const edge = genEdgeField(fieldWidth, fieldHeight, guide);
    for (let i = 0; i < fieldWidth * fieldHeight; i++) {
      const idx = i * 2;
      const weight = edge.weights[i] * edgeMultiplier;
      field[idx] += edge.field[idx] * weight;
      field[idx + 1] += edge.field[idx + 1] * weight;
      weights[i] += weight;
    }
  }

  if (darkMultiplier > 0) {
    const dark = genDarkField(fieldWidth, fieldHeight, guide);
    for (let i = 0; i < fieldWidth * fieldHeight; i++) {
      const idx = i * 2;
      const weight = dark.weights[i] * darkMultiplier;
      field[idx] += dark.field[idx] * weight;
      field[idx + 1] += dark.field[idx + 1] * weight;
      weights[i] += weight;
    }
  }

  for (let i = 0; i < fieldWidth * fieldHeight; i++) {
    const idx = i * 2;
    const weight = clamp(1 - weights[i], 0, 1);
    field[idx] += noiseField[idx] * weight;
    field[idx + 1] += noiseField[idx + 1] * weight;
    if (mask[i] === 0) {
      field[idx] = noiseField[idx];
      field[idx + 1] = noiseField[idx + 1];
    }
  }

  field = normalizeFlowField(field, fieldWidth, fieldHeight);
  field = rotateField(field, fieldWidth, fieldHeight, rotate);

  const fields = [];
  for (let i = 0; i < fieldCopies; i++) {
    const angle = (i * 360) / fieldCopies;
    const rotated = angle === 0 ? field : rotateField(field, fieldWidth, fieldHeight, angle);
    fields.push(new VectorField(rotated, fieldWidth, fieldHeight));
  }

  const dSepFn = (pos) => {
    const x = clamp(Math.round(pos[0]), 0, fieldWidth - 1);
    const y = clamp(Math.round(pos[1]), 0, fieldHeight - 1);
    const val = guide[x + y * fieldWidth] / 255;
    const v2 = val * val;
    return remap(v2, 0, 1, minSep, maxSep);
  };

  postMessage(['msg', 'Tracing lines']);
  let paths = drawFieldsUniform(fields, dSepFn, {
    width: fieldWidth,
    height: fieldHeight,
    minLength,
    maxLength,
    minSep,
    seedpointsPerPath,
    testFrequency,
    rng,
  });

  if (maskTransparent) {
    paths = maskPaths(paths, mask, fieldWidth, fieldHeight);
  }

  if (scale !== 1) {
    const scaleUp = 1 / scale;
    for (const path of paths) {
      for (let i = 0; i < path.length; i++) {
        path[i] = [path[i][0] * scaleUp, path[i][1] * scaleUp];
      }
    }
  }

  if (optimizeRoute && paths.length > 0) {
    paths = sortlines(paths);
  }

  postLines(paths);
};
