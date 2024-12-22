import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { useMisc } from "state/definitions";
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
  setIsDragging,
  draggedIndex,
  setDraggedIndex,
  lastPos,
  setLastPos,
  selectedIndex,
  setSelectedIndex,
  resizeHandle,
  setResizeHandle,
  transferEverythingToRealCanvas,
  drawThrottleDelay,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  canvasTransferQueueLength,
  currBrushStrokeArtifactId,
  layers,
  activeLayerId,
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
    onMouseDown = editingOnMouseDown({
      canvasRef,
      selectedIndex,
      elements,
      setSelectedIndex,
      setResizeHandle,
      setLastPos,
      setDraggedIndex,
      setIsDragging,
    });

    onMouseMove = editingOnMouseMove({
      canvasRef,
      isDragging,
      lastPos,
      resizeHandle,
      draggedIndex,
      elements,
      setElements,
      setLastPos,
    });

    onMouseUp = editingOnMouseUp({
      setIsDragging,
      setDraggedIndex,
      setResizeHandle,
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
        [activeLayerId]: strokesRef.current,
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
        [activeLayerId]: strokesRef.current,
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
  elements,
  setSelectedIndex,
  setResizeHandle,
  setLastPos,
  setDraggedIndex,
  setIsDragging,
}) {
  return (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (selectedIndex !== null) {
      const element = elements[selectedIndex];
      const handleSize = 8;
      let corners;

      if (element.type === "img") {
        corners = [
          { x: element.x, y: element.y }, // Top-left
          { x: element.x + element.width, y: element.y }, // Top-right
          { x: element.x, y: element.y + element.height }, // Bottom-left
          { x: element.x + element.width, y: element.y + element.height }, // Bottom-right
        ];
      } else if (element.type === "brushStrokes") {
        const bounds = getBrushStrokeBounds(element.points);
        corners = [
          { x: bounds.minX, y: bounds.minY }, // Top-left
          { x: bounds.maxX, y: bounds.minY }, // Top-right
          { x: bounds.minX, y: bounds.maxY }, // Bottom-left
          { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
        ];
      }

      for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];
        if (
          Math.abs(x - corner.x) <= handleSize / 2 &&
          Math.abs(y - corner.y) <= handleSize / 2
        ) {
          setResizeHandle(i);
          setLastPos({ x, y });
          return;
        }
      }
    }

    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      if (
        element.type === "img" &&
        x >= element.x &&
        x <= element.x + element.width &&
        y >= element.y &&
        y <= element.y + element.height
      ) {
        setIsDragging(true);
        setDraggedIndex(i);
        setSelectedIndex(i);
        setLastPos({ x, y });
        return;
      } else if (element.type === "brushStrokes") {
        const hitRadius = 5;
        for (const point of element.points) {
          if (
            Math.abs(x - point.x) <= hitRadius &&
            Math.abs(y - point.y) <= hitRadius
          ) {
            setIsDragging(true);
            setDraggedIndex(i);
            setSelectedIndex(i);
            setLastPos({ x, y });
            return;
          }
        }
      }
    }
    setSelectedIndex(null);
  };
}

function editingOnMouseMove({
  canvasRef,
  isDragging,
  lastPos,
  resizeHandle,
  draggedIndex,
  elements,
  setElements,
  setLastPos,
}) {
  return (e) => {
    if (!isDragging && resizeHandle === null) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging && draggedIndex !== null) {
      const dx = x - lastPos.x;
      const dy = y - lastPos.y;

      setElements(
        elements.map((element, index) => {
          if (index === draggedIndex) {
            if (element.type === "img") {
              return {
                ...element,
                x: element.x + dx,
                y: element.y + dy,
              };
            } else if (element.type === "brushStrokes") {
              return {
                ...element,
                points: element.points.map((point) => ({
                  x: point.x + dx,
                  y: point.y + dy,
                })),
              };
            }
          }
          return element;
        }),
      );

      setLastPos({ x, y });
    } else if (resizeHandle !== null && selectedIndex !== null) {
      const dx = x - lastPos.x;
      const dy = y - lastPos.y;

      setElements(
        elements.map((element, index) => {
          if (index === selectedIndex) {
            if (element.type === "img") {
              let newElement = { ...element };
              switch (resizeHandle) {
                case 0: // Top-left
                  newElement.width -= dx;
                  newElement.height -= dy;
                  newElement.x += dx;
                  newElement.y += dy;
                  break;
                case 1: // Top-right
                  newElement.width += dx;
                  newElement.height -= dy;
                  newElement.y += dy;
                  break;
                case 2: // Bottom-left
                  newElement.width -= dx;
                  newElement.height += dy;
                  newElement.x += dx;
                  break;
                case 3: // Bottom-right
                  newElement.width += dx;
                  newElement.height += dy;
                  break;
              }

              if (newElement.width < 20) {
                newElement.width = 20;
                newElement.x = element.x;
              }
              if (newElement.height < 20) {
                newElement.height = 20;
                newElement.y = element.y;
              }

              return newElement;
            } else if (element.type === "brushStrokes") {
              const bounds = getPathBounds(element.points);
              const newPoints = resizeBrushStroke(
                element,
                bounds,
                dx,
                dy,
                resizeHandle,
              );
              return {
                ...element,
                points: newPoints,
              };
            }
          }
          return element;
        }),
      );

      setLastPos({ x, y });
    }
  };
}

function editingOnMouseUp({ setIsDragging, setDraggedIndex, setResizeHandle }) {
  return () => {
    setIsDragging(false);
    setDraggedIndex(null);
    setResizeHandle(null);
  };
}

const getBrushStrokeBounds = (points) => {
  const xCoords = points.map((p) => p.x);
  const yCoords = points.map((p) => p.y);
  return {
    minX: Math.min(...xCoords),
    maxX: Math.max(...xCoords),
    minY: Math.min(...yCoords),
    maxY: Math.max(...yCoords),
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
