import { useCallback, useEffect, useRef } from 'react';
import { estimateDepthMapFromCanvas, isDepthModelLoaded } from './lib/depth.js';
import { OUTPUT_UNIT_TO_MM } from './constants.js';
import {
  normalizeOutputUnit,
  normalizeOutputDpi,
  roundOutputValue,
  formatOutputValue,
  convertOutputValue,
  splitPathDataByLength,
} from './utils.js';
import { computeFaceBoundaryPolygon } from './face.js';
import {
  tabWebcam as webcamTabWebcam,
  snapshot as webcamSnapshot,
  toggleVideoPause as webcamTogglePause,
  stopWebcam,
} from './webcam.js';
import { resolveActivePalette as paletteResolveActivePalette, buildColorChannels } from './palette.js';
import ClipperLib from './lib/clipper-wrapper.js';
import { usePlotterStore } from './store.js';

const workerModules = {
  'squiggle.js': () => new Worker(new URL('./workers/squiggle.js', import.meta.url), { type: 'module' }),
  'squiggleLeftRight.js': () => new Worker(new URL('./workers/squiggleLeftRight.js', import.meta.url), { type: 'module' }),
  'spiral.js': () => new Worker(new URL('./workers/spiral.js', import.meta.url), { type: 'module' }),
  'polyspiral.js': () => new Worker(new URL('./workers/polyspiral.js', import.meta.url), { type: 'module' }),
  'sawtooth.js': () => new Worker(new URL('./workers/sawtooth.js', import.meta.url), { type: 'module' }),
  'stipple.js': () => new Worker(new URL('./workers/stipple.js', import.meta.url), { type: 'module' }),
  'stippledepth.js': () => new Worker(new URL('./workers/stippledepth.js', import.meta.url), { type: 'module' }),
  'delaunay.js': () => new Worker(new URL('./workers/delaunay.js', import.meta.url), { type: 'module' }),
  'linedraw.js': () => new Worker(new URL('./workers/linedraw.js', import.meta.url), { type: 'module' }),
  'mosaic.js': () => new Worker(new URL('./workers/mosaic.js', import.meta.url), { type: 'module' }),
  'subline.js': () => new Worker(new URL('./workers/subline.js', import.meta.url), { type: 'module' }),
  'springs.js': () => new Worker(new URL('./workers/springs.js', import.meta.url), { type: 'module' }),
  'waves.js': () => new Worker(new URL('./workers/waves.js', import.meta.url), { type: 'module' }),
  'needles.js': () => new Worker(new URL('./workers/needles.js', import.meta.url), { type: 'module' }),
  'implode.js': () => new Worker(new URL('./workers/implode.js', import.meta.url), { type: 'module' }),
  'halftone.js': () => new Worker(new URL('./workers/halftone.js', import.meta.url), { type: 'module' }),
  'boxes.js': () => new Worker(new URL('./workers/boxes.js', import.meta.url), { type: 'module' }),
  'dots.js': () => new Worker(new URL('./workers/dots.js', import.meta.url), { type: 'module' }),
  'jaggy.js': () => new Worker(new URL('./workers/jaggy.js', import.meta.url), { type: 'module' }),
  'longwave.js': () => new Worker(new URL('./workers/longwave.js', import.meta.url), { type: 'module' }),
  'linescan.js': () => new Worker(new URL('./workers/linescan.js', import.meta.url), { type: 'module' }),
  'woven.js': () => new Worker(new URL('./workers/woven.js', import.meta.url), { type: 'module' }),
  'peano.js': () => new Worker(new URL('./workers/peano.js', import.meta.url), { type: 'module' }),
  'margins.js': () => new Worker(new URL('./workers/margins.js', import.meta.url), { type: 'module' }),
  'crosshatch.js': () => new Worker(new URL('./workers/crosshatch.js', import.meta.url), { type: 'module' }),
  'hatchweave.js': () => new Worker(new URL('./workers/hatchweave.js', import.meta.url), { type: 'module' }),
  'hatchmoire.js': () => new Worker(new URL('./workers/hatchmoire.js', import.meta.url), { type: 'module' }),
  'hatchburst.js': () => new Worker(new URL('./workers/hatchburst.js', import.meta.url), { type: 'module' }),
  'hatchlattice.js': () => new Worker(new URL('./workers/hatchlattice.js', import.meta.url), { type: 'module' }),
  'flowfield.js': () => new Worker(new URL('./workers/flowfield.js', import.meta.url), { type: 'module' }),
  'concentric.js': () => new Worker(new URL('./workers/concentric.js', import.meta.url), { type: 'module' }),
  'hexgrid.js': () => new Worker(new URL('./workers/hexgrid.js', import.meta.url), { type: 'module' }),
  'starburst.js': () => new Worker(new URL('./workers/starburst.js', import.meta.url), { type: 'module' }),
  'constellation.js': () => new Worker(new URL('./workers/constellation.js', import.meta.url), { type: 'module' }),
  'contours.js': () => new Worker(new URL('./workers/contours.js', import.meta.url), { type: 'module' }),
  'warpgrid.js': () => new Worker(new URL('./workers/warpgrid.js', import.meta.url), { type: 'module' }),
  'circlepack.js': () => new Worker(new URL('./workers/circlepack.js', import.meta.url), { type: 'module' }),
  'differentialgrowth.js': () =>
    new Worker(new URL('./workers/differentialgrowth.js', import.meta.url), { type: 'module' }),
  'dlagrowth.js': () => new Worker(new URL('./workers/dlagrowth.js', import.meta.url), { type: 'module' }),
  'reactiondiffusion.js': () =>
    new Worker(new URL('./workers/reactiondiffusion.js', import.meta.url), { type: 'module' }),
};

