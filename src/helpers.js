import { imageDataRGB } from 'stackblur-canvas';
import ClipperLib from './lib/clipper-wrapper.js';

// Default UI controls for algorithms
export const defaultControls = [
  { label: 'Inverted', type: 'checkbox' },
  { label: 'Brightness', value: 0, min: -100, max: 100 },
  { label: 'Contrast', value: 0, min: -100, max: 100 },
  { label: 'Blur radius', value: 0, min: 0, max: 50 },
  { label: 'Min brightness', value: 0, min: 0, max: 255 },
  { label: 'Max brightness', value: 255, min: 0, max: 255 },
  { label: 'Face Boundary', type: 'checkbox', checked: false },
  {
    label: 'Face Boundary Offset',
    value: 0,
    min: 0,
    max: 200,
    step: 1,
    displayLabel: 'Offset',
    requiresFaceBoundary: true,
    deferRestart: true,
  },
  { label: 'Depth Map', type: 'checkbox', checked: false },
  { label: 'Depth Strength', value: 0.5, min: 0, max: 1, step: 0.05 },
  { label: 'Depth Mode', type: 'select', value: 'Multiply', options: ['Multiply', 'Divide'] },
  { label: 'Depth Invert', type: 'checkbox', checked: false },
  { label: 'Depth Gamma', value: 1, min: 0.2, max: 3, step: 0.1 },
];

const FACE_BOUNDARY_SCALE = 100;
let faceBoundaryState = {
  enabled: false,
  polygon: null,
  clipPath: null,
  sourceKey: null,
  mask: null,
  maskWidth: 0,
  maskHeight: 0,
  useMask: false,
};

function getFaceBoundaryOffset(config) {
  const raw = Number(config && config['Face Boundary Offset']);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, raw);
}

function buildFaceBoundaryKey(polygon, offset) {
  let hash = 2166136261;
  const scale = FACE_BOUNDARY_SCALE;
  for (const point of polygon) {
    const pt = pointToArray(point);
    if (!pt) continue;
    const xi = Math.round(pt[0] * scale);
    const yi = Math.round(pt[1] * scale);
    hash ^= xi;
    hash = Math.imul(hash, 16777619);
    hash ^= yi;
    hash = Math.imul(hash, 16777619);
  }
  const offsetScaled = Math.round(offset * scale);
  hash ^= offsetScaled;
  hash = Math.imul(hash, 16777619);
  return `${hash}:${polygon.length}`;
}

