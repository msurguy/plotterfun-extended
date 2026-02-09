import React from 'react';
import { normalizeHexColor } from '../utils.js';

export default function CustomPaletteList({ palette, onColorChange, onRemove }) {
  return (
    <div id="customPaletteList" className="palette-list">
      {palette.map((color, index) => {
        const normalized = normalizeHexColor(color) || '#000000';
        return (
          <div key={`${index}-${normalized}`} className="palette-row">
            <input
              className="palette-color"
              type="color"
              value={normalized}
              onChange={(event) => onColorChange(index, event.target.value)}
            />
            <input
              className="palette-input"
              type="text"
              defaultValue={normalized}
              onBlur={(event) => {
                const next = normalizeHexColor(event.target.value);
                if (!next) {
                  event.target.value = normalized;
                  return;
                }
                if (next !== normalized) onColorChange(index, next);
              }}
            />
            <button
              className="palette-remove"
              type="button"
              onClick={() => onRemove(index)}
              disabled={palette.length <= 1}
            >
              Remove
            </button>
          </div>
        );
      })}
    </div>
  );
}
