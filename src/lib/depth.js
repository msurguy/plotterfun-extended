const DEFAULT_MODEL_ID = 'onnx-community/depth-anything-v2-small';
const DEFAULT_DTYPE = 'q4';

let depthAssetsPromise = null;

export function isDepthModelLoaded() {
  return depthAssetsPromise !== null;
}

async function loadDepthAssets(progress_callback) {
  if (!depthAssetsPromise) {
    depthAssetsPromise = (async () => {
      const { AutoModelForDepthEstimation, AutoProcessor, RawImage } = await import('@huggingface/transformers');
      const opts = { dtype: DEFAULT_DTYPE };
      if (progress_callback) opts.progress_callback = progress_callback;
      const model = await AutoModelForDepthEstimation.from_pretrained(DEFAULT_MODEL_ID, opts);
      const processor = await AutoProcessor.from_pretrained(DEFAULT_MODEL_ID);
      return { model, processor, RawImage };
    })();
  }
  return depthAssetsPromise;
}

async function rawImageFromCanvas(canvas, RawImage) {
  if (typeof RawImage.fromCanvas === 'function') {
    return RawImage.fromCanvas(canvas);
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (typeof RawImage.fromURL === 'function') {
    return RawImage.fromURL(dataUrl);
  }
  if (typeof RawImage.read === 'function') {
    return RawImage.read(dataUrl);
  }

  throw new Error('RawImage canvas helpers are unavailable.');
}

function resolveDepthDims(depthTensor, fallbackWidth, fallbackHeight) {
  const dims = Array.isArray(depthTensor.dims) ? depthTensor.dims : [];
  if (dims.length >= 2) {
    return {
      width: dims[dims.length - 1],
      height: dims[dims.length - 2],
    };
  }
  return {
    width: fallbackWidth,
    height: fallbackHeight,
  };
}

function normalizeDepthData(depthTensor, width, height) {
  const depthData = depthTensor.data;
  let minDepth = Infinity;
  let maxDepth = -Infinity;

  for (let i = 0; i < depthData.length; i++) {
    const value = depthData[i];
    if (value < minDepth) minDepth = value;
    if (value > maxDepth) maxDepth = value;
  }

  const range = maxDepth - minDepth || 1;
  const normalized = new Uint8Array(depthData.length);

  for (let i = 0; i < depthData.length; i++) {
    let value = 1 - (depthData[i] - minDepth) / range;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    normalized[i] = Math.round(value * 255);
  }

  return {
    data: normalized,
    width,
    height,
    minDepth,
    maxDepth,
  };
}

export async function estimateDepthMapFromCanvas(canvas, { progress_callback } = {}) {
  const { model, processor, RawImage } = await loadDepthAssets(progress_callback);
  const image = await rawImageFromCanvas(canvas, RawImage);
  const inputs = await processor(image);
  const outputs = await model(inputs);
  const predictedDepth = outputs.predicted_depth || outputs.predictedDepth;
  if (!predictedDepth) {
    throw new Error('Depth model did not return predicted_depth.');
  }

  const { width, height } = resolveDepthDims(predictedDepth, canvas.width, canvas.height);
  return {
    ...normalizeDepthData(predictedDepth, width, height),
    focallength_px: outputs.focallength_px ?? null,
  };
}