function resolveFaceBoundaryMask(config, polygon) {
  const mask = config && config.faceBoundaryMask;
  const width = Number(config && config.faceBoundaryMaskWidth);
  const height = Number(config && config.faceBoundaryMaskHeight);
  if (!mask || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { mask, width, height, polygon: Array.isArray(polygon) ? polygon : null };
}

function getPathArea(path) {
  if (!path || path.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const { X: xi, Y: yi } = path[i];
    const { X: xj, Y: yj } = path[j];
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) * 0.5;
}

function selectLargestPath(paths) {
  if (!paths || !paths.length) return null;
  let largest = paths[0];
  let maxArea = getPathArea(largest);
  for (let i = 1; i < paths.length; i += 1) {
    const area = getPathArea(paths[i]);
    if (area > maxArea) {
      largest = paths[i];
      maxArea = area;
    }
  }
  return largest;
}

export function syncFaceBoundaryConfig(config) {
  const enabled = Boolean(config && config['Face Boundary']);
  if (!enabled) {
    faceBoundaryState = {
      enabled: false,
      polygon: null,
      clipPath: null,
      sourceKey: null,
      mask: null,
      maskWidth: 0,
      maskHeight: 0,
      useMask: false,
    };
    return;
  }

  const polygon = Array.isArray(config.faceBoundary) ? config.faceBoundary : null;
  const maskPayload = resolveFaceBoundaryMask(config, polygon);
  if (maskPayload) {
    faceBoundaryState = {
      enabled: true,
      polygon: maskPayload.polygon,
      clipPath: null,
      sourceKey: null,
      mask: maskPayload.mask,
      maskWidth: maskPayload.width,
      maskHeight: maskPayload.height,
      useMask: true,
    };
    return;
  }

  if (!polygon || polygon.length < 3) {
    faceBoundaryState = {
      enabled: true,
      polygon: null,
      clipPath: null,
      sourceKey: null,
      mask: null,
      maskWidth: 0,
      maskHeight: 0,
      useMask: false,
    };
    return;
  }

  const offset = getFaceBoundaryOffset(config);
  const sourceKey = buildFaceBoundaryKey(polygon, offset);
  if (faceBoundaryState.enabled && faceBoundaryState.sourceKey === sourceKey) {
    return;
  }

  let clipPath = polygon.map(([x, y]) => ({
    X: Math.round(x * FACE_BOUNDARY_SCALE),
    Y: Math.round(y * FACE_BOUNDARY_SCALE),
  }));
  if (offset > 0) {
    const offsetter = new ClipperLib.ClipperOffset();
    offsetter.AddPath(clipPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const solution = new ClipperLib.Paths();
    offsetter.Execute(solution, offset * FACE_BOUNDARY_SCALE);
    const expanded = selectLargestPath(solution);
    if (expanded && expanded.length >= 3) {
      clipPath = expanded;
    }
  }

  const expandedPolygon = clipPath.map((point) => [point.X / FACE_BOUNDARY_SCALE, point.Y / FACE_BOUNDARY_SCALE]);

  faceBoundaryState = {
    enabled: true,
    polygon: expandedPolygon,
    clipPath,
    sourceKey,
    mask: null,
    maskWidth: 0,
    maskHeight: 0,
    useMask: false,
  };
}

// Apply brightness / contrast and flatten to monochrome
// taken from squigglecam
export function pixelProcessor(config, imagePixels, depthData, options = {}) {
  syncFaceBoundaryConfig(config);
  const width = parseInt(config.width);
  const height = parseInt(config.height);
  const contrast = parseInt(config.Contrast);
  const brightness = parseInt(config.Brightness);
  const minBrightness = parseInt(config['Min brightness']);
  const maxBrightness = parseInt(config['Max brightness']);
  const black = config.Inverted;
  const blurValue = Number(config['Blur radius']);
  const blurRadius = Number.isFinite(blurValue) ? Math.max(0, Math.round(blurValue)) : 0;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  if (blurRadius > 0 && imagePixels && imagePixels.data) {
    imageDataRGB(imagePixels, 0, 0, width, height, blurRadius);
  }

  const mask = faceBoundaryState.useMask ? faceBoundaryState.mask : null;
  const maskWidth = faceBoundaryState.maskWidth;
  const maskHeight = faceBoundaryState.maskHeight;
  const hasMask = Boolean(mask && maskWidth === width && maskHeight === height);

  function getBase(x, y) {
    if (hasMask) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= maskWidth || yi >= maskHeight) return 0;
      if (!mask[yi * maskWidth + xi]) return 0;
    }
    let b;
    const pixIndex = Math.floor(x) + Math.floor(y) * width;

    if (contrast !== 0) {
      b =
        0.2125 * (contrastFactor * (imagePixels.data[4 * pixIndex] - 128) + 128 + brightness) +
        0.7154 * (contrastFactor * (imagePixels.data[4 * pixIndex + 1] - 128) + 128 + brightness) +
        0.0721 * (contrastFactor * (imagePixels.data[4 * pixIndex + 2] - 128) + 128 + brightness);
    } else {
      b =
        0.2125 * (imagePixels.data[4 * pixIndex] + brightness) +
        0.7154 * (imagePixels.data[4 * pixIndex + 1] + brightness) +
        0.0721 * (imagePixels.data[4 * pixIndex + 2] + brightness);
    }
    if (black) {
      b = Math.min(255 - minBrightness, 255 - b);
    } else {
      b = Math.max(minBrightness, b);
    }

    return Math.max(maxBrightness - b, 0);
  }

  const depthPayload = depthData || config.depthData;
  const useDepth =
    !options.ignoreDepth &&
    config['Depth Map'] &&
    depthPayload &&
    depthPayload.data &&
    depthPayload.width &&
    depthPayload.height;

  if (!useDepth) {
    return getBase;
  }

  const getDepth = depthProcessor(config, depthPayload);
  const strengthValue = Number(config['Depth Strength']);
  const strength = Number.isFinite(strengthValue) ? Math.max(0, Math.min(1, strengthValue)) : 0;

  if (strength <= 0) {
    return getBase;
  }

  const mode = config['Depth Mode'] || 'Multiply';
  const minDepth = 0.05;

  return function (x, y) {
    const base = getBase(x, y);
    const depthValue = getDepth(x, y) / 255;
    let modulated;

    if (mode === 'Divide') {
      modulated = base / Math.max(depthValue, minDepth);
    } else {
      modulated = base * depthValue;
    }

    modulated = Math.max(0, Math.min(255, modulated));
    return base * (1 - strength) + modulated * strength;
  };
}

