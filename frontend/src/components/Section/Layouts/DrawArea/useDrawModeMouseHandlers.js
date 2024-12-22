import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { useArtifacts, useMisc, useSectionInfos } from "state/definitions";
import {
  filterPathForBrushStroke,
  filterPathForImage,
} from "./eraserIntersection";
import {
  drawAllLayers,
  drawStroke,
  getCombinedTransformForStroke,
  getInverseTransform,
  getXY,
  RESIZE_HANDLE_SIZE,
  setGlobalArtifactTransformsAndDrawAllLayers,
  setGlobalBrushStrokesAndDrawAllLayers,
  startNewEraserStroke,
  startNewStroke,
} from "./utils";

export function useDrawModeMouseHandlers({
  sectionId,
  isEraser,
  strokesRef,
  eraserStrokesRef,
  prevPointRef,
  eraserBrushSize,
  brushShape,
  isDrawing,
  setIsDrawing,
  isDragging,
  draggedIdx,
  lastPos,
  selectedIdx,
  resizeHandle,
  resizeHandleCorners,
  drawThrottleDelay,
  canvasRef,
  tempCanvasRefs,
  draftCanvasRef,
  canvasTransferQueueLength,
  currBrushStrokeArtifactId,
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
      eraserBrushSize,
      brushShape,
      prevPointRef,
      setIsDrawing,
      canvasRef,
      tempCanvasRefs,
      draftCanvasRef,
      activeLayerId,
      currBrushStrokeArtifactId,
      localArtifactTransformsRef,
    });

    onMouseMove = drawingOnMouseMove({
      sectionId,
      isEraser,
      strokesRef,
      eraserStrokesRef,
      prevPointRef,
      isDrawing,
      canvasRef,
      tempCanvasRefs,
      draftCanvasRef,
      canvasTransferQueueLength,
      activeLayerId,
      currBrushStrokeArtifactId,
      localArtifactTransformsRef,
    });

    onMouseUp = drawingOnMouseUp({
      sectionId,
      isEraser,
      eraserStrokesRef,
      isDrawing,
      setIsDrawing,
      activeLayerId,
      currBrushStrokeArtifactId,
      strokesRef,
      canvasRef,
      tempCanvasRefs,
      draftCanvasRef,
    });

    onMouseEnter = drawingOnMouseEnter({ draftCanvasRef, onMouseDown });
  } else {
    const onMouseDownCore = editingOnMouseDown({
      canvasRef,
      selectedIdx,
      localArtifactTransformsRef,
      resizeHandle,
      resizeHandleCorners,
      lastPos,
      draggedIdx,
      isDragging,
    });

    onMouseDown = (e) => {
      const redrawLayers = onMouseDownCore(e);
      if (redrawLayers) {
        drawAllLayers(
          sectionId,
          canvasRef,
          tempCanvasRefs,
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
      selectedIdx,
      draggedIdx,
      localArtifactTransformsRef,
    });

    onMouseMove = (e) => {
      const redrawLayers = onMouseMoveCore(e);
      if (redrawLayers) {
        drawAllLayers(
          sectionId,
          canvasRef,
          tempCanvasRefs,
          {},
          { [activeLayerId]: localArtifactTransformsRef.current },
          { [activeLayerId]: resizeHandleCorners.current },
        );
      }
    };

    onMouseUp = editingOnMouseUp({
      sectionId,
      isDragging,
      draggedIdx,
      resizeHandle,
      resizeHandleCorners,
      activeLayerId,
      localArtifactTransformsRef,
      canvasRef,
      tempCanvasRefs,
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
  eraserBrushSize,
  brushShape,
  prevPointRef,
  setIsDrawing,
  canvasRef,
  tempCanvasRefs,
  draftCanvasRef,
  activeLayerId,
  currBrushStrokeArtifactId,
  localArtifactTransformsRef,
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
    if (isEraser) {
      startNewEraserStroke(
        eraserStrokesRef,
        eraserBrushSize,
        brushShape,
        point,
      );
      drawAllLayers(
        sectionId,
        canvasRef,
        tempCanvasRefs,
        {},
        {},
        {},
        { [activeLayerId]: eraserStrokesRef.current },
      );
    } else {
      const currentBrushStrokeTransformInfo =
        localArtifactTransformsRef.current.find(
          (l) => l.artifactId === currBrushStrokeArtifactId,
        );
      startNewStroke(
        draftCanvasRef,
        strokesRef,
        point,
        getInverseTransform(currentBrushStrokeTransformInfo.transform),
      );
    }

    prevPointRef.current = point;
  };
}

function drawingOnMouseMove({
  sectionId,
  isEraser,
  strokesRef,
  eraserStrokesRef,
  prevPointRef,
  isDrawing,
  canvasRef,
  tempCanvasRefs,
  draftCanvasRef,
  canvasTransferQueueLength,
  activeLayerId,
  currBrushStrokeArtifactId,
  localArtifactTransformsRef,
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
        sectionId,
        canvasRef,
        tempCanvasRefs,
        {},
        {},
        {},
        { [activeLayerId]: eraserStrokesRef.current },
      );
    } else if (currStroke.points.length >= canvasTransferQueueLength) {
      setGlobalBrushStrokesAndDrawAllLayers(
        sectionId,
        currBrushStrokeArtifactId,
        strokesRef,
        canvasRef,
        tempCanvasRefs,
        draftCanvasRef,
      );
      const currentBrushStrokeTransformInfo =
        localArtifactTransformsRef.current.find(
          (l) => l.artifactId === currBrushStrokeArtifactId,
        );
      startNewStroke(
        draftCanvasRef,
        currStrokesRef,
        point,
        getInverseTransform(currentBrushStrokeTransformInfo.transform),
      );
      prevPointRef.current = point;
    } else {
      drawStroke(draftCanvasRef, prevPointRef.current, point);
      currStroke.points.push(point);
      prevPointRef.current = point;
    }
  };
}

