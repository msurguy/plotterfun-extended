// Palette management module for Plotterfun

import { PRESET_PALETTES } from './constants.js';
import { normalizeHexColor, hexToRgb, sanitizeId, clampByte, weightedColorDistance } from './utils.js';

// Palette building functions
export function buildPaletteFromPreset(preset) {
  return preset.map((entry, index) => {
    const color = normalizeHexColor(entry.color);
    return {
      id: sanitizeId(entry.id || entry.label, `color-${index + 1}`),
      label: entry.label,
      color,
      rgb: hexToRgb(color),
    };
  });
}

export function buildCustomPalette(colors) {
  return colors
    .map((color, index) => {
      const normalized = normalizeHexColor(color);
      if (!normalized) return null;
      return {
        id: `custom-${index + 1}`,
        label: `Color ${index + 1}`,
        color: normalized,
        rgb: hexToRgb(normalized),
      };
    })
    .filter(Boolean);
}

export function resolveActivePalette(mode, options = {}) {
  const { includeBlack = true, customPalette = [], getPlotterfunColorMode = () => 'cmyk' } = options;

  if (mode === 'mono') return null;

  if (mode === 'cmyk') {
    const preset = includeBlack
      ? PRESET_PALETTES.cmyk
      : PRESET_PALETTES.cmyk.filter((entry) => entry.id !== 'black');
    return buildPaletteFromPreset(preset);
  }

  if (mode === 'rgb') return buildPaletteFromPreset(PRESET_PALETTES.rgb);

  if (mode === 'plotterfun-color') {
    const plotterMode = getPlotterfunColorMode();
    if (plotterMode === 'rgb') return buildPaletteFromPreset(PRESET_PALETTES.rgb);
    if (plotterMode === 'custom') return buildCustomPalette(customPalette);
    const preset = includeBlack
      ? PRESET_PALETTES.cmyk
      : PRESET_PALETTES.cmyk.filter((entry) => entry.id !== 'black');
    return buildPaletteFromPreset(preset);
  }

  return buildCustomPalette(customPalette);
}

// Gamma and ink functions
export function applyInkGamma(value, gamma) {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.pow(clamped, gamma);
}

// Channel building functions
export function buildRGBChannels(imageData, inkGamma = 1.2) {
  const { width, height, data } = imageData;
  const channels = [new ImageData(width, height), new ImageData(width, height), new ImageData(width, height)];
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i += 1) {
    const offset = i * 4;
    const r = applyInkGamma(data[offset] / 255, inkGamma);
    const g = applyInkGamma(data[offset + 1] / 255, inkGamma);
    const b = applyInkGamma(data[offset + 2] / 255, inkGamma);
    const alpha = data[offset + 3];
    const values = [r, g, b];

    for (let c = 0; c < 3; c += 1) {
      const v = 255 - Math.round(255 * values[c]);
      const channelData = channels[c].data;
      channelData[offset] = v;
      channelData[offset + 1] = v;
      channelData[offset + 2] = v;
      channelData[offset + 3] = alpha;
    }
  }
  return channels;
}

export function buildPlotterfunColorChannels(imageData, includeK, useRGB) {
  const { width, height, data } = imageData;
  const channelCount = useRGB ? 3 : includeK ? 4 : 3;
  const channels = new Array(channelCount).fill(null).map(() => new ImageData(width, height));
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const alpha = 255;

    if (useRGB) {
      const values = [r, g, b];
      for (let cIndex = 0; cIndex < 3; cIndex += 1) {
        const v = 255 - values[cIndex];
        const channelData = channels[cIndex].data;
        channelData[offset] = v;
        channelData[offset + 1] = v;
        channelData[offset + 2] = v;
        channelData[offset + 3] = alpha;
      }
      continue;
    }

    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const k = Math.min(1 - rn, Math.min(1 - gn, 1 - bn));
    let c = 0;
    let m = 0;
    let y = 0;

    if (k < 1) {
      c = (1 - rn - k) / (1 - k);
      m = (1 - gn - k) / (1 - k);
      y = (1 - bn - k) / (1 - k);
    }

    const values = [c, m, y];
    if (includeK) values.push(k);

    for (let cIndex = 0; cIndex < values.length; cIndex += 1) {
      const v = 255 - clampByte(values[cIndex] * 255);
      const channelData = channels[cIndex].data;
      channelData[offset] = v;
      channelData[offset + 1] = v;
      channelData[offset + 2] = v;
      channelData[offset + 3] = alpha;
    }
  }
  return channels;
}

export function buildPlotterfunColorCustomChannels(imageData, palette) {
  if (!palette || palette.length === 0) return null;
  const { width, height, data } = imageData;
  const channels = palette.map(() => new ImageData(width, height));
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i += 1) {
    const offset = i * 4;
    const r = data[offset] / 255;
    const g = data[offset + 1] / 255;
    const b = data[offset + 2] / 255;
    const alpha = 255;

    for (let cIndex = 0; cIndex < palette.length; cIndex += 1) {
      const [pr, pg, pb] = palette[cIndex].rgb;
      const distance = weightedColorDistance(r, g, b, pr, pg, pb);
      const amount = Math.max(0, Math.min(1, 1 - distance));
      const v = 255 - clampByte(amount * 255);
      const channelData = channels[cIndex].data;
      channelData[offset] = v;
      channelData[offset + 1] = v;
      channelData[offset + 2] = v;
      channelData[offset + 3] = alpha;
    }
  }
  return channels;
}