const svgNS = 'http://www.w3.org/2000/svg';
const FACE_CROP_SCALE = 100;
const FACE_CROP_CLIP_ID = 'face-boundary-crop-clip';

export function usePlotterController() {
  const previewRef = useRef(null);
  const svgRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const imgSelectRef = useRef(null);
  const webcamRef = useRef(null);
  const tabImageRef = useRef(null);
  const tabWebcamRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const ctxRef = useRef(canvasRef.current.getContext('2d'));
  const prectxRef = useRef(null);
  const imgRef = useRef(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef([0, 0]);
  const cwRef = useRef(usePlotterStore.getState().canvasWidth);
  const chRef = useRef(usePlotterStore.getState().canvasHeight);
  const myWorkerRef = useRef(null);
  const algoRef = useRef(null);
  const mainPathsRef = useRef([]);
  const mainGroupRef = useRef(null);
  const workerBusyRef = useRef(false);
  const workerMessageHandlerRef = useRef(null);
  const workerSrcRef = useRef(null);
  const paletteGroupsRef = useRef([]);
  const palettePathsByChannelRef = useRef([]);
  const paletteChannelsRef = useRef(null);
  const paletteChannelIndexRef = useRef(0);
  const paletteWorkerConfigRef = useRef(null);
  const activePaletteRef = useRef(null);
  const imageRevisionRef = useRef(0);
  const processTokenRef = useRef(0);
  const faceBoundaryCacheRef = useRef({ revision: -1, polygon: null });
  const faceBoundaryMaskRef = useRef({ revision: -1, offset: 0, width: 0, height: 0, mask: null });
  const faceMaskCanvasRef = useRef(document.createElement('canvas'));
  const faceMaskCtxRef = useRef(faceMaskCanvasRef.current.getContext('2d'));
  const depthCacheRef = useRef({ revision: -1, payload: null, promise: null });

  const setBuffering = usePlotterStore((state) => state.setBuffering);
  const setMsg = usePlotterStore((state) => state.setMsg);
  const setAlgoControls = usePlotterStore((state) => state.setAlgoControls);
  const setConfig = usePlotterStore((state) => state.setConfig);
  const setConfigValue = usePlotterStore((state) => state.setConfigValue);
  const setOutputSize = usePlotterStore((state) => state.setOutputSize);
  const setOutputAutoSync = usePlotterStore((state) => state.setOutputAutoSync);
  const setOutputDpi = usePlotterStore((state) => state.setOutputDpi);
  const setCanvasSize = usePlotterStore((state) => state.setCanvasSize);
  const setImageSet = usePlotterStore((state) => state.setImageSet);
  const updateCustomPaletteColor = usePlotterStore((state) => state.updateCustomPaletteColor);
  const addCustomPaletteColor = usePlotterStore((state) => state.addCustomPaletteColor);
  const removeCustomPaletteColor = usePlotterStore((state) => state.removeCustomPaletteColor);
  const resetCustomPalette = usePlotterStore((state) => state.resetCustomPalette);
  const setPenWidth = usePlotterStore((state) => state.setPenWidth);
  const setPenColor = usePlotterStore((state) => state.setPenColor);
  const setWebcamMirror = usePlotterStore((state) => state.setWebcamMirror);
  const activeTab = usePlotterStore((state) => state.activeTab);
  const algorithm = usePlotterStore((state) => state.algorithm);
  const config = usePlotterStore((state) => state.config);
  const outputSize = usePlotterStore((state) => state.outputSize);
  const outputAutoSync = usePlotterStore((state) => state.outputAutoSync);
  const outputDpi = usePlotterStore((state) => state.outputDpi);
  const penWidth = usePlotterStore((state) => state.penWidth);
  const penColor = usePlotterStore((state) => state.penColor);
  const colorMode = usePlotterStore((state) => state.colorMode);
  const webcamMirror = usePlotterStore((state) => state.webcamMirror);

  const markImageChanged = useCallback(() => {
    imageRevisionRef.current += 1;
    faceBoundaryCacheRef.current = { revision: -1, polygon: null };
    faceBoundaryMaskRef.current = { revision: -1, offset: 0, width: 0, height: 0, mask: null };
    depthCacheRef.current = { revision: -1, payload: null, promise: null };
  }, []);

  const buildFaceBoundaryMask = useCallback((polygon, width, height, offset) => {
    if (!polygon || polygon.length < 3) return null;
    const ctx = faceMaskCtxRef.current;
    const canvas = faceMaskCanvasRef.current;
    if (!ctx || !canvas) return null;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
    if (safeOffset > 0) {
      ctx.lineWidth = safeOffset * 2;
    }

    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i += 1) {
      ctx.lineTo(polygon[i][0], polygon[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    if (safeOffset > 0) ctx.stroke();

    const data = ctx.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0, j = 3; i < mask.length; i += 1, j += 4) {
      mask[i] = data[j];
    }
    return mask;
  }, []);

  const getLargestClipperPath = useCallback((paths) => {
    if (!paths || !paths.length) return null;
    let bestPath = null;
    let bestArea = -1;
    for (const path of paths) {
      if (!path || path.length < 3) continue;
      let area = 0;
      for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        area += path[j].X * path[i].Y - path[i].X * path[j].Y;
      }
      const absArea = Math.abs(area) * 0.5;
      if (absArea > bestArea) {
        bestArea = absArea;
        bestPath = path;
      }
    }
    return bestPath;
  }, []);

  const getExpandedFaceBoundaryPolygon = useCallback(
    (polygon, offset) => {
      if (!polygon || polygon.length < 3) return null;
      const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
      if (safeOffset <= 0) return polygon;

      const sourcePath = polygon.map(([x, y]) => ({
        X: Math.round(x * FACE_CROP_SCALE),
        Y: Math.round(y * FACE_CROP_SCALE),
      }));
      const offsetter = new ClipperLib.ClipperOffset();
      offsetter.AddPath(sourcePath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      const solution = new ClipperLib.Paths();
      offsetter.Execute(solution, safeOffset * FACE_CROP_SCALE);

      const largestPath = getLargestClipperPath(solution);
      if (!largestPath || largestPath.length < 3) return polygon;
      return largestPath.map((point) => [point.X / FACE_CROP_SCALE, point.Y / FACE_CROP_SCALE]);
    },
    [getLargestClipperPath]
  );

  const setDepthStatus = usePlotterStore((state) => state.setDepthStatus);
  const setDepthProgress = usePlotterStore((state) => state.setDepthProgress);

  const getDepthPayload = useCallback(async () => {
    const { config } = usePlotterStore.getState();
    if (!config['Depth Map']) return null;

    if (depthCacheRef.current.revision === imageRevisionRef.current && depthCacheRef.current.payload) {
      return depthCacheRef.current.payload;
    }

    if (depthCacheRef.current.revision === imageRevisionRef.current && depthCacheRef.current.promise) {
      return depthCacheRef.current.promise;
    }

    depthCacheRef.current.revision = imageRevisionRef.current;
    depthCacheRef.current.promise = (async () => {
      const needsDownload = !isDepthModelLoaded();
      if (needsDownload) {
        setDepthStatus('downloading');
        setDepthProgress(0);
      } else {
        setDepthStatus('estimating');
      }
      try {
        const payload = await estimateDepthMapFromCanvas(canvasRef.current, {
          progress_callback: needsDownload
            ? (event) => {
                if (event.status === 'progress' && Number.isFinite(event.progress)) {
                  setDepthProgress(Math.round(event.progress));
                }
              }
            : undefined,
        });
        depthCacheRef.current.payload = payload;
        setDepthStatus('ready');
        return payload;
      } catch (err) {
        depthCacheRef.current.revision = -1;
        depthCacheRef.current.payload = null;
        setDepthStatus('error');
        console.warn('Depth estimation failed.', err);
        return null;
      } finally {
        depthCacheRef.current.promise = null;
      }
    })();

    return depthCacheRef.current.promise;
  }, [setDepthStatus, setDepthProgress]);

  const getCurrentPixelSize = useCallback(() => {
    const state = usePlotterStore.getState();
    if (state.imageset && canvasRef.current.width > 0 && canvasRef.current.height > 0) {
      return { width: canvasRef.current.width, height: canvasRef.current.height };
    }
    if (Number.isFinite(cwRef.current) && Number.isFinite(chRef.current) && cwRef.current > 0 && chRef.current > 0) {
      return { width: cwRef.current, height: chRef.current };
    }
    const configWidth = Number(state.config.width);
    const configHeight = Number(state.config.height);
    if (Number.isFinite(configWidth) && Number.isFinite(configHeight) && configWidth > 0 && configHeight > 0) {
      return { width: configWidth, height: configHeight };
    }
    return { width: 0, height: 0 };
  }, []);

  const applyOutputSize = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const { outputSize, outputAutoSync, outputDpi, config } = usePlotterStore.getState();
    const unit = normalizeOutputUnit(outputSize.unit);
    let nextWidth = Number(outputSize.width);
    let nextHeight = Number(outputSize.height);

    if (outputAutoSync) {
      const { width: pxWidth, height: pxHeight } = getCurrentPixelSize();
      if (Number.isFinite(pxWidth) && pxWidth > 0 && Number.isFinite(pxHeight) && pxHeight > 0) {
        const dpi = normalizeOutputDpi(outputDpi);
        const inchWidth = pxWidth / dpi;
        const inchHeight = pxHeight / dpi;
        nextWidth = unit === 'mm' ? inchWidth * OUTPUT_UNIT_TO_MM.in : inchWidth;
        nextHeight = unit === 'mm' ? inchHeight * OUTPUT_UNIT_TO_MM.in : inchHeight;
        nextWidth = roundOutputValue(nextWidth);
        nextHeight = roundOutputValue(nextHeight);
        if (nextWidth !== outputSize.width || nextHeight !== outputSize.height) {
          setOutputSize({ width: nextWidth, height: nextHeight, unit });
        }
      }
    }

    if (Number.isFinite(nextWidth) && nextWidth > 0 && Number.isFinite(nextHeight) && nextHeight > 0) {
      svg.setAttribute('width', `${formatOutputValue(nextWidth)}${unit}`);
      svg.setAttribute('height', `${formatOutputValue(nextHeight)}${unit}`);
      return;
    }

    const fallbackWidth = Number.isFinite(Number(config.width)) ? Number(config.width) : canvasRef.current.width;
    const fallbackHeight = Number.isFinite(Number(config.height)) ? Number(config.height) : canvasRef.current.height;
    svg.setAttribute('width', fallbackWidth);
    svg.setAttribute('height', fallbackHeight);
  }, [getCurrentPixelSize, setOutputSize]);

  const checkScroll = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.style.position = 'static';
    svg.style.left = 'auto';
    svg.style.top = 'auto';
  }, []);

  const applyStrokeAttributes = useCallback((path, stroke) => {
    if (!path) return;
    const { penWidth } = usePlotterStore.getState();
    if (stroke !== undefined) {
      path.setAttributeNS(null, 'stroke', stroke);
    }
    path.setAttributeNS(null, 'fill', 'none');
    path.setAttributeNS(null, 'stroke-width', String(penWidth));
    path.setAttributeNS(null, 'stroke-linecap', 'round');
    path.setAttributeNS(null, 'stroke-linejoin', 'round');
  }, []);

  const getMonoStroke = useCallback(() => {
    const state = usePlotterStore.getState();
    if (state.penColor) return state.penColor;
    return state.config && state.config.Inverted ? 'white' : 'black';
  }, []);

  const clearPathElements = useCallback((paths) => {
    if (!paths || !paths.length) return;
    paths.forEach((path) => {
      if (path && path.parentNode) path.parentNode.removeChild(path);
    });
  }, []);

  const setPathSegments = useCallback(
    (group, existingPaths, segments, stroke, idBase) => {
      clearPathElements(existingPaths);
      const created = [];
      if (!group || !segments || !segments.length) return created;
      segments.forEach((segment, index) => {
        if (!segment) return;
        const path = document.createElementNS(svgNS, 'path');
        if (idBase) {
          const suffix = segments.length > 1 ? `-${index + 1}` : '';
          path.setAttributeNS(null, 'id', `${idBase}${suffix}`);
        }
        path.setAttributeNS(null, 'd', segment);
        applyStrokeAttributes(path, stroke);
        group.appendChild(path);
        created.push(path);
      });
      return created;
    },
    [applyStrokeAttributes, clearPathElements]
  );

  const updateStrokeWidth = useCallback(() => {
    if (mainPathsRef.current && mainPathsRef.current.length) {
      mainPathsRef.current.forEach((path) => applyStrokeAttributes(path));
    }
    if (palettePathsByChannelRef.current && palettePathsByChannelRef.current.length) {
      palettePathsByChannelRef.current.forEach((paths) => {
        paths.forEach((path) => applyStrokeAttributes(path));
      });
    }
  }, [applyStrokeAttributes]);

  const updateMonoStroke = useCallback(() => {
    const state = usePlotterStore.getState();
    if (state.colorMode !== 'mono') return;
    const stroke = getMonoStroke();
    if (mainPathsRef.current && mainPathsRef.current.length) {
      mainPathsRef.current.forEach((path) => {
        if (!path) return;
        path.setAttributeNS(null, 'stroke', stroke);
      });
    }
  }, [getMonoStroke]);

  const resetSVG = useCallback(
    (activePalette, config) => {
      const svg = svgRef.current;
      if (!svg) return;
      let child;
      while ((child = svg.firstChild)) svg.removeChild(child);
      applyOutputSize();
      svg.setAttribute('viewBox', `0 0 ${config.width} ${config.height}`);
      svg.style.background = config.Inverted ? 'black' : 'white';
      mainPathsRef.current = [];
      mainGroupRef.current = null;
      paletteGroupsRef.current = [];
      palettePathsByChannelRef.current = [];

      if (!activePalette || activePalette.length === 0) {
        mainGroupRef.current = document.createElementNS(svgNS, 'g');
        svg.appendChild(mainGroupRef.current);
        return;
      }

      activePalette.forEach((entry, index) => {
        const id = entry.id || `color-${index + 1}`;
        const group = document.createElementNS(svgNS, 'g');
        group.setAttributeNS(null, 'id', id);
        svg.appendChild(group);
        paletteGroupsRef.current.push(group);
        palettePathsByChannelRef.current.push([]);
      });
    },
    [applyOutputSize]
  );

  const resolveActivePalette = useCallback(() => {
    const state = usePlotterStore.getState();
    return paletteResolveActivePalette(state.colorMode, {
      includeBlack: state.includeBlack,
      customPalette: state.customPalette,
      getPlotterfunColorMode: () => state.plotterfunColorMode,
    });
  }, []);

  const sendToWorker = useCallback((msg) => {
    if (myWorkerRef.current) myWorkerRef.current.postMessage(msg);
  }, []);

  const process = useCallback(async () => {
    const state = usePlotterStore.getState();
    if (!state.imageset) return;
    if (!myWorkerRef.current) return;

    if (workerBusyRef.current) {
      const workerSrc = workerSrcRef.current || state.algorithm;
      if (!workerModules[workerSrc]) return;
      if (myWorkerRef.current) myWorkerRef.current.terminate();
      myWorkerRef.current = workerModules[workerSrc]();
      workerBusyRef.current = false;
      if (workerMessageHandlerRef.current) {
        myWorkerRef.current.onmessage = workerMessageHandlerRef.current;
      }
    }

    const token = ++processTokenRef.current;
    const nextConfig = { ...state.config, width: canvasRef.current.width, height: canvasRef.current.height };
    const penWidthValue = Number(state.penWidth);
    if (Number.isFinite(penWidthValue) && penWidthValue > 0) {
      nextConfig.penWidth = penWidthValue;
    }

    if (nextConfig['Face Boundary']) {
      if (faceBoundaryCacheRef.current.revision !== imageRevisionRef.current) {
        faceBoundaryCacheRef.current.polygon = await computeFaceBoundaryPolygon(canvasRef.current);
        faceBoundaryCacheRef.current.revision = imageRevisionRef.current;
      }
      if (token !== processTokenRef.current) return;
      nextConfig.faceBoundary = faceBoundaryCacheRef.current.polygon;

      const polygon = nextConfig.faceBoundary;
      const offsetValue = Number(nextConfig['Face Boundary Offset']) || 0;
      if (polygon && polygon.length >= 3) {
        const maskCache = faceBoundaryMaskRef.current;
        const width = nextConfig.width;
        const height = nextConfig.height;
        if (
          maskCache.revision === imageRevisionRef.current &&
          maskCache.offset === offsetValue &&
          maskCache.width === width &&
          maskCache.height === height &&
          maskCache.mask
        ) {
          nextConfig.faceBoundaryMask = maskCache.mask;
          nextConfig.faceBoundaryMaskWidth = width;
          nextConfig.faceBoundaryMaskHeight = height;
        } else {
          const mask = buildFaceBoundaryMask(polygon, width, height, offsetValue);
          faceBoundaryMaskRef.current = {
            revision: imageRevisionRef.current,
            offset: offsetValue,
            width,
            height,
            mask,
          };
          nextConfig.faceBoundaryMask = mask;
          nextConfig.faceBoundaryMaskWidth = width;
          nextConfig.faceBoundaryMaskHeight = height;
        }
      } else {
        nextConfig.faceBoundaryMask = null;
        nextConfig.faceBoundaryMaskWidth = null;
        nextConfig.faceBoundaryMaskHeight = null;
      }
    } else {
      nextConfig.faceBoundary = null;
      nextConfig.faceBoundaryMask = null;
      nextConfig.faceBoundaryMaskWidth = null;
      nextConfig.faceBoundaryMaskHeight = null;
    }

    const depthStrength = Number(nextConfig['Depth Strength']);
    let depthPayload = null;
    if (nextConfig['Depth Map'] && Number.isFinite(depthStrength) && depthStrength > 0) {
      depthPayload = await getDepthPayload();
      if (token !== processTokenRef.current) return;
    }

    const activePalette = resolveActivePalette();
    activePaletteRef.current = activePalette;

    const imageData = ctxRef.current.getImageData(0, 0, nextConfig.width, nextConfig.height);
    resetSVG(activePalette, nextConfig);
    const workerConfig = { ...nextConfig, depthData: depthPayload };
    paletteWorkerConfigRef.current = workerConfig;

    if (!activePalette || activePalette.length === 0 || state.colorMode === 'mono') {
      paletteChannelsRef.current = null;
      paletteChannelIndexRef.current = 0;
      workerBusyRef.current = true;
      sendToWorker([workerConfig, imageData]);
      return;
    }

    const paletteChannels = buildColorChannels(imageData, activePalette, state.colorMode, state.colorMethod, {
      includeBlack: state.includeBlack,
      inkGamma: state.inkGamma,
      distancePower: state.distancePower,
      getPlotterfunColorMode: () => state.plotterfunColorMode,
    });

    if (!paletteChannels || paletteChannels.length === 0) {
      paletteChannelsRef.current = null;
      paletteChannelIndexRef.current = 0;
      workerBusyRef.current = true;
      sendToWorker([workerConfig, imageData]);
      return;
    }

    paletteChannelsRef.current = paletteChannels;
    paletteChannelIndexRef.current = 0;
    workerBusyRef.current = true;
    sendToWorker([workerConfig, paletteChannels[paletteChannelIndexRef.current]]);
  }, [getDepthPayload, resetSVG, resolveActivePalette, sendToWorker]);

  const loadWorker = useCallback(
    (src) => {
      if (!workerModules[src]) {
        console.error('Unknown worker:', src);
        return;
      }

      setBuffering(true);
      setMsg('');
      if (myWorkerRef.current) myWorkerRef.current.terminate();
      myWorkerRef.current = workerModules[src]();
      workerBusyRef.current = false;
      workerSrcRef.current = src;

      const handleWorkerMessage = (msg) => {
        const [type, data] = msg.data;

        if (type === 'sliders') {
          workerBusyRef.current = false;
          setBuffering(false);
          if (src === algoRef.current) return;
          algoRef.current = src;

          const prevConfig = usePlotterStore.getState().config;
          const nextConfig = { ...prevConfig };
          data.forEach((control) => {
            if (control.type === 'checkbox') {
              if (nextConfig[control.label] === undefined) {
                nextConfig[control.label] = Boolean(control.checked);
              }
            } else if (nextConfig[control.label] === undefined) {
              nextConfig[control.label] = control.value;
            }
          });

          setAlgoControls(data);
          setConfig(nextConfig);
          process();
          return;
        }

        if (type === 'msg') {
          setMsg(data);
          return;
        }

        if (type === 'dbg') {
          window.data = data;
          console.log(data);
          return;
        }

        if (type === 'svg-path') {
          const paletteChannels = paletteChannelsRef.current;
          const palettePaths = palettePathsByChannelRef.current;
          const activePalette = activePaletteRef.current;

          if (paletteChannels && activePalette && palettePaths.length) {
            const paletteEntry = activePalette[paletteChannelIndexRef.current];
            const stroke = paletteEntry && paletteEntry.color ? paletteEntry.color : '#000000';
            const group = paletteGroupsRef.current[paletteChannelIndexRef.current];
            const segments = splitPathDataByLength(data);
            palettePathsByChannelRef.current[paletteChannelIndexRef.current] = setPathSegments(
              group,
              palettePathsByChannelRef.current[paletteChannelIndexRef.current],
              segments,
              stroke,
              paletteEntry && paletteEntry.id ? paletteEntry.id : null
            );
            paletteChannelIndexRef.current += 1;
            if (paletteChannelIndexRef.current < paletteChannels.length) {
              sendToWorker([paletteWorkerConfigRef.current, paletteChannels[paletteChannelIndexRef.current]]);
            } else {
              workerBusyRef.current = false;
            }
            return;
          }

          if (mainGroupRef.current) {
            const stroke = getMonoStroke();
            const segments = splitPathDataByLength(data);
            mainPathsRef.current = setPathSegments(mainGroupRef.current, mainPathsRef.current, segments, stroke, 'main');
          }
          workerBusyRef.current = false;
        }
      };
      workerMessageHandlerRef.current = handleWorkerMessage;
      myWorkerRef.current.onmessage = handleWorkerMessage;
    },
    [getMonoStroke, process, sendToWorker, setAlgoControls, setBuffering, setConfig, setMsg, setPathSegments]
  );

  const draw = useCallback(() => {
    const img = imgRef.current;
    const preview = previewRef.current;
    if (!img || !preview || !prectxRef.current) return;
    const cw = cwRef.current;
    const ch = chRef.current;
    prectxRef.current.clearRect(0, 0, cw, ch);
    prectxRef.current.drawImage(
      img,
      offsetRef.current[0] - scaleRef.current * img.width * 0.5,
      offsetRef.current[1] - scaleRef.current * img.height * 0.5,
      scaleRef.current * img.width,
      scaleRef.current * img.height
    );
  }, []);

  const changeSize = useCallback(
    (width, height) => {
      cwRef.current = width;
      chRef.current = height;
      if (previewRef.current) {
        previewRef.current.width = width;
        previewRef.current.height = height;
      }
      draw();
      checkScroll();
      if (usePlotterStore.getState().outputAutoSync) applyOutputSize();
    },
    [applyOutputSize, checkScroll, draw]
  );

  const handleCanvasSizeChange = useCallback(
    (nextWidth, nextHeight) => {
      if (!Number.isFinite(nextWidth) || nextWidth <= 0 || !Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setCanvasSize(nextWidth, nextHeight);
      changeSize(nextWidth, nextHeight);
    },
    [changeSize, setCanvasSize]
  );

  const handleOutputNumberInput = useCallback(
    (field, value) => {
      const state = usePlotterStore.getState();
      if (state.outputAutoSync) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      setOutputSize({ [field]: numeric });
      applyOutputSize();
    },
    [applyOutputSize, setOutputSize]
  );

  const handleOutputUnitChange = useCallback(
    (nextUnit) => {
      const state = usePlotterStore.getState();
      const normalized = normalizeOutputUnit(nextUnit);
      if (state.outputAutoSync) {
        setOutputSize({ unit: normalized });
        applyOutputSize();
        return;
      }

      const currentUnit = normalizeOutputUnit(state.outputSize.unit);
      if (normalized === currentUnit) {
        applyOutputSize();
        return;
      }

      const nextWidth = convertOutputValue(Number(state.outputSize.width), currentUnit, normalized);
      const nextHeight = convertOutputValue(Number(state.outputSize.height), currentUnit, normalized);
      setOutputSize({
        width: Number.isFinite(nextWidth) ? roundOutputValue(nextWidth) : state.outputSize.width,
        height: Number.isFinite(nextHeight) ? roundOutputValue(nextHeight) : state.outputSize.height,
        unit: normalized,
      });
      applyOutputSize();
    },
    [applyOutputSize, setOutputSize]
  );

  const handleOutputAutoToggle = useCallback(
    (checked) => {
      setOutputAutoSync(Boolean(checked));
      applyOutputSize();
    },
    [applyOutputSize, setOutputAutoSync]
  );

  const handleOutputDpiChange = useCallback(
    (value) => {
      setOutputDpi(value);
      if (usePlotterStore.getState().outputAutoSync) applyOutputSize();
    },
    [applyOutputSize, setOutputDpi]
  );

  const handleTabChange = useCallback(
    (tab) => {
      usePlotterStore.getState().setActiveTab(tab);
    },
    []
  );

  const handleSelectImage = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        let cw = cwRef.current;
        let ch = chRef.current;

        if (width > cw || height > ch) {
          ch = Math.round((cw * height) / width);
        } else if (width > 10 && height > 10) {
          ch = height;
          cw = width;
        }

        setCanvasSize(cw, ch);
        changeSize(cw, ch);
        scaleRef.current = Math.min(ch / height, cw / width);
        offsetRef.current = [cw / 2, ch / 2];
        imgRef.current = img;
        draw();
      };
      img.src = URL.createObjectURL(file);
    },
    [changeSize, draw, setCanvasSize]
  );

  const handleUseImage = useCallback(() => {
    if (!imgRef.current) return;
    setImageSet(true);
    markImageChanged();
    canvasRef.current.width = cwRef.current;
    canvasRef.current.height = chRef.current;
    ctxRef.current.fillStyle = '#fff';
    ctxRef.current.fillRect(0, 0, cwRef.current, chRef.current);
    if (previewRef.current) ctxRef.current.drawImage(previewRef.current, 0, 0);
    checkScroll();
    process();
  }, [checkScroll, markImageChanged, process, setImageSet]);

  const handleSnapshot = useCallback(() => {
    setImageSet(true);
    markImageChanged();
    webcamSnapshot(videoRef.current, canvasRef.current, ctxRef.current, () => {
      checkScroll();
      process();
    }, webcamMirror);
  }, [checkScroll, markImageChanged, process, setImageSet, webcamMirror]);

  const handleToggleVideoPause = useCallback(() => {
    webcamTogglePause(videoRef.current);
  }, []);

  const handleWebcamMirrorChange = useCallback(
    (checked) => {
      setWebcamMirror(Boolean(checked));
    },
    [setWebcamMirror]
  );

  const handleAlgorithmChange = useCallback(
    (value) => {
      usePlotterStore.getState().setAlgorithm(value);
    },
    []
  );

  const handleColorModeChange = useCallback(
    (value) => {
      usePlotterStore.getState().setColorMode(value);
      process();
    },
    [process]
  );

  const handleColorMethodChange = useCallback(
    (value) => {
      usePlotterStore.getState().setColorMethod(value);
      process();
    },
    [process]
  );

  const handlePlotterfunColorModeChange = useCallback(
    (value) => {
      usePlotterStore.getState().setPlotterfunColorMode(value);
      process();
    },
    [process]
  );

  const handleIncludeBlackChange = useCallback(
    (checked) => {
      usePlotterStore.getState().setIncludeBlack(Boolean(checked));
      process();
    },
    [process]
  );

  const handleDistancePowerChange = useCallback(
    (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      usePlotterStore.getState().setDistancePower(numeric);
      process();
    },
    [process]
  );

  const handleInkGammaChange = useCallback(
    (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      usePlotterStore.getState().setInkGamma(numeric);
      process();
    },
    [process]
  );

  const handlePenWidthChange = useCallback(
    (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      setPenWidth(numeric);
      updateStrokeWidth();
    },
    [setPenWidth, updateStrokeWidth]
  );

  const handlePenColorChange = useCallback(
    (value) => {
      if (!value) return;
      setPenColor(value);
      updateMonoStroke();
    },
    [setPenColor, updateMonoStroke]
  );

  const handleCustomPaletteColorChange = useCallback(
    (index, value) => {
      updateCustomPaletteColor(index, value);
      process();
    },
    [process, updateCustomPaletteColor]
  );

  const handleCustomPaletteAdd = useCallback(() => {
    addCustomPaletteColor('#000000');
    process();
  }, [addCustomPaletteColor, process]);

  const handleCustomPaletteRemove = useCallback(
    (index) => {
      removeCustomPaletteColor(index);
      process();
    },
    [process, removeCustomPaletteColor]
  );

  const handleCustomPaletteReset = useCallback(() => {
    resetCustomPalette();
    process();
  }, [process, resetCustomPalette]);

  const handleAlgoControlChange = useCallback(
    (control, value, options = {}) => {
      let nextValue = value;
      if (control.type === 'checkbox') {
        nextValue = Boolean(value);
      } else if (control.type !== 'select') {
        nextValue = Number(value);
        if (!Number.isFinite(nextValue)) return;
      }
      setConfigValue(control.label, nextValue);
      if (control.label === 'Face Boundary' && nextValue) {
        faceBoundaryCacheRef.current = { revision: -1, polygon: null };
        faceBoundaryMaskRef.current = { revision: -1, offset: 0, width: 0, height: 0, mask: null };
      }
      if (!usePlotterStore.getState().imageset) return;
      if (options.defer) return;
      if (!control.noRestart) {
        process();
      } else {
        sendToWorker([usePlotterStore.getState().config]);
      }
    },
    [process, sendToWorker, setConfigValue]
  );

  const handleApplyFaceBoundaryCrop = useCallback(async () => {
    const state = usePlotterStore.getState();
    if (!state.imageset) {
      setMsg('Load an image first');
      return;
    }
    if (!state.config['Face Boundary']) {
      setMsg('Enable Face Boundary first');
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;

    if (faceBoundaryCacheRef.current.revision !== imageRevisionRef.current) {
      faceBoundaryCacheRef.current.polygon = await computeFaceBoundaryPolygon(canvasRef.current);
      faceBoundaryCacheRef.current.revision = imageRevisionRef.current;
    }

    const basePolygon = faceBoundaryCacheRef.current.polygon;
    if (!basePolygon || basePolygon.length < 3) {
      setMsg('No face boundary found');
      return;
    }

    const offsetValue = Number(state.config['Face Boundary Offset']) || 0;
    const polygon = getExpandedFaceBoundaryPolygon(basePolygon, offsetValue);
    if (!polygon || polygon.length < 3) {
      setMsg('Face boundary crop failed');
      return;
    }

    let defs = svg.querySelector('defs[data-face-boundary-crop="true"]');
    if (!defs) {
      defs = document.createElementNS(svgNS, 'defs');
      defs.setAttribute('data-face-boundary-crop', 'true');
      svg.appendChild(defs);
    } else {
      while (defs.firstChild) defs.removeChild(defs.firstChild);
    }

    const clipPath = document.createElementNS(svgNS, 'clipPath');
    clipPath.setAttribute('id', FACE_CROP_CLIP_ID);
    clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const polygonNode = document.createElementNS(svgNS, 'polygon');
    polygonNode.setAttribute('points', polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
    clipPath.appendChild(polygonNode);
    defs.appendChild(clipPath);

    const targets = [];
    if (mainGroupRef.current) targets.push(mainGroupRef.current);
    if (paletteGroupsRef.current && paletteGroupsRef.current.length) {
      targets.push(...paletteGroupsRef.current.filter(Boolean));
    }
    if (!targets.length) {
      setMsg('Nothing to crop yet');
      return;
    }
    targets.forEach((node) => node.setAttribute('clip-path', `url(#${FACE_CROP_CLIP_ID})`));
    setMsg('Applied face boundary crop');
  }, [getExpandedFaceBoundaryPolygon, setMsg]);

  const handleDownload = useCallback(() => {
    applyOutputSize();
    const svg = svgRef.current;
    if (!svg) return;
    const svgString =
      '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
      new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const downloadLink = document.createElement('a');
    const algoName = usePlotterStore.getState().algorithm || 'plotterfun';
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = algoName.replace('.js', '_') + Date.now() + '.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [applyOutputSize]);

  useEffect(() => {
    if (!previewRef.current) return;
    prectxRef.current = previewRef.current.getContext('2d');
  }, []);

  useEffect(() => {
    changeSize(cwRef.current, chRef.current);
  }, [changeSize]);

  useEffect(() => {
    const onResize = () => checkScroll();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [checkScroll]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const onMouseDown = (event) => {
      let dx = event.clientX;
      let dy = event.clientY;
      const csc = cwRef.current / preview.getBoundingClientRect().width;

      document.onmousemove = (moveEvent) => {
        const x = moveEvent.clientX - dx;
        const y = moveEvent.clientY - dy;
        offsetRef.current[0] += x * csc;
        offsetRef.current[1] += y * csc;
        dx = moveEvent.clientX;
        dy = moveEvent.clientY;
        draw();
        return false;
      };

      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
      };
      return false;
    };

    const onWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const previousScale = scaleRef.current;
      scaleRef.current *= event.deltaY > 0 ? 1.1 : 0.9;
      offsetRef.current[0] = ((offsetRef.current[0] - cwRef.current / 2) / previousScale) * scaleRef.current + cwRef.current / 2;
      offsetRef.current[1] = ((offsetRef.current[1] - chRef.current / 2) / previousScale) * scaleRef.current + chRef.current / 2;
      draw();
    };

    preview.addEventListener('mousedown', onMouseDown);
    preview.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      preview.removeEventListener('mousedown', onMouseDown);
      preview.removeEventListener('wheel', onWheel);
      document.onmousemove = null;
      document.onmouseup = null;
    };
  }, [draw]);

  useEffect(() => {
    loadWorker(algorithm);
    return () => {
      if (myWorkerRef.current) myWorkerRef.current.terminate();
      workerBusyRef.current = false;
      workerMessageHandlerRef.current = null;
      workerSrcRef.current = null;
    };
  }, [algorithm, loadWorker]);

  useEffect(() => {
    applyOutputSize();
  }, [applyOutputSize, outputAutoSync, outputDpi, outputSize]);

  useEffect(() => {
    updateStrokeWidth();
  }, [penWidth, updateStrokeWidth]);

  useEffect(() => {
    updateMonoStroke();
  }, [penColor, colorMode, config, updateMonoStroke]);

  useEffect(() => {
    if (activeTab === 'webcam') {
      webcamTabWebcam(videoRef.current, webcamRef.current, imgSelectRef.current, tabImageRef.current, tabWebcamRef.current);
      return;
    }
    stopWebcam(videoRef.current);
  }, [activeTab]);

  return {
    previewRef,
    svgRef,
    videoRef,
    fileInputRef,
    imgSelectRef,
    webcamRef,
    tabImageRef,
    tabWebcamRef,
    handleTabChange,
    handleSelectImage,
    handleFileInputChange,
    handleUseImage,
    handleSnapshot,
    handleToggleVideoPause,
    handleCanvasSizeChange,
    handleOutputNumberInput,
    handleOutputUnitChange,
    handleOutputAutoToggle,
    handleOutputDpiChange,
    handleAlgorithmChange,
    handleColorModeChange,
    handleColorMethodChange,
    handlePlotterfunColorModeChange,
    handleIncludeBlackChange,
    handleDistancePowerChange,
    handleInkGammaChange,
    handlePenWidthChange,
    handlePenColorChange,
    handleCustomPaletteColorChange,
    handleCustomPaletteAdd,
    handleCustomPaletteRemove,
    handleCustomPaletteReset,
    handleAlgoControlChange,
    handleApplyFaceBoundaryCrop,
    handleDownload,
    handleWebcamMirrorChange,
  };
}
