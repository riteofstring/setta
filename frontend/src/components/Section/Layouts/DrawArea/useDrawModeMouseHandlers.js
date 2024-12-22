import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { useArtifacts, useMisc, useSectionInfos } from "state/definitions";
import {
  drawAllLayers,
  drawStroke,
  filterPathForImage,
  getXY,
  setGlobalArtifactTransformsAndDrawAllLayers,
  setGlobalBrushStrokesAndDrawAllLayers,
  startNewStroke,
} from "./utils";

export function useDrawModeMouseHandlers({
  sectionId,
  isEraser,
  strokesRef,
  eraserStrokesRef,
  prevPointRef,
  isDrawing,
  setIsDrawing,
  isDragging,
  draggedId,
  lastPos,
  selectedId,
  resizeHandle,
  resizeHandleCorners,
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
      eraserStrokesRef,
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
      eraserStrokesRef,
      prevPointRef,
      isDrawing,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      canvasTransferQueueLength,
      layers,
      activeLayerId,
      currBrushStrokeArtifactId,
    });

    onMouseUp = drawingOnMouseUp({
      isEraser,
      eraserStrokesRef,
      isDrawing,
      setIsDrawing,
      activeLayerId,
      currBrushStrokeArtifactId,
      strokesRef,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      layers,
    });

    onMouseEnter = drawingOnMouseEnter({ draftCanvasRef, onMouseDown });
  } else {
    const onMouseDownCore = editingOnMouseDown({
      canvasRef,
      selectedId,
      localArtifactTransformsRef,
      resizeHandle,
      resizeHandleCorners,
      lastPos,
      draggedId,
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
      selectedId,
      draggedId,
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
      draggedId,
      resizeHandle,
      sectionId,
      activeLayerId,
      localArtifactTransformsRef,
      canvasRef,
      tempCanvasRef,
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
  eraserStrokesRef,
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

    setIsDrawing(true);
    let point;
    if (offsetX && offsetY) {
      point = [offsetX, offsetY];
    } else {
      point = getXY(e);
    }
    startNewStroke(
      draftCanvasRef,
      isEraser ? eraserStrokesRef : strokesRef,
      point,
      isEraser,
    );
    if (isEraser) {
      drawAllLayers(
        canvasRef,
        tempCanvasRef,
        layers,
        {},
        {},
        {},
        { [activeLayerId]: eraserStrokesRef.current },
      );
    }
    prevPointRef.current = point;
  };
}

function drawingOnMouseMove({
  isEraser,
  strokesRef,
  eraserStrokesRef,
  prevPointRef,
  isDrawing,
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
    const currStrokesRef = isEraser ? eraserStrokesRef : strokesRef;
    const currStroke =
      currStrokesRef.current[currStrokesRef.current.length - 1];
    if (isEraser) {
      currStroke.points.push(point);
      prevPointRef.current = point;
      drawAllLayers(
        canvasRef,
        tempCanvasRef,
        layers,
        {},
        {},
        {},
        { [activeLayerId]: eraserStrokesRef.current },
      );
    } else if (currStroke.points.length >= canvasTransferQueueLength) {
      setGlobalBrushStrokesAndDrawAllLayers(
        currBrushStrokeArtifactId,
        strokesRef,
        canvasRef,
        tempCanvasRef,
        draftCanvasRef,
        layers,
      );
      startNewStroke(draftCanvasRef, currStrokesRef, point);
      prevPointRef.current = point;
    } else {
      drawStroke(draftCanvasRef, prevPointRef.current, point);
      currStroke.points.push(point);
      prevPointRef.current = point;
    }
  };
}

function drawingOnMouseUp({
  isEraser,
  eraserStrokesRef,
  isDrawing,
  setIsDrawing,
  activeLayerId,
  currBrushStrokeArtifactId,
  strokesRef,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  layers,
}) {
  return () => {
    if (!isDrawing) {
      return;
    }
    if (isEraser) {
      const artifactState = useArtifacts.getState();
      const eraserPath = _.cloneDeep(
        eraserStrokesRef.current[eraserStrokesRef.current.length - 1],
      );
      // console.log("eraserPath", eraserPath);
      useSectionInfos.setState((state) => {
        const layer = state.artifactGroups[activeLayerId];
        for (const t of layer.artifactTransforms) {
          const artifact = artifactState[t.artifactId];
          console.log("t.transform", _.cloneDeep(t.transform));
          eraserPath.points = filterPathForImage(
            eraserPath.points,
            t.transform[4],
            t.transform[5],
            720,
            720,
            // getScaledWidth(artifact, t.transform),
            // getScaledHeight(artifact, t.transform),
          );

          // console.log("intersecting eraserPath.points", eraserPath.points)
          if (eraserPath.points.length > 0) {
            t.eraserStrokes.push(eraserPath);
          }
        }
      });

      eraserStrokesRef.current = [];
    }
    setIsDrawing(false);
    setGlobalBrushStrokesAndDrawAllLayers(
      currBrushStrokeArtifactId,
      strokesRef,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      layers,
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
  selectedId,
  localArtifactTransformsRef,
  resizeHandle,
  resizeHandleCorners,
  lastPos,
  draggedId,
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

    if (selectedId.current !== null) {
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

    for (const [artifactId, { transform }] of Object.entries(
      localArtifactTransformsRef.current,
    )) {
      const artifact = artifactState[artifactId];
      const xPlusWidth = transform[4] + getScaledWidth(artifact, transform);
      const yPlusHeight = transform[5] + getScaledHeight(artifact, transform);
      if (
        artifact.type === "img" &&
        x >= transform[4] &&
        x <= xPlusWidth &&
        y >= transform[5] &&
        y <= yPlusHeight
      ) {
        resizeHandleCorners.current = [
          { x: transform[4], y: transform[5] }, // Top-left
          { x: xPlusWidth, y: transform[5] }, // Top-right
          { x: transform[4], y: yPlusHeight }, // Bottom-left
          { x: xPlusWidth, y: yPlusHeight }, // Bottom-right
        ];
        isDragging.current = true;
        draggedId.current = artifactId;
        selectedId.current = artifactId;
        lastPos.current = { x, y };
        return true;
      } else if (artifact.type === "brushStrokes") {
        // const hitRadius = 5;
        // for (const stroke of artifact.value) {
        //   for (const point of stroke) {
        //     if (
        //       Math.abs(x - point[0]) <= hitRadius &&
        //       Math.abs(y - point[1]) <= hitRadius
        //     ) {
        //       const bounds = getBrushStrokeBounds(stroke);
        //       resizeHandleCorners.current = [
        //         { x: bounds.minX, y: bounds.minY }, // Top-left
        //         { x: bounds.maxX, y: bounds.minY }, // Top-right
        //         { x: bounds.minX, y: bounds.maxY }, // Bottom-left
        //         { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
        //       ];
        //       isDragging.current = true;
        //       draggedId.current = artifactId;
        //       selectedId.current = artifactId;
        //       lastPos.current = { x, y };
        //       return true;
        //     }
        //   }
        // }
      }
    }
    selectedId.current = null;
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
  selectedId,
  draggedId,
  localArtifactTransformsRef,
}) {
  // returns true if layers should be redrawn
  return (e) => {
    if (!isDragging.current && resizeHandle.current === null) return false;

    const artifactState = useArtifacts.getState();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const zoom = getZoom();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const dx = x - lastPos.current.x;
    const dy = y - lastPos.current.y;

    if (isDragging.current && draggedId.current !== null) {
      const { transform } =
        localArtifactTransformsRef.current[draggedId.current];
      transform[4] += dx;
      transform[5] += dy;
      lastPos.current = { x, y };
      resizeHandleCorners.current = resizeHandleCorners.current.map((c) => ({
        x: c.x + dx,
        y: c.y + dy,
      }));
    } else if (resizeHandle.current !== null && selectedId.current !== null) {
      const { transform } =
        localArtifactTransformsRef.current[selectedId.current];
      const artifact = artifactState[selectedId.current];
      const scaledWidth = getScaledWidth(artifact, transform);
      const scaledHeight = getScaledHeight(artifact, transform);
      switch (resizeHandle.current) {
        case 0: // Top-left
          transform[0] = (scaledWidth - dx) / artifact.value.width;
          transform[3] = (scaledHeight - dy) / artifact.value.height;
          transform[4] += dx;
          transform[5] += dy;
          // Top-left handle
          resizeHandleCorners.current[0].x += dx;
          resizeHandleCorners.current[0].y += dy;
          // Top-right handle
          resizeHandleCorners.current[1].y += dy;
          // Bottom-left handle
          resizeHandleCorners.current[2].x += dx;
          break;
        case 1: // Top-right
          transform[0] = (scaledWidth + dx) / artifact.value.width;
          transform[3] = (scaledHeight - dy) / artifact.value.height;
          transform[5] += dy;
          // Top-left handle
          resizeHandleCorners.current[0].y += dy;
          // Top-right handle
          resizeHandleCorners.current[1].x += dx;
          resizeHandleCorners.current[1].y += dy;
          // Bottom-right handle
          resizeHandleCorners.current[3].x += dx;
          break;
        case 2: // Bottom-left
          transform[0] = (scaledWidth - dx) / artifact.value.width;
          transform[3] = (scaledHeight + dy) / artifact.value.height;
          transform[4] += dx;
          // Top-left handle
          resizeHandleCorners.current[0].x += dx;
          // Bottom-left handle
          resizeHandleCorners.current[2].x += dx;
          resizeHandleCorners.current[2].y += dy;
          // Bottom-right handle
          resizeHandleCorners.current[3].y += dy;
          break;
        case 3: // Bottom-right
          transform[0] = (scaledWidth + dx) / artifact.value.width;
          transform[3] = (scaledHeight + dy) / artifact.value.height;
          // Top-right handle
          resizeHandleCorners.current[1].x += dx;
          // Bottom-left handle
          resizeHandleCorners.current[2].y += dy;
          // Bottom-right handle
          resizeHandleCorners.current[3].x += dx;
          resizeHandleCorners.current[3].y += dy;
          break;
      }

      //   if (newElement.w < 20) {
      //     newElement.w = 20;
      //     newElement.x = element.x;
      //   }
      //   if (newElement.h < 20) {
      //     newElement.h = 20;
      //     newElement.y = element.y;
      //   }

      lastPos.current = { x, y };
    }

    return true;
  };
}

function editingOnMouseUp({
  isDragging,
  draggedId,
  resizeHandle,
  sectionId,
  activeLayerId,
  localArtifactTransformsRef,
  canvasRef,
  tempCanvasRef,
}) {
  return () => {
    setGlobalArtifactTransformsAndDrawAllLayers(
      sectionId,
      activeLayerId,
      localArtifactTransformsRef,
      canvasRef,
      tempCanvasRef,
    );
    isDragging.current = false;
    draggedId.current = null;
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

function getScaledWidth(artifact, transform) {
  return artifact.value.width * transform[0];
}

function getScaledHeight(artifact, transform) {
  return artifact.value.height * transform[3];
}
