import React, { useEffect, useState } from 'react';
import { Info, Monitor, Moon, Sun, X } from 'lucide-react';
import { usePlotterStore } from './store.js';
import { usePlotterController } from './usePlotterController.js';
import OutputSizeControls from './components/OutputSizeControls.jsx';
import CustomPaletteList from './components/CustomPaletteList.jsx';
import AlgoControls from './components/AlgoControls.jsx';
import { applyTheme, watchSystemTheme, THEME_STORAGE_KEY } from './theme.js';

const ALGORITHMS = [
  { value: 'squiggle.js', label: 'Squiggle' },
  { value: 'squiggleLeftRight.js', label: 'Squiggle Left/Right' },
  { value: 'spiral.js', label: 'Spiral' },
  { value: 'polyspiral.js', label: 'Polygon Spiral' },
  { value: 'sawtooth.js', label: 'Sawtooth' },
  { value: 'stipple.js', label: 'Stipples' },
  { value: 'stippledepth.js', label: 'Stipples (Depth)' },
  { value: 'delaunay.js', label: 'Delaunay' },
  { value: 'linedraw.js', label: 'Linedraw' },
  { value: 'mosaic.js', label: 'Mosaic' },
  { value: 'subline.js', label: 'Subline' },
  { value: 'springs.js', label: 'Springs' },
  { value: 'waves.js', label: 'Waves' },
  { value: 'needles.js', label: 'Needles' },
  { value: 'implode.js', label: 'Implode' },
  { value: 'halftone.js', label: 'Halftone', title: 'Algorithm by HomineLudens' },
  { value: 'boxes.js', label: 'Boxes', title: 'Algorithm by MarkJB' },
  { value: 'dots.js', label: 'Dots', title: 'Algorithm by Tim Koop' },
  { value: 'jaggy.js', label: 'Jaggy', title: 'Algorithm by Tim Koop' },
  { value: 'longwave.js', label: 'Longwave' },
  { value: 'linescan.js', label: 'Linescan', title: 'Algorithm by J-Waal' },
  { value: 'woven.js', label: 'Woven', title: 'Algorithm by J-Waal' },
  { value: 'peano.js', label: 'Peano', title: 'Algorithm by J-Waal' },
  { value: 'margins.js', label: 'Margins', title: 'Algorithm by labusaid' },
  { value: 'crosshatch.js', label: 'Crosshatch' },
  { value: 'hatchweave.js', label: 'Hatch Weave' },
  { value: 'hatchmoire.js', label: 'Hatch Moire' },
  { value: 'hatchburst.js', label: 'Hatch Burst' },
  { value: 'hatchlattice.js', label: 'Hatch Lattice' },
  { value: 'flowfield.js', label: 'Flow Field' },
  { value: 'concentric.js', label: 'Concentric' },
  { value: 'hexgrid.js', label: 'Hex Grid' },
  { value: 'starburst.js', label: 'Starburst' },
  { value: 'constellation.js', label: 'Constellation' },
  { value: 'contours.js', label: 'Contours' },
  { value: 'warpgrid.js', label: 'Warped Grid' },
  { value: 'circlepack.js', label: 'Circle Pack' },
  { value: 'differentialgrowth.js', label: 'Differential Growth' },
  { value: 'dlagrowth.js', label: 'DLA Growth' },
  { value: 'reactiondiffusion.js', label: 'Reaction Diffusion' },
];