export function depthProcessor(config, depthData) {
  if (!depthData || !depthData.data || !depthData.width || !depthData.height) {
    return () => 0;
  }

  const depthWidth = depthData.width;
  const depthHeight = depthData.height;
  const widthScale = depthWidth / config.width;
  const heightScale = depthHeight / config.height;
  const gammaValue = Number(config['Depth Gamma']);
  const gamma = Number.isFinite(gammaValue) && gammaValue > 0 ? gammaValue : 1;
  const invert = Boolean(config['Depth Invert']);
  const depthLut = new Uint8Array(256);

  for (let i = 0; i < 256; i++) {
    let value = i / 255;
    if (invert) value = 1 - value;
    value = Math.pow(value, gamma);
    depthLut[i] = Math.round(value * 255);
  }

  return function (x, y) {
    const sx = Math.min(depthWidth - 1, Math.max(0, Math.floor(x * widthScale)));
    const sy = Math.min(depthHeight - 1, Math.max(0, Math.floor(y * heightScale)));
    return depthLut[depthData.data[sx + sy * depthWidth]];
  };
}

// autocontrast, my implementation
export function autocontrast(pixData, cutoff, width, height) {
  function luma(x, y) {
    const i = 4 * (x + width * y);
    return pixData.data[i] * 0.299 + pixData.data[i + 1] * 0.587 + pixData.data[i + 2] * 0.114; // ITU-R 601-2
  }

  const hist = [];
  for (let i = 0; i < 256; i++) hist[i] = 0;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const b = Math.round(luma(x, y));
      hist[b]++;
    }
  }
  let total = 0,
    low = 0,
    high = 255;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
  }
  cutoff *= total;

  for (let i = 0; i < 255; i++) {
    low += hist[i];
    if (low > cutoff) {
      low = i;
      break;
    }
  }
  for (let i = 255; i > 1; i--) {
    high += hist[i];
    if (high >= cutoff) {
      high = i;
      break;
    }
  }

  const scale = 255 / (high - low) || 1;

  const pixelCache = [];
  for (let x = 0; x < width; x++) {
    pixelCache[x] = [];
    for (let y = 0; y < height; y++) {
      pixelCache[x][y] = Math.min(255, Math.max(0, (luma(x, y) - low) * scale));
    }
  }
  return (x, y) => {
    return x >= 0 && y >= 0 && x < width && y < height ? pixelCache[x][y] : 0;
  };
}

// perlin noise
// ported from lingdong's linedraw.py
const perlinNoise = (function () {
  const PERLIN_YWRAPB = 4;
  const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
  const PERLIN_ZWRAPB = 8;
  const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
  const PERLIN_SIZE = 4095;

  const perlin_octaves = 4;
  const perlin_amp_falloff = 0.5;

  function scaled_cosine(i) {
    return 0.5 * (1.0 - Math.cos(i * Math.PI));
  }

  let perlin = null;

  return function (x, y = 0, z = 0) {
    if (perlin == null) {
      perlin = [];
      for (let i = 0; i < PERLIN_SIZE + 1; i++) {
        perlin.push(Math.random());
      }
    }
    if (x < 0) x = -x;
    if (y < 0) y = -y;
    if (z < 0) z = -z;

    let [xi, yi, zi] = [~~x, ~~y, ~~z];
    let xf = x - xi;
    let yf = y - yi;
    let zf = z - zi;
    let rxf, ryf;

    let r = 0;
    let ampl = 0.5;

    let n1, n2, n3;

    for (let o = 0; o < perlin_octaves; o++) {
      let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

      rxf = scaled_cosine(xf);
      ryf = scaled_cosine(yf);

      n1 = perlin[of & PERLIN_SIZE];
      n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
      n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
      n1 += ryf * (n2 - n1);

      of += PERLIN_ZWRAP;
      n2 = perlin[of & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
      n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
      n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
      n2 += ryf * (n3 - n2);

      n1 += scaled_cosine(zf) * (n2 - n1);

      r += n1 * ampl;
      ampl *= perlin_amp_falloff;
      xi <<= 1;
      xf *= 2;
      yi <<= 1;
      yf *= 2;
      zi <<= 1;
      zf *= 2;

      if (xf >= 1.0) (xi += 1), (xf -= 1);
      if (yf >= 1.0) (yi += 1), (yf -= 1);
      if (zf >= 1.0) (zi += 1), (zf -= 1);
    }
    return r;
  };
})();

export { perlinNoise };

// Nearest-neighbour TSP solution, good enough for simple plotting
export function sortlines(clines) {
  const slines = [clines.pop()];
  let last = slines[0][slines[0].length - 1];

  function distance(a, b) {
    return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);
  }

  while (clines.length) {
    let closest,
      min = 1e9,
      backwards = false;
    for (const j in clines) {
      const d1 = distance(clines[j][0], last);
      const d2 = distance(clines[j][clines[j].length - 1], last);
      if (d1 < min) {
        min = d1;
        closest = j;
        backwards = false;
      }
      if (d2 < min) {
        min = d2;
        closest = j;
        backwards = true;
      }
    }
    let l = clines.splice(closest, 1)[0];
    if (backwards) {
      l.reverse();
    }
    slines.push(l);
    last = l[l.length - 1];
  }
  return slines;
}