function drawingOnMouseUp({
  sectionId,
  isEraser,
  eraserStrokesRef,
  isDrawing,
  setIsDrawing,
  activeLayerId,
  currBrushStrokeArtifactId,
  strokesRef,
  canvasRef,
  tempCanvasRefs,
  draftCanvasRef,
}) {
  return () => {
    if (!isDrawing) {
      return;
    }
    if (isEraser) {
      const artifactState = useArtifacts.getState();
      const eraserPath =
        eraserStrokesRef.current[eraserStrokesRef.current.length - 1];

      useSectionInfos.setState((state) => {
        const layer = state.artifactGroups[activeLayerId];
        for (const t of layer.artifactTransforms) {
          const artifact = artifactState[t.artifactId];
          const inverseTransform = getInverseTransform(t.transform);
          if (artifact.type === "img") {
            const intersectingPath = filterPathForImage(
              eraserPath.points,
              eraserPath.lineWidth,
              eraserPath.lineCap,
              getImageBounds(artifact.value, t.transform),
            );

            if (intersectingPath.length > 0) {
              t.eraserStrokes.push({
                ...eraserPath,
                points: intersectingPath,
                transform: inverseTransform,
              });
            }
          } else {
            for (const [idx, stroke] of artifact.value.entries()) {
              const intersectingPath = filterPathForBrushStroke(
                eraserPath.points,
                eraserPath.lineWidth,
                eraserPath.lineCap,
                getTransformedPoints(stroke.points, t.transform),
                stroke.lineWidth,
                stroke.lineCap,
                t.transform[0],
                t.transform[3],
              );
              if (intersectingPath.length > 0) {
                if (!(idx in t.eraserStrokes)) {
                  t.eraserStrokes[idx] = [];
                }
                t.eraserStrokes[idx].push({
                  ...eraserPath,
                  points: intersectingPath,
                  transform: inverseTransform,
                });
              }
            }
          }
        }
      });

      eraserStrokesRef.current = [];
    }
    setIsDrawing(false);
    setGlobalBrushStrokesAndDrawAllLayers(
      sectionId,
      currBrushStrokeArtifactId,
      strokesRef,
      canvasRef,
      tempCanvasRefs,
      draftCanvasRef,
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
  selectedIdx,
  localArtifactTransformsRef,
  resizeHandle,
  resizeHandleCorners,
  lastPos,
  draggedIdx,
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

    if (selectedIdx.current !== null) {
      for (let i = 0; i < resizeHandleCorners.current.length; i++) {
        const corner = resizeHandleCorners.current[i];
        if (
          Math.abs(x - corner.x) <= RESIZE_HANDLE_SIZE / 2 &&
          Math.abs(y - corner.y) <= RESIZE_HANDLE_SIZE / 2
        ) {
          const currTransform =
            localArtifactTransformsRef.current[selectedIdx.current].transform;
          resizeHandle.current = {
            idx: i,
            wasPositive: {
              xScale: currTransform[0] >= 0,
              yScale: currTransform[3] >= 0,
            },
          };
          lastPos.current = { x, y };
          return true;
        }
      }
    }

    for (let i = localArtifactTransformsRef.current.length - 1; i >= 0; i--) {
      const { transform, artifactId } = localArtifactTransformsRef.current[i];
      const artifact = artifactState[artifactId];
      if (artifact.type === "img") {
        const bounds = getImageBounds(artifact.value, transform);
        if (
          x >= bounds.minX &&
          x <= bounds.maxX &&
          y >= bounds.minY &&
          y <= bounds.maxY
        ) {
          setResizeHandleCorners(resizeHandleCorners, bounds);
          isDragging.current = true;
          draggedIdx.current = i;
          selectedIdx.current = i;
          lastPos.current = { x, y };
          return true;
        }
      } else if (artifact.type === "brushStrokes") {
        const hitRadius = 5;

        for (const stroke of artifact.value) {
          const combinedTransform = getCombinedTransformForStroke(
            transform,
            stroke.transform,
          );
          for (const point of getTransformedPoints(
            stroke.points,
            combinedTransform,
          )) {
            if (
              Math.abs(x - point[0]) <= hitRadius &&
              Math.abs(y - point[1]) <= hitRadius
            ) {
              const bounds = getBrushStrokesBounds(artifact.value, transform);
              setResizeHandleCorners(resizeHandleCorners, bounds);
              isDragging.current = true;
              draggedIdx.current = i;
              selectedIdx.current = i;
              lastPos.current = { x, y };
              return true;
            }
          }
        }
      }
    }
    selectedIdx.current = null;
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
  selectedIdx,
  draggedIdx,
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

    if (isDragging.current && draggedIdx.current !== null) {
      const { transform } =
        localArtifactTransformsRef.current[draggedIdx.current];
      transform[4] += dx;
      transform[5] += dy;
      lastPos.current = { x, y };
      resizeHandleCorners.current = resizeHandleCorners.current.map((c) => ({
        x: c.x + dx,
        y: c.y + dy,
      }));
    } else if (resizeHandle.current !== null && selectedIdx.current !== null) {
      const { transform, artifactId } =
        localArtifactTransformsRef.current[selectedIdx.current];
      const artifact = artifactState[artifactId];

      if (artifact.type === "img") {
        const scaledWidth = getScaledWidth(artifact.value, transform);
        const scaledHeight = getScaledHeight(artifact.value, transform);
        const handleBehaviorFn = getImageHandleBehaviorFn(
          resizeHandle.current.idx,
          resizeHandle.current.wasPositive.xScale,
          resizeHandle.current.wasPositive.yScale,
        );
        handleBehaviorFn(
          transform,
          scaledWidth,
          scaledHeight,
          dx,
          dy,
          artifact,
        );
      } else if (artifact.type === "brushStrokes") {
        const bounds =
          getPseudoBoundsFromResizeHandleCorners(resizeHandleCorners);
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        switch (resizeHandle.current.idx) {
          case 0: {
            // Top-left
            const scaleX = (width - dx) / width;
            const scaleY = (height - dy) / height;

            // Anchor point is bottom-right
            const anchorX = bounds.maxX;
            const anchorY = bounds.maxY;

            transform[0] *= scaleX;
            transform[3] *= scaleY;
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;

            break;
          }
          case 1: {
            // Top-right
            const scaleX = (width + dx) / width;
            const scaleY = (height - dy) / height;

            // Anchor point is bottom-left
            const anchorX = bounds.minX;
            const anchorY = bounds.maxY;

            transform[0] *= scaleX;
            transform[3] *= scaleY;
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;

            break;
          }
          case 2: {
            // Bottom-left
            const scaleX = (width - dx) / width;
            const scaleY = (height + dy) / height;

            // Anchor point is top-right
            const anchorX = bounds.maxX;
            const anchorY = bounds.minY;

            transform[0] *= scaleX;
            transform[3] *= scaleY;
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;

            break;
          }
          case 3: {
            // Bottom-right
            const scaleX = (width + dx) / width;
            const scaleY = (height + dy) / height;

            // Anchor point is top-left
            const anchorX = bounds.minX;
            const anchorY = bounds.minY;

            transform[0] *= scaleX;
            transform[3] *= scaleY;
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;
            break;
          }
        }
      }

      incrementResizeHandleCorners(
        resizeHandle,
        resizeHandleCorners,
        dx,
        dy,
        transform,
      );

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
  sectionId,
  isDragging,
  draggedIdx,
  resizeHandle,
  resizeHandleCorners,
  activeLayerId,
  localArtifactTransformsRef,
  canvasRef,
  tempCanvasRefs,
}) {
  return () => {
    // have to update the corners
    // in case the x or y scaling went from positive to negative or vice versa
    if (resizeHandleCorners.current) {
      setResizeHandleCorners(
        resizeHandleCorners,
        getTrueBoundsFromResizeHandleCorners(resizeHandleCorners),
      );
    }
    setGlobalArtifactTransformsAndDrawAllLayers(
      sectionId,
      activeLayerId,
      localArtifactTransformsRef,
      resizeHandleCorners,
      canvasRef,
      tempCanvasRefs,
    );
    isDragging.current = false;
    draggedIdx.current = null;
    resizeHandle.current = null;
  };
}

const getBrushStrokesBounds = (strokes, artifactTransform) => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const stroke of strokes) {
    const combinedTransform = getCombinedTransformForStroke(
      artifactTransform,
      stroke.transform,
    );
    for (const point of getTransformedPoints(
      stroke.points,
      combinedTransform,
    )) {
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

function incrementResizeHandleCorners(
  resizeHandle,
  resizeHandleCorners,
  dx,
  dy,
) {
  switch (resizeHandle.current.idx) {
    case 0: // Top-left
      // Top-left handle
      resizeHandleCorners.current[0].x += dx;
      resizeHandleCorners.current[0].y += dy;
      // Top-right handle
      resizeHandleCorners.current[1].y += dy;
      // Bottom-left handle
      resizeHandleCorners.current[2].x += dx;
      break;
    case 1: // Top-right
      // Top-left handle
      resizeHandleCorners.current[0].y += dy;
      // Top-right handle
      resizeHandleCorners.current[1].x += dx;
      resizeHandleCorners.current[1].y += dy;
      // Bottom-right handle
      resizeHandleCorners.current[3].x += dx;
      break;
    case 2: // Bottom-left
      // Top-left handle
      resizeHandleCorners.current[0].x += dx;
      // Bottom-left handle
      resizeHandleCorners.current[2].x += dx;
      resizeHandleCorners.current[2].y += dy;
      // Bottom-right handle
      resizeHandleCorners.current[3].y += dy;
      break;
    case 3: // Bottom-right
      // Top-right handle
      resizeHandleCorners.current[1].x += dx;
      // Bottom-left handle
      resizeHandleCorners.current[2].y += dy;
      // Bottom-right handle
      resizeHandleCorners.current[3].x += dx;
      resizeHandleCorners.current[3].y += dy;
      break;
  }
}

function setResizeHandleCorners(resizeHandleCorners, bounds) {
  resizeHandleCorners.current = [
    { x: bounds.minX, y: bounds.minY }, // Top-left
    { x: bounds.maxX, y: bounds.minY }, // Top-right
    { x: bounds.minX, y: bounds.maxY }, // Bottom-left
    { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
  ];
}

function getTrueBoundsFromResizeHandleCorners(resizeHandleCorners) {
  const xs = resizeHandleCorners.current.map((r) => r.x);
  const ys = resizeHandleCorners.current.map((r) => r.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function getPseudoBoundsFromResizeHandleCorners(resizeHandleCorners) {
  return {
    minX: resizeHandleCorners.current[0].x,
    maxX: resizeHandleCorners.current[1].x,
    minY: resizeHandleCorners.current[0].y,
    maxY: resizeHandleCorners.current[2].y,
  };
}

function getScaledWidth(image, transform) {
  return image.width * transform[0];
}

function getScaledHeight(image, transform) {
  return image.height * transform[3];
}

function getTransformedPoints(points, transform) {
  if (!transform) {
    return points;
  }
  return points.map((point) => [
    point[0] * transform[0] + transform[4],
    point[1] * transform[3] + transform[5],
  ]);
}

function getImageBounds(image, transform) {
  const xs = [transform[4], transform[4] + getScaledWidth(image, transform)];
  const ys = [transform[5], transform[5] + getScaledHeight(image, transform)];

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function getImageHandleBehaviorFn(
  resizeHandleIdx,
  xScaleWasPositive,
  yScaleWasPositive,
) {
  switch (resizeHandleIdx) {
    case 0:
      if (xScaleWasPositive && yScaleWasPositive) {
        return imageTopLeftHandleBehavior;
      } else if (xScaleWasPositive && !yScaleWasPositive) {
        return imageBottomLeftHandleBehavior;
      } else if (!xScaleWasPositive && yScaleWasPositive) {
        return imageTopRightHandleBehavior;
      } else if (!xScaleWasPositive && !yScaleWasPositive) {
        return imageBottomRightHandleBehavior;
      }
    case 1:
      if (xScaleWasPositive && yScaleWasPositive) {
        return imageTopRightHandleBehavior;
      } else if (xScaleWasPositive && !yScaleWasPositive) {
        return imageBottomRightHandleBehavior;
      } else if (!xScaleWasPositive && yScaleWasPositive) {
        return imageTopLeftHandleBehavior;
      } else if (!xScaleWasPositive && !yScaleWasPositive) {
        return imageBottomLeftHandleBehavior;
      }
    case 2:
      if (xScaleWasPositive && yScaleWasPositive) {
        return imageBottomLeftHandleBehavior;
      } else if (xScaleWasPositive && !yScaleWasPositive) {
        return imageTopLeftHandleBehavior;
      } else if (!xScaleWasPositive && yScaleWasPositive) {
        return imageBottomRightHandleBehavior;
      } else if (!xScaleWasPositive && !yScaleWasPositive) {
        return imageTopRightHandleBehavior;
      }
    case 3:
      if (xScaleWasPositive && yScaleWasPositive) {
        return imageBottomRightHandleBehavior;
      } else if (xScaleWasPositive && !yScaleWasPositive) {
        return imageTopRightHandleBehavior;
      } else if (!xScaleWasPositive && yScaleWasPositive) {
        return imageBottomLeftHandleBehavior;
      } else if (!xScaleWasPositive && !yScaleWasPositive) {
        return imageTopLeftHandleBehavior;
      }
  }
}

const ZERO_THRESHOLD = 0.1;

function preventZeroScale(scale) {
  if (Math.abs(scale) < ZERO_THRESHOLD) {
    // If we're crossing from positive to negative
    if (scale < 0) {
      return -ZERO_THRESHOLD;
    }
    // If we're crossing from negative to positive
    return ZERO_THRESHOLD;
  }
  return scale;
}

function imageTopLeftHandleBehavior(
  transform,
  scaledWidth,
  scaledHeight,
  dx,
  dy,
  artifact,
) {
  transform[0] = preventZeroScale((scaledWidth - dx) / artifact.value.width);
  transform[3] = preventZeroScale((scaledHeight - dy) / artifact.value.height);
  transform[4] += dx;
  transform[5] += dy;
}

function imageTopRightHandleBehavior(
  transform,
  scaledWidth,
  scaledHeight,
  dx,
  dy,
  artifact,
) {
  transform[0] = preventZeroScale((scaledWidth + dx) / artifact.value.width);
  transform[3] = preventZeroScale((scaledHeight - dy) / artifact.value.height);
  transform[5] += dy;
}

function imageBottomLeftHandleBehavior(
  transform,
  scaledWidth,
  scaledHeight,
  dx,
  dy,
  artifact,
) {
  transform[0] = preventZeroScale((scaledWidth - dx) / artifact.value.width);
  transform[3] = preventZeroScale((scaledHeight + dy) / artifact.value.height);
  transform[4] += dx;
}

function imageBottomRightHandleBehavior(
  transform,
  scaledWidth,
  scaledHeight,
  dx,
  dy,
  artifact,
) {
  transform[0] = preventZeroScale((scaledWidth + dx) / artifact.value.width);
  transform[3] = preventZeroScale((scaledHeight + dy) / artifact.value.height);
}
