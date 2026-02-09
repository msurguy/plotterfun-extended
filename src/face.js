// Face detection module for Plotterfun

import {
  FACE_LANDMARKER_WASM_ROOT,
  FACE_LANDMARKER_MODEL_URL,
  FACE_OVAL_INDICES,
} from './constants.js';

let faceLandmarkerPromise = null;

export async function loadFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(FACE_LANDMARKER_WASM_ROOT);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    })();
  }
  return faceLandmarkerPromise;
}

export function normalizeFaceLandmarks(result) {
  if (!result) return [];
  return result.faceLandmarks || result.face_landmarks || [];
}

export async function computeFaceBoundaryPolygon(canvas) {
  try {
    const landmarker = await loadFaceLandmarker();
    const result = landmarker.detect(canvas);
    const faces = normalizeFaceLandmarks(result);
    if (!faces.length) return null;
    const landmarks = faces[0];
    const width = canvas.width;
    const height = canvas.height;
    const polygon = FACE_OVAL_INDICES.map((index) => {
      const landmark = landmarks[index];
      if (!landmark) return null;
      const x = Math.min(width, Math.max(0, landmark.x * width));
      const y = Math.min(height, Math.max(0, landmark.y * height));
      return [x, y];
    }).filter(Boolean);
    return polygon.length >= 3 ? polygon : null;
  } catch (err) {
    console.warn('Face boundary detection failed.', err);
    return null;
  }
}
