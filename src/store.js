import { create } from 'zustand';
import { PRESET_PALETTES } from './constants.js';
import { normalizeOutputDpi, normalizeOutputUnit } from './utils.js';
import { getStoredTheme } from './theme.js';

const defaultCustomPalette = PRESET_PALETTES.cmyk.map((entry) => entry.color);

export const usePlotterStore = create((set) => ({
  activeTab: 'image',
  canvasWidth: 800,
  canvasHeight: 600,
  outputSize: { width: 8, height: 6, unit: normalizeOutputUnit('in') },
  outputAutoSync: false,
  outputDpi: normalizeOutputDpi(96),
  algorithm: 'squiggle.js',
  buffering: false,
  msg: '',
  themeMode: getStoredTheme(),
  colorMode: 'mono',
  colorMethod: 'classic',
  plotterfunColorMode: 'cmyk',
  includeBlack: true,
  distancePower: 2,
  inkGamma: 1.2,
  penWidth: 2,
  penColor: '#000000',
  customPalette: defaultCustomPalette,
  config: {},
  algoControls: [],
  imageset: false,
  depthStatus: 'idle',
  depthProgress: 0,
  webcamMirror: true,
  setActiveTab: (activeTab) => set({ activeTab }),
  setCanvasSize: (canvasWidth, canvasHeight) => set({ canvasWidth, canvasHeight }),
  setOutputSize: (outputSize) =>
    set((state) => ({ outputSize: { ...state.outputSize, ...outputSize } })),
  setOutputAutoSync: (outputAutoSync) => set({ outputAutoSync }),
  setOutputDpi: (outputDpi) => set({ outputDpi: normalizeOutputDpi(outputDpi) }),
  setAlgorithm: (algorithm) => set({ algorithm }),
  setBuffering: (buffering) => set({ buffering }),
  setMsg: (msg) => set({ msg }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setColorMode: (colorMode) => set({ colorMode }),
  setColorMethod: (colorMethod) => set({ colorMethod }),
  setPlotterfunColorMode: (plotterfunColorMode) => set({ plotterfunColorMode }),
  setIncludeBlack: (includeBlack) => set({ includeBlack }),
  setDistancePower: (distancePower) => set({ distancePower }),
  setInkGamma: (inkGamma) => set({ inkGamma }),
  setPenWidth: (penWidth) => set({ penWidth }),
  setPenColor: (penColor) => set({ penColor }),
  setCustomPalette: (customPalette) => set({ customPalette }),
  updateCustomPaletteColor: (index, color) =>
    set((state) => {
      const next = state.customPalette.slice();
      next[index] = color;
      return { customPalette: next };
    }),
  addCustomPaletteColor: (color) =>
    set((state) => ({ customPalette: [...state.customPalette, color] })),
  removeCustomPaletteColor: (index) =>
    set((state) => {
      if (state.customPalette.length <= 1) return state;
      return { customPalette: state.customPalette.filter((_, i) => i !== index) };
    }),
  resetCustomPalette: () => set({ customPalette: defaultCustomPalette }),
  setAlgoControls: (algoControls) => set({ algoControls }),
  setConfigValue: (label, value) =>
    set((state) => ({ config: { ...state.config, [label]: value } })),
  setConfig: (config) => set({ config }),
  setImageSet: (imageset) => set({ imageset }),
  setDepthStatus: (depthStatus) => set({ depthStatus }),
  setDepthProgress: (depthProgress) => set({ depthProgress }),
  setWebcamMirror: (webcamMirror) => set({ webcamMirror }),
}));
