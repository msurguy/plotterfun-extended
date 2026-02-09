/**
 * Constellation algorithm
 * Samples points by darkness and connects nearby neighbors.
 */

import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import RBush from 'rbush';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Point Spacing', value: 10, min: 4, max: 30, step: 1 },
    { label: 'Jitter', value: 0.35, min: 0, max: 1, step: 0.05 },
    { label: 'Density', value: 1.2, min: 0.1, max: 3, step: 0.1 },
    { label: 'Darkness Power', value: 1.6, min: 0.4, max: 3, step: 0.1 },
    { label: 'Max Links', value: 4, min: 1, max: 10, step: 1 },
    { label: 'Min Distance', value: 6, min: 0, max: 40, step: 1 },
    { label: 'Max Distance', value: 90, min: 10, max: 300, step: 5 },
    { label: 'Seed', value: -1, min: -1, max: 100000, step: 1 },
    { label: 'Optimize Route', type: 'checkbox', checked: true },
  ]),
]);

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
  if (!Number.isFinite(seed) || seed < 0) return Math.random;
  return mulberry32(Math.floor(seed));
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

function axisDist(k, min, max) {
  if (k < min) return min - k;
  if (k > max) return k - max;
  return 0;
}

function boxDist(x, y, box) {
  const dx = axisDist(x, box.minX, box.maxX);
  const dy = axisDist(y, box.minY, box.maxY);
  return dx * dx + dy * dy;
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

onmessage = function (e) {
  const [config, pixData] = e.data;
  const getPixel = pixelProcessor(config, pixData);

  const spacing = config['Point Spacing'];
  const jitter = config['Jitter'];
  const density = config['Density'];
  const power = config['Darkness Power'];
  const maxLinks = config['Max Links'];
  const minDistance = config['Min Distance'];
  const maxDistance = config['Max Distance'];
  const optimize = config['Optimize Route'];

  const width = config.width;
  const height = config.height;
  const rng = makeRng(config.Seed);

  const points = [];

  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const px = x + (rng() * 2 - 1) * jitter * spacing;
      const py = y + (rng() * 2 - 1) * jitter * spacing;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;

      const darkness = getPixel(px, py);
      const probability = Math.min(1, Math.pow(darkness / 255, power) * density);

      if (rng() < probability) {
        points.push({ x: px, y: py, darkness });
      }
    }
  }

  if (points.length < 2) {
    self.postMessage(['svg-path', '']);
    return;
  }

  const tree = new RBush();
  const items = points.map((p, index) => ({
    minX: p.x,
    minY: p.y,
    maxX: p.x,
    maxY: p.y,
    index,
    darkness: p.darkness,
  }));
  tree.load(items);

  const lines = [];
  const edges = new Set();

  for (const item of items) {
    const linkTarget = Math.round((item.darkness / 255) * maxLinks);
    if (linkTarget <= 0) continue;

    const searchCount = Math.max(linkTarget * 3, maxLinks + 1);
    const neighbors = rbushKnn(
      tree,
      item.minX,
      item.minY,
      searchCount,
      (candidate) => candidate.index !== item.index,
      maxDistance
    );

    let added = 0;
    for (const neighbor of neighbors) {
      const dx = neighbor.minX - item.minX;
      const dy = neighbor.minY - item.minY;
      const dist = Math.hypot(dx, dy);
      if (dist < minDistance || dist > maxDistance) continue;

      const a = item.index < neighbor.index ? item.index : neighbor.index;
      const b = item.index < neighbor.index ? neighbor.index : item.index;
      const key = `${a}-${b}`;
      if (edges.has(key)) continue;

      edges.add(key);
      lines.push([
        [item.minX, item.minY],
        [neighbor.minX, neighbor.minY],
      ]);

      if (++added >= linkTarget) break;
    }
  }

  if (lines.length === 0) {
    self.postMessage(['svg-path', '']);
    return;
  }

  const output = optimize ? sortlines(lines) : lines;
  postLines(output);
};
