// Shared constants for Plotterfun

// Face detection constants
export const FACE_LANDMARKER_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
export const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
export const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

// Preset color palettes
export const PRESET_PALETTES = {
  cmyk: [
    { id: 'cyan', label: 'Cyan', color: '#00ffff' },
    { id: 'magenta', label: 'Magenta', color: '#ff00ff' },
    { id: 'yellow', label: 'Yellow', color: '#ffff00' },
    { id: 'black', label: 'Black', color: '#000000' },
  ],
  rgb: [
    { id: 'red', label: 'Red', color: '#ff0000' },
    { id: 'green', label: 'Green', color: '#00ff00' },
    { id: 'blue', label: 'Blue', color: '#0000ff' },
  ],
};

// Output size constants
export const OUTPUT_UNIT_TO_MM = { in: 25.4, mm: 1 };
export const OUTPUT_VALUE_DECIMALS = 2;

// SVG path constants
export const MAX_PATH_LENGTH = 50000;
export const PATH_DECIMALS = 2;
