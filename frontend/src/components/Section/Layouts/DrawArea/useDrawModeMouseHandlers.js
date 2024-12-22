import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { useArtifacts, useMisc } from "state/definitions";
import {
  debouncedSetBrushStrokesArtifact,
  drawAllLayers,
  drawStroke,
  getXY,
  startNewStroke,
} from "./utils";

export function useDrawModeMouseHandlers({
  sectionId,
  isEraser,
  strokesRef,
  prevPointRef,
  isDrawing,
  setIsDrawing,
  isDragging,
  draggedIndex,
  lastPos,
  selectedIndex,
  resizeHandle,
  resizeHandleCorners,
  transferEverythingToRealCanvas,
  drawThrottleDelay,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  canvasTransferQueueLength,
  currBrushStrokeArtifactId,
  layers,
  activeLayerId,
  localArtifactTransformsRef,
  mode,
}) {
  let onMouseDown, onMouseMove, onMouseUp, onMouseEnter;

  if (mode === "draw") {
    onMouseDown = drawingOnMouseDown({
      sectionId,
      isEraser,
      strokesRef,
      prevPointRef,
      setIsDrawing,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      layers,
      activeLayerId,
      currBrushStrokeArtifactId,
    });

    onMouseMove = drawingOnMouseMove({
      isEraser,
      strokesRef,
      prevPointRef,
      isDrawing,
      transferEverythingToRealCanvas,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      canvasTransferQueueLength,
      layers,
      activeLayerId,
      currBrushStrokeArtifactId,
    });

    onMouseUp = drawingOnMouseUp({
      strokesRef,
      isDrawing,
      setIsDrawing,
      transferEverythingToRealCanvas,
      currBrushStrokeArtifactId,
    });

    onMouseEnter = drawingOnMouseEnter({ draftCanvasRef, onMouseDown });
  } else {
    const onMouseDownCore = editingOnMouseDown({
      canvasRef,
      selectedIndex,
      localArtifactTransformsRef,
      resizeHandle,
      resizeHandleCorners,
      lastPos,
      draggedIndex,
      isDragging,
    });

    onMouseDown = (e) => {
      const redrawLayers = onMouseDownCore(e);
      if (redrawLayers) {
        drawAllLayers(
          canvasRef,
          tempCanvasRef,
          layers,
          {},
          { [activeLayerId]: localArtifactTransformsRef.current },
          { [activeLayerId]: resizeHandleCorners.current },
        );
      }
    };

    const onMouseMoveCore = editingOnMouseMove({
      canvasRef,
      isDragging,
      lastPos,
      resizeHandle,
      resizeHandleCorners,
      selectedIndex,
      draggedIndex,
      localArtifactTransformsRef,
    });

    onMouseMove = (e) => {
      const redrawLayers = onMouseMoveCore(e);
      if (redrawLayers) {
        drawAllLayers(
          canvasRef,
          tempCanvasRef,
          layers,
          {},
          { [activeLayerId]: localArtifactTransformsRef.current },
          { [activeLayerId]: resizeHandleCorners.current },
        );
      }
    };

    onMouseUp = editingOnMouseUp({
      isDragging,
      draggedIndex,
      resizeHandle,
    });

    onMouseEnter = () => {};
  }

  // useCallback so that throttle function doesn't get recreated and reset timer
  const throttledOnMouseMove = useCallback(
    mode === "draw" && drawThrottleDelay > 0
      ? _.throttle(onMouseMove, drawThrottleDelay)
      : onMouseMove,
    [onMouseMove, drawThrottleDelay],
  );

  return {
    onMouseDown,
    onMouseMove: throttledOnMouseMove,
    onMouseUp,
    onMouseEnter,
  };
}

function drawingOnMouseDown({
  sectionId,
  isEraser,
  strokesRef,
  prevPointRef,
  setIsDrawing,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  layers,
  activeLayerId,
  currBrushStrokeArtifactId,
}) {
  return (e, offsetX, offsetY) => {
    if (useMisc.getState().mouseDownDraggingSection) {
      return;
    }

    if (!useMisc.getState().mouseDownDrawArea) {
      // We want to do this just on the first mouse down.
      setActiveSectionIdAndUpdateZIndex(sectionId);
    }
    useMisc.setState({ mouseDownDrawArea: true });

    // nothing to erase
    if (isEraser && strokesRef.current.length === 0) {
      return;
    }
    setIsDrawing(true);
    let point;
    if (offsetX && offsetY) {
      point = [offsetX, offsetY];
    } else {
      point = getXY(e);
    }
    startNewStroke(draftCanvasRef, strokesRef, point, isEraser);
    if (isEraser) {
      drawAllLayers(canvasRef, tempCanvasRef, layers, {
        [activeLayerId]: { [currBrushStrokeArtifactId]: strokesRef.current },
      });
    }
    prevPointRef.current = point;
  };
}

