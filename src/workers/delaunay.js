import { defaultControls, pixelProcessor, postLines, sortlines } from '../helpers.js';
import { imageDataRGB } from 'stackblur-canvas';
import { Delaunay } from 'd3-delaunay';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Max Stipples', value: 2000, min: 500, max: 10000 },
    { label: 'Max Iterations', value: 10, min: 2, max: 200 },
    { label: 'Spread', value: 0, min: 0, max: 100 },
    { label: 'Gamma', value: 2, min: 0, max: 10, step: 0.01 },
  ]),
]);

let particles, config, pixData;
let pixelCache = [];
let delaunay = null;
let voronoi = null;

onmessage = function (e) {
  if (!particles) {
    [config, pixData] = e.data;
    render();
  } else {
    Object.assign(config, e.data[0]);
    redraw();
  }
};

function makeAsync(f) {
  return new Promise((resolve) => setTimeout(() => resolve(f()), 0));
}

function getPixel(x, y) {
  return pixelCache[Math.floor(x)][Math.floor(y)];
}

function triangulate() {
  if (!delaunay) return [];
  let lines = [];
  for (let i = 0; i < particles.length; i++) {
    for (const j of delaunay.neighbors(i)) {
      if (j <= i) continue;
      lines.push([
        [particles[i].x, particles[i].y],
        [particles[j].x, particles[j].y],
      ]);
    }
  }
  return lines;
}

function redraw(tsp) {
  postLines(triangulate());
}

async function render() {
  await makeAsync(() => imageDataRGB(pixData, 0, 0, config.width, config.height, 1));

  const getPixelSlow = pixelProcessor(config, pixData);

  const decr = config['Spread'] / 5000;
  const gamma = config.Gamma;
  const gammaNorm = 255 / Math.pow(255, gamma);

  for (let x = 0; x < config.width; x++) {
    pixelCache[x] = [];
    for (let y = 0; y < config.height; y++)
      pixelCache[x][y] = gammaNorm * Math.pow(getPixelSlow(x, y), gamma) * (1 - decr) + decr * 255;
  }

  const maxParticles = config['Max Stipples'];
  const border = 6;
  particles = Array(maxParticles);
  let i = 0;

  while (i < maxParticles) {
    let x = Math.random() * (config.width - border * 2) + border;
    let y = Math.random() * (config.height - border * 2) + border;

    let z = getPixel(x, y);
    if (Math.random() * 255 <= z) particles[i++] = { x, y };
  }

  for (let p in particles) particles[p].r = 1;

  for (let k = 0; k < config['Max Iterations']; k++) {
    postMessage(['msg', 'Iteration ' + k]);

    await makeAsync(() => {
      delaunay = Delaunay.from(
        particles,
        (particle) => particle.x,
        (particle) => particle.y
      );
      voronoi = delaunay.voronoi([border, border, config.width - border, config.height - border]);
    });

    await makeAsync(() => {
      for (let c = 0; c < maxParticles; c++) {
        let edgePixels = [];
        let polygon = voronoi.cellPolygon(c);
        if (!polygon || polygon.length < 2) continue;

        let sx = polygon[0][0];
        let sy = polygon[0][1];
        let dx, ex, ey;

        // Walk around the perimeter of the cell marking the boundary pixels
        // No need for full bressenham since we'll be scanning across anyway
        for (let p = 1; p < polygon.length; p++) {
          ex = polygon[p][0];
          ey = polygon[p][1];
          if (sy == ey) {
            edgePixels.push([Math.round(sx), Math.round(sy)]);
          } else if (sy < ey) {
            dx = (ex - sx) / (ey - sy);
            while (sy < ey) {
              edgePixels.push([Math.round(sx), Math.round(sy)]);
              sy++;
              sx += dx;
            }
          } else {
            dx = (ex - sx) / (ey - sy);
            while (sy > ey) {
              edgePixels.push([Math.round(sx), Math.round(sy)]);
              sy--;
              sx -= dx;
            }
          }
          sy = ey;
          sx = ex;
        }

        // create lookup addressed by Y coord
        let byY = {};
        for (const pixel of edgePixels) {
          let px = pixel[0];
          let py = pixel[1];
          if (byY[py]) byY[py].push(px);
          else byY[py] = [px];
        }

        // scanlines
        let xSum = 0,
          ySum = 0,
          dSum = 0;
        for (let ny in byY) {
          let y = Number(ny);
          for (let x = Math.min(...byY[ny]); x <= Math.max(...byY[ny]); x++) {
            let z = 0.001 + getPixel(x, y);
            xSum += z * x;
            ySum += z * y;
            dSum += z;
          }
        }
        if (dSum > 0) {
          xSum /= dSum;
          ySum /= dSum;
        }

        particles[c].x = Math.max(border, Math.min(xSum, config.width - border));
        particles[c].y = Math.max(border, Math.min(ySum, config.height - border));
      }
    });
    redraw(0);
  }

  postMessage(['msg', 'Route optimization']);

  let lines = triangulate();

  await makeAsync(() => {
    lines = sortlines(lines);
  });
  postLines(lines);
  postMessage(['msg', 'Done']);
}