// slowly draw the points list - useful for debugging
export function animatePointList(output, speed, postLines) {
  let out = [],
    i = 0,
    j = 0;
  speed = speed || 1;
  (function f() {
    for (let q = 0; q < speed; q++) {
      if (!out[i]) out[i] = [];
      out[i][j] = output[i][j];
      if (++j >= output[i].length) (j = 0), i++;
    }
    postLines(out);
    if (i < output.length) setTimeout(f, 20);
  })();
}

function pointToArray(point) {
  if (!point) return null;
  if (typeof point.x === 'number' && typeof point.y === 'number') return [point.x, point.y];
  if (Array.isArray(point) && point.length >= 2) return [point[0], point[1]];
  return null;
}

function toClipperPath(points) {
  const path = [];
  for (const point of points) {
    const pt = pointToArray(point);
    if (!pt) continue;
    path.push({
      X: Math.round(pt[0] * FACE_BOUNDARY_SCALE),
      Y: Math.round(pt[1] * FACE_BOUNDARY_SCALE),
    });
  }
  return path;
}

function clipLinesToPolygon(lines, clipPath) {
  if (!clipPath || clipPath.length < 3) return lines;
  const clipped = [];

  for (const line of lines) {
    if (!line || line.length < 2) continue;
    const subject = toClipperPath(line);
    if (subject.length < 2) continue;

    const cpr = new ClipperLib.Clipper();
    cpr.AddPath(subject, ClipperLib.PolyType.ptSubject, false);
    cpr.AddPath(clipPath, ClipperLib.PolyType.ptClip, true);

    const solution = new ClipperLib.PolyTree();
    cpr.Execute(
      ClipperLib.ClipType.ctIntersection,
      solution,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero
    );

    const openPaths = ClipperLib.Clipper.OpenPathsFromPolyTree(solution);
    for (const path of openPaths) {
      if (path.length < 2) continue;
      clipped.push(path.map((pt) => [pt.X / FACE_BOUNDARY_SCALE, pt.Y / FACE_BOUNDARY_SCALE]));
    }
  }

  return clipped;
}

function buildCatmullRomPath(points, tension = 1) {
  if (!points || points.length < 2) return '';
  const pts = points.map(pointToArray).filter(Boolean);
  if (pts.length < 2) return '';
  const t = Number.isFinite(tension) ? tension : 1;

  let path = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;

    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * t;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * t;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * t;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * t;

    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return path;
}

