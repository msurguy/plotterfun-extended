import { defaultControls, pixelProcessor, depthProcessor, postLines, postCircles } from '../helpers.js';
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
    { label: 'Depth Influence', value: 0, min: 0, max: 1, step: 0.05 },
  ]),
]);

let particles, config, pixData, depthData;
let pixelCache = [];

onmessage = function (e) {
  if (!particles) {
    [config, pixData] = e.data;
    depthData = config.depthData || null;
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

  const getPixelSlow = pixelProcessor(config, pixData, depthData, { ignoreDepth: true });
  const getDepthPixel = depthProcessor(config, depthData);
  const depthInfluence = Math.max(0, Math.min(1, Number(config['Depth Influence'] || 0)));
  const useDepth = depthData && depthInfluence > 0;

  for (let x = 0; x < config.width; x++) {
    pixelCache[x] = [];
    for (let y = 0; y < config.height; y++) {
      const baseValue = getPixelSlow(x, y);
      if (useDepth) {
        const depthValue = getDepthPixel(x, y);
        pixelCache[x][y] = baseValue * (1 - depthInfluence) + depthValue * depthInfluence;
      } else {
        pixelCache[x][y] = baseValue;
      }
    }
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

        let count = 0;
        let cx = 0;
        let cy = 0;
        for (const py in byY) {
          let row = byY[py].sort((a, b) => a - b);
          for (let i = 0; i < row.length; i += 2) {
            if (!row[i + 1]) break;
            for (let px = row[i]; px < row[i + 1]; px++) {
              let w = getPixel(px, py);
              cx += px * w;
              cy += py * w;
              count += w;
            }
          }
        }
        if (count) {
          particles[c].x = cx / count;
          particles[c].y = cy / count;
        }
      }
    });
  }

  postMessage(['msg', '']);
  redraw(config['TSP Art']);
}