function drawingOnMouseMove({
  isEraser,
  strokesRef,
  prevPointRef,
  isDrawing,
  transferEverythingToRealCanvas,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  canvasTransferQueueLength,
  layers,
  activeLayerId,
  currBrushStrokeArtifactId,
}) {
  return (e) => {
    if (!isDrawing) {
      return;
    }
    const point = getXY(e);
    const currStroke = strokesRef.current[strokesRef.current.length - 1];
    if (isEraser) {
      currStroke.points.push(point);
      prevPointRef.current = point;
      drawAllLayers(canvasRef, tempCanvasRef, layers, {
        [activeLayerId]: { [currBrushStrokeArtifactId]: strokesRef.current },
      });
    } else if (currStroke.points.length >= canvasTransferQueueLength) {
      transferEverythingToRealCanvas();
      startNewStroke(draftCanvasRef, strokesRef, point);
      prevPointRef.current = point;
    } else {
      drawStroke(draftCanvasRef, prevPointRef.current, point);
      currStroke.points.push(point);
      prevPointRef.current = point;
    }
  };
}

function drawingOnMouseUp({
  strokesRef,
  isDrawing,
  setIsDrawing,
  transferEverythingToRealCanvas,
  currBrushStrokeArtifactId,
}) {
  return () => {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    transferEverythingToRealCanvas();
    debouncedSetBrushStrokesArtifact(
      currBrushStrokeArtifactId,
      strokesRef.current,
    );
    // debouncedSendDrawingToInteractiveTasks(sectionId, toBase64);
  };
}

function drawingOnMouseEnter({ draftCanvasRef, onMouseDown }) {
  return (e) => {
    if (e.buttons === 1) {
      // have to compute offset this way for some reason
      // otherwise it's inaccurate
      const zoom = getZoom();
      const rect = draftCanvasRef.current.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / zoom;
      const offsetY = (e.clientY - rect.top) / zoom;
      onMouseDown(e, offsetX, offsetY);
    }
  };
}

function editingOnMouseDown({
  canvasRef,
  selectedIndex,
  localArtifactTransformsRef,
  resizeHandle,
  resizeHandleCorners,
  lastPos,
  draggedIndex,
  isDragging,
}) {
  // returns true if layers should be redrawn
  return (e) => {
    const artifactState = useArtifacts.getState();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const zoom = getZoom();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (selectedIndex.current !== null) {
      const handleSize = 8;
      for (let i = 0; i < resizeHandleCorners.current.length; i++) {
        const corner = resizeHandleCorners.current[i];
        if (
          Math.abs(x - corner.x) <= handleSize / 2 &&
          Math.abs(y - corner.y) <= handleSize / 2
        ) {
          resizeHandle.current = i;
          lastPos.current = { x, y };
          return true;
        }
      }
    }

    for (let i = localArtifactTransformsRef.current.length - 1; i >= 0; i--) {
      const element = localArtifactTransformsRef.current[i];
      const artifact = artifactState[element.artifactId];
      if (
        artifact.type === "img" &&
        x >= element.x &&
        x <= element.x + element.w &&
        y >= element.y &&
        y <= element.y + element.h
      ) {
        resizeHandleCorners.current = [
          { x: element.x, y: element.y }, // Top-left
          { x: element.x + element.w, y: element.y }, // Top-right
          { x: element.x, y: element.y + element.h }, // Bottom-left
          { x: element.x + element.w, y: element.y + element.h }, // Bottom-right
        ];
        isDragging.current = true;
        draggedIndex.current = i;
        selectedIndex.current = i;
        lastPos.current = { x, y };
        return true;
      } else if (artifact.type === "brushStrokes") {
        const hitRadius = 5;
        for (const stroke of artifact.value) {
          for (const point of stroke) {
            if (
              Math.abs(x - point[0]) <= hitRadius &&
              Math.abs(y - point[1]) <= hitRadius
            ) {
              const bounds = getBrushStrokeBounds(stroke);
              resizeHandleCorners.current = [
                { x: bounds.minX, y: bounds.minY }, // Top-left
                { x: bounds.maxX, y: bounds.minY }, // Top-right
                { x: bounds.minX, y: bounds.maxY }, // Bottom-left
                { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
              ];
              isDragging.current = true;
              draggedIndex.current = i;
              selectedIndex.current = i;
              lastPos.current = { x, y };
              return true;
            }
          }
        }
      }
    }
    selectedIndex.current = null;
    resizeHandleCorners.current = null;
    return false;
  };
}

function editingOnMouseMove({
  canvasRef,
  isDragging,
  lastPos,
  resizeHandle,
  resizeHandleCorners,
  selectedIndex,
  draggedIndex,
  localArtifactTransformsRef,
}) {
  // returns true if layers should be redrawn
  return (e) => {
    if (!isDragging.current && resizeHandle.current === null) return false;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const zoom = getZoom();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const dx = x - lastPos.current.x;
    const dy = y - lastPos.current.y;

    if (isDragging.current && draggedIndex.current !== null) {
      const element = localArtifactTransformsRef.current[draggedIndex.current];
      localArtifactTransformsRef.current[draggedIndex.current] = {
        ...element,
        x: element.x + dx,
        y: element.y + dy,
      };
      lastPos.current = { x, y };
      resizeHandleCorners.current = resizeHandleCorners.current.map((c) => ({
        x: c.x + dx,
        y: c.y + dy,
      }));
    } else if (
      resizeHandle.current !== null &&
      selectedIndex.current !== null
    ) {
      const element = localArtifactTransformsRef.current[selectedIndex.current];
      let newElement = { ...element };
      switch (resizeHandle.current) {
        case 0: // Top-left
          newElement.w -= dx;
          newElement.h -= dy;
          newElement.x += dx;
          newElement.y += dy;
          // Top-left handle
          resizeHandleCorners.current[0].x += dx;
          resizeHandleCorners.current[0].y += dy;
          // Top-right handle
          resizeHandleCorners.current[1].y += dy;
          // Bottom-left handle
          resizeHandleCorners.current[2].x += dx;
          break;
        case 1: // Top-right
          newElement.w += dx;
          newElement.h -= dy;
          newElement.y += dy;
          // Top-left handle
          resizeHandleCorners.current[0].y += dy;
          // Top-right handle
          resizeHandleCorners.current[1].x += dx;
          resizeHandleCorners.current[1].y += dy;
          // Bottom-right handle
          resizeHandleCorners.current[3].x += dx;
          break;
        case 2: // Bottom-left
          newElement.w -= dx;
          newElement.h += dy;
          newElement.x += dx;
          // Top-left handle
          resizeHandleCorners.current[0].x += dx;
          // Bottom-left handle
          resizeHandleCorners.current[2].x += dx;
          resizeHandleCorners.current[2].y += dy;
          // Bottom-right handle
          resizeHandleCorners.current[3].y += dy;
          break;
        case 3: // Bottom-right
          newElement.w += dx;
          newElement.h += dy;
          // Top-right handle
          resizeHandleCorners.current[1].x += dx;
          // Bottom-left handle
          resizeHandleCorners.current[2].y += dy;
          // Bottom-right handle
          resizeHandleCorners.current[3].x += dx;
          resizeHandleCorners.current[3].y += dy;
          break;
      }

      if (newElement.w < 20) {
        newElement.w = 20;
        newElement.x = element.x;
      }
      if (newElement.h < 20) {
        newElement.h = 20;
        newElement.y = element.y;
      }

      localArtifactTransformsRef.current[selectedIndex.current] = newElement;

      lastPos.current = { x, y };
    }

    return true;
  };
}

function editingOnMouseUp({ isDragging, draggedIndex, resizeHandle }) {
  return () => {
    isDragging.current = false;
    draggedIndex.current = null;
    resizeHandle.current = null;
  };
}

const getBrushStrokeBounds = (strokes) => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const stroke of strokes) {
    for (const point of stroke.points) {
      if (point[0] < minX) minX = point[0];
      if (point[1] < minY) minY = point[1];
      if (point[0] > maxX) maxX = point[0];
      if (point[1] > maxY) maxY = point[1];
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
  };
};