export function postCurves(data, tension = 1) {
  if (!data || !data.length) {
    self.postMessage(['svg-path', '']);
    return;
  }

  let lines = data;
  if (typeof lines[0][0] !== 'object') lines = [lines];

  if (
    faceBoundaryState.enabled &&
    !faceBoundaryState.useMask &&
    faceBoundaryState.clipPath &&
    faceBoundaryState.clipPath.length > 2
  ) {
    lines = clipLinesToPolygon(lines, faceBoundaryState.clipPath);
    if (!lines.length) {
      self.postMessage(['svg-path', '']);
      return;
    }
  }

  let pathstring = '';
  for (const line of lines) {
    const segment = buildCatmullRomPath(line, tension);
    if (segment) pathstring += ` ${segment}`;
  }

  self.postMessage(['svg-path', pathstring.trim()]);
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function createPostLines(postMessage) {
  return function postLines(data) {
    let pathstring = '';

    // either a list of points, or a list of lists of points
    if (typeof data[0][0] !== 'object') data = [data];

    if (data[0][0].x) {
      for (const p in data) {
        pathstring += ' M' + data[p][0].x.toFixed(2) + ',' + data[p][0].y.toFixed(2);
        for (let i = 1; i < data[p].length; i++)
          pathstring += 'L' + data[p][i].x.toFixed(2) + ',' + data[p][i].y.toFixed(2);
      }
    } else {
      for (const p in data) {
        pathstring += ' M' + data[p][0][0].toFixed(2) + ',' + data[p][0][1].toFixed(2);
        for (let i = 1; i < data[p].length; i++)
          pathstring += 'L' + data[p][i][0].toFixed(2) + ',' + data[p][i][1].toFixed(2);
      }
    }
    postMessage(['svg-path', pathstring]);
  };
}

export function createPostCircles(postMessage) {
  return function postCircles(data) {
    let pathstring = '';
    if (data[0].x) {
      for (const p in data) {
        let { x, y, r } = data[p];
        if (r < 0.001) r = 0.001;
        pathstring +=
          'M' +
          x.toFixed(2) +
          ',' +
          (y - r).toFixed(2) +
          ' a ' +
          r.toFixed(3) +
          ' ' +
          r.toFixed(3) +
          ' 0 1 0 0.001 0Z ';
      }
    } else {
      for (const p in data) {
        let [x, y, r] = data[p];
        if (r < 0.001) r = 0.001;
        pathstring +=
          'M' +
          x.toFixed(2) +
          ',' +
          (y - r).toFixed(2) +
          ' a ' +
          r.toFixed(3) +
          ' ' +
          r.toFixed(3) +
          ' 0 1 0 0.001 0Z ';
      }
    }
    postMessage(['svg-path', pathstring]);
  };
}

// Legacy global functions for worker context - these will be set up by the worker bootstrap
export function postLines(data) {
  if (!data || !data.length) {
    self.postMessage(['svg-path', '']);
    return;
  }

  let pathstring = '';
  let lines = data;
  if (typeof lines[0][0] !== 'object') lines = [lines];

  if (
    faceBoundaryState.enabled &&
    !faceBoundaryState.useMask &&
    faceBoundaryState.clipPath &&
    faceBoundaryState.clipPath.length > 2
  ) {
    lines = clipLinesToPolygon(lines, faceBoundaryState.clipPath);
    if (!lines.length) {
      self.postMessage(['svg-path', '']);
      return;
    }
  }

  if (lines[0][0].x) {
    for (const p in lines) {
      pathstring += ' M' + lines[p][0].x.toFixed(2) + ',' + lines[p][0].y.toFixed(2);
      for (let i = 1; i < lines[p].length; i++)
        pathstring += 'L' + lines[p][i].x.toFixed(2) + ',' + lines[p][i].y.toFixed(2);
    }
  } else {
    for (const p in lines) {
      pathstring += ' M' + lines[p][0][0].toFixed(2) + ',' + lines[p][0][1].toFixed(2);
      for (let i = 1; i < lines[p].length; i++)
        pathstring += 'L' + lines[p][i][0].toFixed(2) + ',' + lines[p][i][1].toFixed(2);
    }
  }
  self.postMessage(['svg-path', pathstring]);
}

export function postCircles(data) {
  if (!data || !data.length) {
    self.postMessage(['svg-path', '']);
    return;
  }

  let pathstring = '';
  let circles = data;

  if (
    faceBoundaryState.enabled &&
    !faceBoundaryState.useMask &&
    faceBoundaryState.polygon &&
    faceBoundaryState.polygon.length > 2
  ) {
    const polygon = faceBoundaryState.polygon;
    circles = circles.filter((circle) => {
      const pt = circle && typeof circle.x === 'number' ? [circle.x, circle.y] : pointToArray(circle);
      if (!pt) return false;
      return pointInPolygon(pt, polygon);
    });
    if (!circles.length) {
      self.postMessage(['svg-path', '']);
      return;
    }
  }

  if (circles[0].x) {
    for (const p in circles) {
      let { x, y, r } = circles[p];
      if (r < 0.001) r = 0.001;
      pathstring +=
        'M' +
        x.toFixed(2) +
        ',' +
          (y - r).toFixed(2) +
          ' a ' +
          r.toFixed(3) +
          ' ' +
          r.toFixed(3) +
          ' 0 1 0 0.001 0Z ';
    }
  } else {
    for (const p in circles) {
      let [x, y, r] = circles[p];
      if (r < 0.001) r = 0.001;
      pathstring +=
        'M' +
        x.toFixed(2) +
        ',' +
        (y - r).toFixed(2) +
        ' a ' +
        r.toFixed(3) +
        ' ' +
        r.toFixed(3) +
        ' 0 1 0 0.001 0Z ';
    }
  }
  self.postMessage(['svg-path', pathstring]);
}
