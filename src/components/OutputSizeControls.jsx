import React from 'react';
import { formatOutputValue } from '../utils.js';

export default function OutputSizeControls({
  outputSize,
  outputAutoSync,
  outputDpi,
  onWidthChange,
  onHeightChange,
  onUnitChange,
  onAutoChange,
  onDpiChange,
}) {
  const isManual = !outputAutoSync;
  return (
    <form className="panel-form output-size" onSubmit={(event) => event.preventDefault()}>
      <div className="panel-subtitle">Output size (SVG)</div>
      <div className="output-size-main">
        <label className="mini-field output-size-field">
          <span>Width</span>
          <input
            className="number-input"
            type="number"
            min="0.1"
            step="0.1"
            value={formatOutputValue(outputSize.width)}
            onInput={(event) => onWidthChange(event.target.value)}
            disabled={!isManual}
          />
        </label>
        <label className="mini-field output-size-field">
          <span>Height</span>
          <input
            className="number-input"
            type="number"
            min="0.1"
            step="0.1"
            value={formatOutputValue(outputSize.height)}
            onInput={(event) => onHeightChange(event.target.value)}
            disabled={!isManual}
          />
        </label>
        <label className="mini-field output-size-field">
          <span>Unit</span>
          <select
            className="select-input"
            value={outputSize.unit}
            onChange={(event) => onUnitChange(event.target.value)}
          >
            <option value="in">in</option>
            <option value="mm">mm</option>
          </select>
        </label>
      </div>
      <div className="output-size-bottom">
        <label className="inline-select-field output-dpi-inline">
          <select
            className="select-input"
            value={String(outputDpi)}
            onChange={(event) => onDpiChange(event.target.value)}
            disabled={!outputAutoSync}
          >
            <option value="96">96 px/in</option>
            <option value="72">72 px/in</option>
          </select>
          <span>DPI</span>
        </label>
        <label className="checkbox-field output-autosync-field">
          <input
            className="checkbox-input"
            type="checkbox"
            checked={outputAutoSync}
            onChange={(event) => onAutoChange(event.target.checked)}
          />
          <span>Auto Sync</span>
        </label>
      </div>
    </form>
  );
}
