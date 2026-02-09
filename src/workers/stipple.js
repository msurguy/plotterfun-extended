import { defaultControls, pixelProcessor, postLines, postCircles } from '../helpers.js';
import { imageDataRGB } from 'stackblur-canvas';
import { Delaunay } from 'd3-delaunay';

postMessage([
  'sliders',
  defaultControls.concat([
    { label: 'Max Stipples', value: 2000, min: 500, max: 10000 },
    { label: 'Max Iterations', value: 30, min: 2, max: 200 },
    { label: 'Min dot size', value: 2, min: 0.5, max: 8, step: 0.1, noRestart: true },
    { label: 'Dot size range', value: 4, min: 0, max: 20, step: 0.1, noRestart: true },
    { label: 'TSP Art', type: 'checkbox', noRestart: true },
    {
      label: 'Stipple type',
      type: 'select',
      options: ['Circles', 'Spirals', 'Hexagons', 'Pentagrams', 'Snowflakes'],
      noRestart: true,
    },
  ]),
]);

let particles, config, pixData;
let pixelCache = [];

onmessage = function (e) {
  if (!particles) {
    [config, pixData] = e.data;
    render();
  } else {
    Object.assign(config, e.data[0]);
    redraw(config['TSP Art']);
  }
};

function makeAsync(f) {
  return new Promise((resolve) => setTimeout(() => resolve(f()), 0));
}

function getPixel(x, y) {
  return pixelCache[Math.floor(x)][Math.floor(y)];
}

function redraw(tsp) {
  if (tsp) {
    postLines(particles);
  } else {
    let minsize = config['Min dot size'],
      scale = config['Dot size range'] / 255;

    let points = [];
    switch (config['Stipple type']) {
      case 'Spirals':
        for (let p in particles) {
          let theta = 0,
            r = getPixel(particles[p].x, particles[p].y) * scale + minsize,
            spiral = [];
          while (r >= 0.1) {
            spiral.push([particles[p].x + r * Math.cos(theta), particles[p].y + r * Math.sin(theta)]);
            theta += 0.5;
            if (theta > 6.3) r -= 0.1; //do one full loop before spiraling in
          }
          points.push(spiral);
        }
        postLines(points);
        break;
      case 'Hexagons':
        {
          let s60 = Math.sin((60 * Math.PI) / 180),
            c60 = 0.5;
          for (let p in particles) {
            let x = particles[p].x,
              y = particles[p].y;
            let r = getPixel(x, y) * scale + minsize;
            let hex = [
              [x + r, y],
              [x + r * c60, y - r * s60],
              [x - r * c60, y - r * s60],
              [x - r, y],
              [x - r * c60, y + r * s60],
              [x + r * c60, y + r * s60],
              [x + r, y],
            ];
            points.push(hex);
          }
          postLines(points);
        }
        break;
      case 'Pentagrams':
        let px = [],
          py = [];
        for (let p = 0; p < 360; p += 360 / 5) {
          px.push(Math.sin((p * Math.PI) / 180));
          py.push(Math.cos((p * Math.PI) / 180));
        }
        for (let p in particles) {
          let x = particles[p].x,
            y = particles[p].y;
          let r = getPixel(x, y) * scale + minsize;
          points.push([
            [x + r * px[0], y + r * py[0]],
            [x + r * px[3], y + r * py[3]],
            [x + r * px[1], y + r * py[1]],
            [x + r * px[4], y + r * py[4]],
            [x + r * px[2], y + r * py[2]],
            [x + r * px[0], y + r * py[0]],
          ]);
        }
        postLines(points);
        break;
      case 'Snowflakes':
        {
          let s60 = Math.sin((60 * Math.PI) / 180),
            c60 = 0.5;
          for (let p in particles) {
            let x = particles[p].x,
              y = particles[p].y;
            let r = getPixel(x, y) * scale + minsize;
            points.push([
              [x - r, y],
              [x + r, y],
            ]);
            points.push([
              [x + r * c60, y + r * s60],
              [x - r * c60, y - r * s60],
            ]);
            points.push([
              [x - r * c60, y + r * s60],
              [x + r * c60, y - r * s60],
            ]);
          }
          postLines(points);
        }
        break;
      default:
        //circles
        for (let p in particles) particles[p].r = getPixel(particles[p].x, particles[p].y) * scale + minsize;
        postCircles(particles);
    }
  }
}

async function render() {
  await makeAsync(() => imageDataRGB(pixData, 0, 0, config.width, config.height, 1));

  const getPixelSlow = pixelProcessor(config, pixData);

  for (let x = 0; x < config.width; x++) {
    pixelCache[x] = [];
    for (let y = 0; y < config.height; y++) pixelCache[x][y] = getPixelSlow(x, y);
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

  let voronoi = null;

  for (let k = 0; k < config['Max Iterations']; k++) {
    postMessage(['msg', 'Iteration ' + k]);

    await makeAsync(() => {
      const delaunay = Delaunay.from(
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

  function distance(p1, p2) {
    let dx = p1.x - p2.x;
    let dy = p1.y - p2.y;
    return dx * dx + dy * dy;
  }
  function swapParticles(p1, p2) {
    let temp = particles[p1];
    particles[p1] = particles[p2];
    particles[p2] = temp;
  }

  await makeAsync(() => {
    for (i = 1; i < maxParticles; i++) {
      let closest = 0,
        mindist = 1e99;
      for (let j = i; j < maxParticles; j++) {
        let d = distance(particles[j], particles[i - 1]);
        if (d < mindist) {
          closest = j;
          mindist = d;
        }
      }
      swapParticles(i, closest);
    }
  });

  // 2-opt optimization
  let numSwaps = 100;
  let terminate = 2000 / maxParticles;
  while (numSwaps > terminate) {
    redraw(1);
    await makeAsync(() => {
      numSwaps *= 0.9;
      for (i = 0; i < 1e6; i++) {
        let iA = Math.floor(Math.random() * (maxParticles - 1));
        let iB = Math.floor(Math.random() * (maxParticles - 1));
        if (Math.abs(iA - iB) < 2) continue;
        if (iB < iA) {
          let temp = iB;
          iB = iA;
          iA = temp;
        }

        let dA = distance(particles[iA], particles[iA + 1]) + distance(particles[iB], particles[iB + 1]);
        let dB = distance(particles[iA], particles[iB]) + distance(particles[iA + 1], particles[iB + 1]);

        if (dB < dA) {
          // reverse tour between a1 and b0
          let high = iB,
            low = iA + 1;
          while (high > low) {
            swapParticles(low, high);
            high--;
            low++;
          }
          numSwaps++;
        }
      }
    });
    postMessage(['msg', `Optimizing route... [${numSwaps.toFixed(2)}]`]);
  }
  redraw(config['TSP Art']);
  postMessage(['msg', 'Done']);
}