export function buildCMYKChannels(imageData, includeK, inkGamma = 1.2) {
  const { width, height, data } = imageData;
  const channelCount = includeK ? 4 : 3;
  const channels = new Array(channelCount).fill(null).map(() => new ImageData(width, height));
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i += 1) {
    const offset = i * 4;
    const r = data[offset] / 255;
    const g = data[offset + 1] / 255;
    const b = data[offset + 2] / 255;
    const alpha = data[offset + 3];
    const k = Math.min(1 - r, Math.min(1 - g, 1 - b));
    let c = 0;
    let m = 0;
    let y = 0;

    if (k < 1) {
      c = (1 - r - k) / (1 - k);
      m = (1 - g - k) / (1 - k);
      y = (1 - b - k) / (1 - k);
    }

    const values = [applyInkGamma(c, inkGamma), applyInkGamma(m, inkGamma), applyInkGamma(y, inkGamma)];
    if (includeK) values.push(applyInkGamma(k, inkGamma));

    for (let cIndex = 0; cIndex < values.length; cIndex += 1) {
      const v = 255 - Math.round(255 * values[cIndex]);
      const channelData = channels[cIndex].data;
      channelData[offset] = v;
      channelData[offset + 1] = v;
      channelData[offset + 2] = v;
      channelData[offset + 3] = alpha;
    }
  }
  return channels;
}

export function buildCustomChannels(imageData, palette, method, distancePower = 2, inkGamma = 1.2) {
  const { width, height, data } = imageData;
  const channels = palette.map(() => new ImageData(width, height));
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i += 1) {
    const offset = i * 4;
    const r = data[offset] / 255;
    const g = data[offset + 1] / 255;
    const b = data[offset + 2] / 255;
    const alpha = data[offset + 3];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const inkBudget = Math.pow(1 - luma, inkGamma);

    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let p = 0; p < palette.length; p += 1) {
      const [pr, pg, pb] = palette[p].rgb;
      const dist = weightedColorDistance(r, g, b, pr, pg, pb);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = p;
      }
    }

    const matchStrength = method === 'match' ? Math.pow(Math.max(0, 1 - bestDistance), distancePower) : 1;
    const ink = Math.min(1, Math.max(0, inkBudget * matchStrength));

    for (let c = 0; c < palette.length; c += 1) {
      const v = c === bestIndex ? 255 - Math.round(255 * ink) : 255;
      const channelData = channels[c].data;
      channelData[offset] = v;
      channelData[offset + 1] = v;
      channelData[offset + 2] = v;
      channelData[offset + 3] = alpha;
    }
  }
  return channels;
}

export function buildColorChannels(imageData, palette, mode, method, options = {}) {
  const { includeBlack = true, inkGamma = 1.2, distancePower = 2, getPlotterfunColorMode = () => 'cmyk' } = options;

  if (mode === 'cmyk') {
    return buildCMYKChannels(imageData, includeBlack, inkGamma);
  }
  if (mode === 'rgb') return buildRGBChannels(imageData, inkGamma);
  if (mode === 'plotterfun-color') {
    const plotterMode = getPlotterfunColorMode();
    if (plotterMode === 'rgb') return buildPlotterfunColorChannels(imageData, false, true);
    if (plotterMode === 'custom') return buildPlotterfunColorCustomChannels(imageData, palette);
    return buildPlotterfunColorChannels(imageData, includeBlack, false);
  }
  if (mode === 'custom' && palette && palette.length) {
    return buildCustomChannels(imageData, palette, method, distancePower, inkGamma);
  }
  return null;
}

// Palette UI functions
export function renderCustomPalette(palette, container, callbacks = {}) {
  if (!container) return;
  const { onColorChange = () => {}, onRemove = () => {} } = callbacks;

  container.innerHTML = '';
  palette.forEach((color, index) => {
    const row = document.createElement('div');
    row.className = 'palette-row';

    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = normalizeHexColor(color) || '#000000';

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = swatch.value;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';

    swatch.addEventListener('input', () => {
      hexInput.value = swatch.value;
      onColorChange(index, swatch.value);
    });

    hexInput.addEventListener('change', () => {
      const normalized = normalizeHexColor(hexInput.value);
      if (!normalized) {
        hexInput.value = swatch.value;
        return;
      }
      swatch.value = normalized;
      onColorChange(index, normalized);
    });

    remove.addEventListener('click', () => {
      if (palette.length <= 1) return;
      onRemove(index);
    });

    row.append(swatch, hexInput, remove);
    container.append(row);
  });
}

export function setCustomPaletteVisible(element, visible) {
  if (!element) return;
  element.style.display = visible ? 'block' : 'none';
}

export function setIncludeBlackVisible(element, visible) {
  if (!element) return;
  element.parentElement.style.display = visible ? 'block' : 'none';
}