export default function App() {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const {
    activeTab,
    canvasWidth,
    canvasHeight,
    outputSize,
    outputAutoSync,
    outputDpi,
    algorithm,
    buffering,
    msg,
    themeMode,
    colorMode,
    colorMethod,
    plotterfunColorMode,
    includeBlack,
    distancePower,
    inkGamma,
    penWidth,
    penColor,
    customPalette,
    config,
    algoControls,
    webcamMirror,
  } = usePlotterStore((state) => state);

  const {
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
  } = usePlotterController();

  const setThemeMode = usePlotterStore((state) => state.setThemeMode);

  const showPlotterfunColorMode = colorMode === 'plotterfun-color';
  const showCustomPalette =
    colorMode === 'custom' || (colorMode === 'plotterfun-color' && plotterfunColorMode === 'custom');
  const showIncludeBlack =
    colorMode === 'cmyk' || (colorMode === 'plotterfun-color' && plotterfunColorMode === 'cmyk');
  const enableDistancePower = colorMode === 'custom' && colorMethod === 'match';
  const isMono = colorMode === 'mono';

  useEffect(() => {
    applyTheme(themeMode);
    if (themeMode !== 'system') return undefined;
    return watchSystemTheme(() => applyTheme('system'));
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch (err) {
      return;
    }
  }, [themeMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isAboutOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsAboutOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isAboutOpen]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="screw screw-top-left" aria-hidden="true" />
        <span className="screw screw-top-right" aria-hidden="true" />
        <span className="screw screw-bottom-left" aria-hidden="true" />
        <span className="screw screw-bottom-right" aria-hidden="true" />
        <div className="app-title">
          <div className="app-logo" aria-hidden="true">
            <span />
          </div>
          <h1>Plotterfun Extended</h1>
        </div>
        <div className="app-actions">
          <div className="header-controls">
            <label className="header-control">
              <span className="header-control-label">Pen width</span>
              <div className="header-range">
                <input
                  className="range-input range-compact"
                  id="penWidthTop"
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={penWidth}
                  onChange={(event) => handlePenWidthChange(event.target.value)}
                />
                <input
                  className="number-input mini"
                  id="penWidthTopValue"
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={penWidth}
                  onChange={(event) => handlePenWidthChange(event.target.value)}
                />
              </div>
            </label>
            <label className="header-control">
              <span className="header-control-label">Pen color</span>
              <div className="header-color">
                <input
                  className="color-input"
                  id="penColor"
                  type="color"
                  value={penColor}
                  onChange={(event) => handlePenColorChange(event.target.value)}
                  disabled={!isMono}
                  title={isMono ? 'Pen color' : 'Pen color (mono only)'}
                />
                <span className="header-color-value">{penColor.toUpperCase()}</span>
              </div>
            </label>
            <label className="header-control header-control-algorithm">
              <span className="header-control-label">Algorithm</span>
              <div className="header-algorithm">
                <select
                  className="select-input header-select"
                  id="algorithmTop"
                  value={algorithm}
                  onChange={(event) => handleAlgorithmChange(event.target.value)}
                >
                  {ALGORITHMS.map((entry) => (
                    <option key={entry.value} value={entry.value} title={entry.title}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <img
                  id="buffering"
                  className="buffer-indicator"
                  src="loading.gif"
                  alt="Loading"
                  style={{ visibility: buffering ? 'visible' : 'hidden' }}
                />
              </div>
            </label>
          </div>
          <div
            className={`theme-menu${isThemeMenuOpen ? ' is-open' : ''}`}
            onMouseLeave={() => setIsThemeMenuOpen(false)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsThemeMenuOpen(false);
              }
            }}
          >
            <button
              className="icon-button"
              type="button"
              aria-label="Theme"
              title="Theme"
              aria-expanded={isThemeMenuOpen}
              onClick={() => setIsThemeMenuOpen((open) => !open)}
            >
              {themeMode === 'light' ? (
                <Sun size={14} aria-hidden="true" />
              ) : themeMode === 'dark' ? (
                <Moon size={14} aria-hidden="true" />
              ) : (
                <Monitor size={14} aria-hidden="true" />
              )}
            </button>
            <div className="theme-menu-panel" role="menu" aria-label="Theme options">
              <button
                className={`theme-menu-option${themeMode === 'light' ? ' is-active' : ''}`}
                type="button"
                aria-pressed={themeMode === 'light'}
                onClick={() => {
                  setThemeMode('light');
                  setIsThemeMenuOpen(false);
                }}
              >
                <Sun size={14} aria-hidden="true" />
                <span>Light</span>
              </button>
              <button
                className={`theme-menu-option${themeMode === 'dark' ? ' is-active' : ''}`}
                type="button"
                aria-pressed={themeMode === 'dark'}
                onClick={() => {
                  setThemeMode('dark');
                  setIsThemeMenuOpen(false);
                }}
              >
                <Moon size={14} aria-hidden="true" />
                <span>Dark</span>
              </button>
              <button
                className={`theme-menu-option${themeMode === 'system' ? ' is-active' : ''}`}
                type="button"
                aria-pressed={themeMode === 'system'}
                onClick={() => {
                  setThemeMode('system');
                  setIsThemeMenuOpen(false);
                }}
              >
                <Monitor size={14} aria-hidden="true" />
                <span>System</span>
              </button>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="About"
            title="About"
            onClick={() => setIsAboutOpen(true)}
          >
            <Info size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside id="sidebar">
          <div className="sidebar-overlay" aria-hidden="true" />
          <div id="tabbar" className="sidebar-tabs">
            <button
              id="tab1"
              ref={tabImageRef}
              className={activeTab === 'image' ? 'active' : ''}
              onClick={() => handleTabChange('image')}
              type="button"
            >
              Image
            </button>
            <button
              id="tab2"
              ref={tabWebcamRef}
              className={activeTab === 'webcam' ? 'active' : ''}
              onClick={() => handleTabChange('webcam')}
              type="button"
            >
              Webcam
            </button>
          </div>

          <div className="sidebar-scroll">
            <div
              id="imgselect"
              ref={imgSelectRef}
              className="panel panel-source"
              style={{ display: activeTab === 'image' ? 'block' : 'none' }}
            >
              <div className="panel-title">Source</div>
              <form className="panel-form" onSubmit={(event) => event.preventDefault()}>
                <div className="form-row">
                  <label className="mini-field">
                    <span>Width</span>
                    <input
                      className="number-input"
                      id="pcw"
                      type="number"
                      min="10"
                      value={canvasWidth}
                      onInput={(event) => handleCanvasSizeChange(Number(event.target.value), canvasHeight)}
                    />
                  </label>
                  <label className="mini-field">
                    <span>Height</span>
                    <input
                      className="number-input"
                      id="pch"
                      type="number"
                      min="10"
                      value={canvasHeight}
                      onInput={(event) => handleCanvasSizeChange(canvasWidth, Number(event.target.value))}
                    />
                  </label>
                </div>
              </form>
              <OutputSizeControls
                outputSize={outputSize}
                outputAutoSync={outputAutoSync}
                outputDpi={outputDpi}
                onWidthChange={(value) => handleOutputNumberInput('width', value)}
                onHeightChange={(value) => handleOutputNumberInput('height', value)}
                onUnitChange={handleOutputUnitChange}
                onAutoChange={handleOutputAutoToggle}
                onDpiChange={handleOutputDpiChange}
              />
              <div className="preview-card">
                <canvas ref={previewRef} className="preview-canvas"></canvas>
              </div>
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={handleSelectImage}>
                  Select image
                </button>
                <button className="ghost-button" type="button" onClick={handleUseImage}>
                  Use image
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
            </div>

            <div
              id="webcam"
              ref={webcamRef}
              className="panel panel-source"
              style={{ display: activeTab === 'webcam' ? 'block' : 'none' }}
            >
              <div className="panel-title">Webcam</div>
              <OutputSizeControls
                outputSize={outputSize}
                outputAutoSync={outputAutoSync}
                outputDpi={outputDpi}
                onWidthChange={(value) => handleOutputNumberInput('width', value)}
                onHeightChange={(value) => handleOutputNumberInput('height', value)}
                onUnitChange={handleOutputUnitChange}
                onAutoChange={handleOutputAutoToggle}
                onDpiChange={handleOutputDpiChange}
              />
              <div className="preview-card">
                <video
                  ref={videoRef}
                  autoPlay
                  className={`preview-video${webcamMirror ? ' is-mirrored' : ''}`}
                ></video>
              </div>
              <label className="checkbox-field">
                <input
                  className="checkbox-input"
                  id="webcamMirror"
                  type="checkbox"
                  checked={webcamMirror}
                  onChange={(event) => handleWebcamMirrorChange(event.target.checked)}
                />
                <span>Mirror (selfie)</span>
              </label>
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={handleToggleVideoPause}>
                  Pause
                </button>
                <button className="ghost-button" type="button" onClick={handleSnapshot}>
                  Use image
                </button>
              </div>
            </div>

            <section className="panel">
              <div className="panel-title">Color</div>
              <form id="colorControls" className="panel-form" onSubmit={(event) => event.preventDefault()}>
                <label className="control-group">
                  <span className="control-label">Output</span>
                  <select
                    className="select-input"
                    id="colorMode"
                    value={colorMode}
                    onChange={(event) => handleColorModeChange(event.target.value)}
                  >
                    <option value="mono">Monochrome</option>
                    <option value="cmyk">CMYK</option>
                    <option value="rgb">RGB</option>
                    <option value="custom">Custom</option>
                    <option value="plotterfun-color">Plotterfun-color</option>
                  </select>
                </label>
                <label className="control-group">
                  <span className="control-label">Method</span>
                  <select
                    className="select-input"
                    id="colorMethod"
                    value={colorMethod}
                    onChange={(event) => handleColorMethodChange(event.target.value)}
                  >
                    <option value="classic">Classic split</option>
                    <option value="match">Colour match</option>
                  </select>
                </label>
                <label
                  id="plotterfunColorModeRow"
                  className="control-group"
                  style={{ display: showPlotterfunColorMode ? 'block' : 'none' }}
                >
                  <span className="control-label">Plotterfun-color mode</span>
                  <select
                    className="select-input"
                    id="plotterfunColorMode"
                    value={plotterfunColorMode}
                    onChange={(event) => handlePlotterfunColorModeChange(event.target.value)}
                  >
                    <option value="cmyk">CMYK</option>
                    <option value="rgb">RGB</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {showIncludeBlack ? (
                  <label className="checkbox-field">
                    <input
                      className="checkbox-input"
                      type="checkbox"
                      id="includeBlack"
                      checked={includeBlack}
                      onChange={(event) => handleIncludeBlackChange(event.target.checked)}
                    />
                    <span>Include K (black)</span>
                  </label>
                ) : null}
                <div id="colorTuning" className="panel-subsection">
                  <div className="panel-subtitle">Tuning</div>
                  <label className="control-group">
                    <div className="control-header">
                      <span className="control-label">Distance power</span>
                      <span className="control-value">{distancePower}</span>
                    </div>
                    <div className="range-row">
                      <input
                        className="range-input"
                        id="distancePower"
                        type="range"
                        min="0.5"
                        max="6"
                        step="0.1"
                        value={distancePower}
                        onChange={(event) => handleDistancePowerChange(event.target.value)}
                        disabled={!enableDistancePower}
                      />
                      <input
                        className="number-input small"
                        id="distancePowerValue"
                        type="number"
                        min="0.5"
                        max="6"
                        step="0.1"
                        value={distancePower}
                        onChange={(event) => handleDistancePowerChange(event.target.value)}
                        disabled={!enableDistancePower}
                      />
                    </div>
                  </label>
                  <label className="control-group">
                    <div className="control-header">
                      <span className="control-label">Ink gamma</span>
                      <span className="control-value">{inkGamma}</span>
                    </div>
                    <div className="range-row">
                      <input
                        className="range-input"
                        id="inkGamma"
                        type="range"
                        min="0.2"
                        max="3"
                        step="0.1"
                        value={inkGamma}
                        onChange={(event) => handleInkGammaChange(event.target.value)}
                      />
                      <input
                        className="number-input small"
                        id="inkGammaValue"
                        type="number"
                        min="0.2"
                        max="3"
                        step="0.1"
                        value={inkGamma}
                        onChange={(event) => handleInkGammaChange(event.target.value)}
                      />
                    </div>
                  </label>
                </div>
                {showCustomPalette ? (
                  <div id="customPaletteControls" className="panel-subsection">
                    <div className="panel-subtitle">Custom palette</div>
                    <CustomPaletteList
                      palette={customPalette}
                      onColorChange={handleCustomPaletteColorChange}
                      onRemove={handleCustomPaletteRemove}
                    />
                    <div className="button-row">
                      <button className="ghost-button" type="button" id="paletteAdd" onClick={handleCustomPaletteAdd}>
                        Add color
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        id="paletteReset"
                        onClick={handleCustomPaletteReset}
                      >
                        Reset to CMYK
                      </button>
                    </div>
                  </div>
                ) : null}
              </form>
            </section>

            <section className="panel">
              <div className="panel-title">Parameters</div>
              <AlgoControls
                controls={algoControls}
                config={config}
                onChange={handleAlgoControlChange}
                onFaceBoundaryCrop={handleApplyFaceBoundaryCrop}
              />
            </section>

          </div>

          <div className="sidebar-footer">
            <button className="primary-button" type="button" onClick={handleDownload}>
              Download SVG
            </button>
            <div className="sidebar-links">
              <div className="link-row">
                <a href="https://mitxela.com/projects/plotting">original by mitxela</a>
                <span className="dot" />
                <a href="https://github.com/msurguy/plotterfun-extended">source code</a>
              </div>
            </div>
          </div>
        </aside>

        <main className="canvas-stage">
          <div className="canvas-shell">
            <svg ref={svgRef} className="plot-output"></svg>
          </div>
          <div id="msgbox" className="status-pill">
            {msg}
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <div className="footer-left">
          <span className="status-dot" />
          <span className="footer-label">Engine: Ready</span>
        </div>
        <div className="footer-right">
          <span className="footer-label">Plotterfun UI</span>
        </div>
      </footer>
      {isAboutOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsAboutOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Plotterfun</p>
                <h2 id="about-title">About this tool</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setIsAboutOpen(false)}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Plotterfun turns images into layered SVG line drawings tuned for pen plotters. Pick an algorithm, tune
                the parameters, and export vector paths that translate well to real pens and paper.
              </p>
              <p>
                The app runs entirely in the browser and never uploads your files. The source algorithms are based on
                the original Plotterfun experiments by mitxela, with additional modes and UI refinements.
              </p>
              <div className="modal-grid">
                <div>
                  <p className="modal-label">Best for</p>
                  <p className="modal-value">Line art, stippling, hatching, contour plots</p>
                </div>
                <div>
                  <p className="modal-label">Exports</p>
                  <p className="modal-value">SVG sized to your output settings</p>
                </div>
                <div>
                  <p className="modal-label">Tip</p>
                  <p className="modal-value">Keep your source image high-contrast for cleaner plots</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="ghost-button" type="button" onClick={() => setIsAboutOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
