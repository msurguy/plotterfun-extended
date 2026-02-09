import React from 'react';
import { usePlotterStore } from '../store.js';

function DepthStatusIndicator() {
  const depthStatus = usePlotterStore((state) => state.depthStatus);
  const depthProgress = usePlotterStore((state) => state.depthProgress);

  if (depthStatus === 'downloading') {
    return (
      <div className="depth-status">
        <div className="depth-status-text">Downloading depth model... {depthProgress}%</div>
        <div className="depth-progress-track">
          <div className="depth-progress-bar" style={{ width: `${depthProgress}%` }} />
        </div>
      </div>
    );
  }

  if (depthStatus === 'estimating') {
    return (
      <div className="depth-status">
        <div className="depth-status-text">Estimating depth...</div>
      </div>
    );
  }

  if (depthStatus === 'error') {
    return (
      <div className="depth-status depth-status-error">
        <div className="depth-status-text">Depth estimation failed</div>
      </div>
    );
  }

  return null;
}

export default function AlgoControls({ controls, config, onChange, onFaceBoundaryCrop }) {
  const depthEnabled = Boolean(config['Depth Map']);
  const faceBoundaryEnabled = Boolean(config['Face Boundary']);
  const depthStatus = usePlotterStore((state) => state.depthStatus);
  const depthModelLoaded = depthStatus === 'ready';

  return (
    <form id="algoParams" className="panel-form" onSubmit={(event) => event.preventDefault()}>
      {controls.map((control) => {
        if (control.requiresFaceBoundary && !faceBoundaryEnabled) {
          return null;
        }
        const type = control.type || 'range';
        const value = config[control.label];
        const label = control.displayLabel || control.label;

        if (type === 'select') {
          return (
            <label key={control.label} className="control-group">
              <span className="control-label">{label}</span>
              <select
                className="select-input"
                value={value ?? control.value ?? ''}
                onChange={(event) => onChange(control, event.target.value)}
              >
                {control.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (type === 'checkbox') {
          const isDepthMap = control.label === 'Depth Map';
          const isFaceBoundary = control.label === 'Face Boundary';
          const isFaceBoundaryChecked = Boolean(value ?? control.checked);
          return (
            <React.Fragment key={control.label}>
              <div className="checkbox-row">
                <label className="checkbox-field">
                  <input
                    className="checkbox-input"
                    type="checkbox"
                    checked={isFaceBoundaryChecked}
                    onChange={(event) => onChange(control, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
                {isFaceBoundary && isFaceBoundaryChecked && typeof onFaceBoundaryCrop === 'function' ? (
                  <button className="ghost-button algo-action-button" type="button" onClick={onFaceBoundaryCrop}>
                    Crop to face boundary
                  </button>
                ) : null}
              </div>
              {isDepthMap && !depthEnabled && !depthModelLoaded && (
                <div className="depth-hint">Requires ~40 MB model download on first use</div>
              )}
              {isDepthMap && depthEnabled && <DepthStatusIndicator />}
            </React.Fragment>
          );
        }

        const numericValue = Number.isFinite(Number(value)) ? value : control.value ?? 0;
        const deferRestart = Boolean(control.deferRestart);
        return (
          <label key={control.label} className="control-group">
            <div className="control-header">
              <span className="control-label">{label}</span>
              <span className="control-value">{numericValue}</span>
            </div>
            <div className="range-row">
              <input
                className="range-input"
                type="range"
                min={control.min}
                max={control.max}
                step={control.step || 1}
                value={numericValue}
                onChange={(event) =>
                  onChange(control, event.target.value, deferRestart ? { defer: true } : undefined)
                }
                onPointerUp={
                  deferRestart ? (event) => onChange(control, event.target.value) : undefined
                }
                onTouchEnd={
                  deferRestart ? (event) => onChange(control, event.target.value) : undefined
                }
              />
              <input
                className="number-input small"
                type="number"
                min={control.min}
                max={control.max}
                step={control.step || 1}
                value={numericValue}
                onChange={(event) =>
                  onChange(control, event.target.value, deferRestart ? { defer: true } : undefined)
                }
                onBlur={deferRestart ? (event) => onChange(control, event.target.value) : undefined}
              />
            </div>
          </label>
        );
      })}
    </form>
  );
}
