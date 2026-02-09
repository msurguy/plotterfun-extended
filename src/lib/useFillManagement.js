import { useState, useCallback } from 'react';
import useStore from '../store';
import {
  Polygon,
  degreesToRadians,
  createShapeGenerator,
  patternFill,
  pathFromShape,
  hatch,
} from '../lib/hatch.js';

const useFillManagement = () => {
  const {
    clearHatchFills,
    addHatchFill,
    removeHatchFill,
    hatchFills,
  } = useStore();

  const defaultFillSettings = {
    alternate: false,
    angle: 0,
    spacing: 10,
    color: '#0000FF',
    shapeType: 'circle',
    shapeParams: {
      radius: 4,
      sides: 6,
      length: 4,
      amplitude: 2,
      frequency: 1,
      segments: 5,
      numPoints: 5,
      outerRadius: 5,
      innerRadius: 2.5,
      size: 5,
      thickness: 2,
      headSize: 3,
      turns: 2,
      bumps: 5,
      angle: 0,
      dashLength: 2,
      gapLength: 1,
      width: 8,
      height: 4,
      teeth: 8,
    },
  };

  const [fillSettings, setFillSettings] = useState(defaultFillSettings);
  const [selectedFills, setSelectedFills] = useState(new Set());

  const generateThumbnail = useCallback((svgContent, boundingBox) => {
    return new Promise((resolve) => {
      const thumbnailCanvas = document.createElement('canvas');
      thumbnailCanvas.width = 128;
      thumbnailCanvas.height = 128;
      const thumbnailCtx = thumbnailCanvas.getContext('2d');

      const svgThumbnail = `
        <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="${boundingBox.minX} ${boundingBox.minY} ${boundingBox.width} ${boundingBox.height}">
          ${svgContent}
        </svg>
      `;

      const img = new Image();
      const svgBlob = new Blob([svgThumbnail], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        thumbnailCtx.drawImage(img, 0, 0, 128, 128);
        URL.revokeObjectURL(url);
        resolve(thumbnailCanvas.toDataURL('image/png'));
      };
      img.src = url;
    });
  }, []);

  const generateHatchFill = useCallback(
    async (potracePaths, settings) => {
      const { angle, spacing, color, shapeType, shapeParams, alternate } = settings;
      const polys = potracePaths.map((path) => Polygon.fromPath(path));

      // Use alternate line method for line shapes
      if (shapeType === 'line') {
        const hatchedPolygons = hatch(
          polys,
          degreesToRadians(angle),
          spacing,
          alternate
        );

        const hatchedLinesSVG = hatchedPolygons.hatches
          .map(({ a, b }) => {
            return `<line stroke="${color}" x1="${a.x.toFixed(
              2
            )}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(
              2
            )}" y2="${b.y.toFixed(2)}" />`;
          })
          .join('\n');

        const thumbnailDataURL = await generateThumbnail(
          hatchedLinesSVG,
          hatchedPolygons.originalBB
        );

        return {
          angle,
          spacing,
          color,
          alternate,
          shapeType: 'line',
          shapeParams: shapeParams,
          patternSVG: hatchedLinesSVG,
          potracePaths,
          thumbnailDataURL,
        };
      } else {
        // Use shape generator method for other shapes
        const shapeGenerator = createShapeGenerator(shapeType, shapeParams);

        const patternFillResult = patternFill(polys, shapeGenerator, {
          spacing,
          angle: degreesToRadians(angle),
        });

        const paths = patternFillResult.clippedShapes.map((shape) =>
          pathFromShape(shape)
        );

        const patternSVG = paths
          .map((d) => `<path stroke="${color}" fill="none" d="${d}" />`)
          .join('\n');

        const thumbnailDataURL = await generateThumbnail(
          patternSVG,
          patternFillResult.originalBB
        );

        return {
          angle,
          spacing,
          color,
          alternate: false, // Default for non-line shapes
          shapeType,
          shapeParams,
          patternSVG,
          potracePaths,
          thumbnailDataURL,
        };
      }
    },
    [generateThumbnail]
  );

  const handleFillToggle = useCallback(
    (index) => {
      setSelectedFills(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(index)) {
          newSelection.delete(index);
        } else {
          newSelection.add(index);
          // If this is the first/only selection, populate settings
          if (newSelection.size === 1) {
            const selectedFillData = hatchFills[index];
            const mappedSettings = {
              angle: selectedFillData.angle || 0,
              spacing: selectedFillData.spacing || 10,
              color: selectedFillData.color || '#0000FF',
              alternate: selectedFillData.alternate || false,
              shapeType: selectedFillData.shapeType || 'line',
              shapeParams: selectedFillData.shapeParams || defaultFillSettings.shapeParams,
            };
            setFillSettings(mappedSettings);
          }
        }
        return newSelection;
      });
    },
    [hatchFills, defaultFillSettings.shapeParams]
  );

  const handleDeselectAll = useCallback(() => {
    setSelectedFills(new Set());
    setFillSettings(defaultFillSettings);
  }, [defaultFillSettings]);

  const handleRemoveSelected = useCallback(() => {
    if (selectedFills.size > 0) {
      // Remove all selected fills
      selectedFills.forEach(index => {
        removeHatchFill(hatchFills[index].id);
      });
      setSelectedFills(new Set());
      setFillSettings(defaultFillSettings);
    }
  }, [selectedFills, hatchFills, removeHatchFill, defaultFillSettings]);

  const handleUpdateSelected = useCallback(async () => {
    if (selectedFills.size > 0) {
      const updatedFills = [...hatchFills];

      // Update all selected fills with current settings
      for (const index of selectedFills) {
        const selectedFillData = hatchFills[index];
        const updatedFill = await generateHatchFill(
          selectedFillData.potracePaths,
          fillSettings
        );
        updatedFills[index] = {
          ...updatedFills[index],
          ...updatedFill,
        };
      }

      useStore.setState({ hatchFills: updatedFills });
    }
  }, [selectedFills, hatchFills, fillSettings, generateHatchFill]);

  const createNewFill = useCallback(async (potracePaths) => {
    if (potracePaths.length > 0) {
      const hatchFill = await generateHatchFill(potracePaths, fillSettings);
      addHatchFill(hatchFill);
    }
  }, [fillSettings, generateHatchFill, addHatchFill]);

  return {
    fillSettings,
    setFillSettings,
    selectedFills,
    hatchFills,
    defaultFillSettings,
    handleFillToggle,
    handleDeselectAll,
    handleRemoveSelected,
    handleUpdateSelected,
    createNewFill,
    clearHatchFills,
  };
};

export default useFillManagement;