const resizeBrushStroke = (path, bounds, dx, dy, handle) => {
  const oldWidth = bounds.maxX - bounds.minX;
  const oldHeight = bounds.maxY - bounds.minY;

  let scaleX = 1;
  let scaleY = 1;
  let translateX = 0;
  let translateY = 0;

  switch (handle) {
    case 0: // Top-left
      scaleX = (oldWidth - dx) / oldWidth;
      scaleY = (oldHeight - dy) / oldHeight;
      translateX = bounds.minX + dx;
      translateY = bounds.minY + dy;
      break;
    case 1: // Top-right
      scaleX = (oldWidth + dx) / oldWidth;
      scaleY = (oldHeight - dy) / oldHeight;
      translateX = bounds.minX;
      translateY = bounds.minY + dy;
      break;
    case 2: // Bottom-left
      scaleX = (oldWidth - dx) / oldWidth;
      scaleY = (oldHeight + dy) / oldHeight;
      translateX = bounds.minX + dx;
      translateY = bounds.minY;
      break;
    case 3: // Bottom-right
      scaleX = (oldWidth + dx) / oldWidth;
      scaleY = (oldHeight + dy) / oldHeight;
      translateX = bounds.minX;
      translateY = bounds.minY;
      break;
  }

  if (scaleX * oldWidth < 20) {
    scaleX = 20 / oldWidth;
    // Reset translation in x direction if we hit minimum width
    if (handle === 0 || handle === 2) {
      translateX = bounds.minX + (bounds.maxX - bounds.minX) * (1 - scaleX);
    }
  }

  if (scaleY * oldHeight < 20) {
    scaleY = 20 / oldHeight;
    // Reset translation in y direction if we hit minimum height
    if (handle === 0 || handle === 1) {
      translateY = bounds.minY + (bounds.maxY - bounds.minY) * (1 - scaleY);
    }
  }

  return path.points.map((point) => ({
    x: translateX + (point.x - bounds.minX) * scaleX,
    y: translateY + (point.y - bounds.minY) * scaleY,
  }));
};
