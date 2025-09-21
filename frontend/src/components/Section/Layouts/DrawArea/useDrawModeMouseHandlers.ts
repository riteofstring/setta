import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import {
  useArtifacts,
  useDrawAreaLayerItemTransform,
  useBrushStrokes,
  useDecodedImages,
} from "state/definitions";
import {
  ArtifactTypeEnum,
  BrushStroke,
  BrushStrokeArtifact,
  CanvasPoint,
  DrawAreaBrushShape,
  DrawAreaLayer,
  DrawAreaMode,
  DrawAreaModeEnum,
  DrawAreaTransform,
} from "utils/generatedTypes";
import {
  drawOneLayer,
  drawStroke,
  getActiveLayerAndCanvas,
  getInverseTransform,
  getXY,
  RESIZE_HANDLE_SIZE,
  setGlobalArtifactTransformsAndDrawAllLayers,
  setGlobalBrushStrokeAndDrawLayer,
  startNewEraserStroke,
  startNewStroke,
} from "./canvasUtils";
import { filterEraserPath } from "./eraserIntersection";
import {
  detectHit,
  getBrushStrokesBounds,
  getImageBounds,
  getImageHandleBehaviorFn,
  getPseudoBoundsFromResizeHandleCorners,
  getScaledHeight,
  getScaledWidth,
  getTrueBoundsFromResizeHandleCorners,
  incrementResizeHandleCorners,
  preventExactZero,
  setResizeHandleCorners,
} from "./mouseHandlerUtils";
import {
  LayerCanvasesType,
  ResizeHandle,
  ResizeHandleCorners,
  TempCanvasesType,
} from "./types";

export function useDrawModeMouseHandlers(
  layers: Array<DrawAreaLayer>,
  sectionId: string,
  strokeRef: React.RefObject<BrushStrokeArtifact | null>,
  eraserStrokeRef: React.RefObject<BrushStroke | null>,
  prevPointRef: React.RefObject<CanvasPoint | null>,
  eraserBrushSize: number,
  brushShape: DrawAreaBrushShape,
  isDrawing: React.RefObject<boolean>,
  isDragging: React.RefObject<boolean>,
  draggedIdx: React.RefObject<number | null>,
  lastPos: React.RefObject<CanvasPoint | null>,
  selectedIdx: React.RefObject<number | null>,
  resizeHandle: React.RefObject<ResizeHandle | null>,
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>,
  drawThrottleDelay: number,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  canvasTransferQueueLength: number,
  activeLayerIdx: number,
  localArtifactTransformsRef: React.RefObject<DrawAreaTransform>,
  canvasMode: DrawAreaMode,
) {
  let onMouseDown: React.MouseEventHandler<HTMLCanvasElement>,
    onMouseMove: React.MouseEventHandler<HTMLCanvasElement>,
    onMouseUp: React.MouseEventHandler<HTMLCanvasElement>,
    onMouseEnter: React.MouseEventHandler<HTMLCanvasElement>;

  if (
    canvasMode === DrawAreaModeEnum.draw ||
    canvasMode === DrawAreaModeEnum.erase
  ) {
    onMouseDown = drawingOnMouseDown(
      layers,
      strokeRef,
      eraserStrokeRef,
      eraserBrushSize,
      brushShape,
      prevPointRef,
      isDrawing,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      activeLayerIdx,
      canvasMode,
    );

    onMouseMove = drawingOnMouseMove(
      layers,
      strokeRef,
      eraserStrokeRef,
      prevPointRef,
      isDrawing,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      canvasTransferQueueLength,
      activeLayerIdx,
      canvasMode,
    );

    onMouseUp = drawingOnMouseUp(
      layers,
      eraserStrokeRef,
      isDrawing,
      activeLayerIdx,
      strokeRef,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      canvasMode,
    );

    onMouseEnter = drawingOnMouseEnter(draftCanvasRef, onMouseDown);
  } else {
    onMouseDown = editingOnMouseDown({
      layerCanvasRefs,
      selectedIdx,
      localArtifactTransformsRef,
      resizeHandle,
      resizeHandleCorners,
      lastPos,
      draggedIdx,
      isDragging,
      activeLayerId,
    });

    onMouseMove = editingOnMouseMove({
      layerCanvasRefs,
      isDragging,
      lastPos,
      resizeHandle,
      resizeHandleCorners,
      selectedIdx,
      draggedIdx,
      localArtifactTransformsRef,
      activeLayerId,
    });

    onMouseUp = editingOnMouseUp({
      sectionId,
      isDragging,
      draggedIdx,
      resizeHandle,
      resizeHandleCorners,
      activeLayerId,
      localArtifactTransformsRef,
      layerCanvasRefs,
      tempCanvasRefs,
    });

    onMouseEnter = () => {};
  }

  // useCallback so that throttle function doesn't get recreated and reset timer
  // const throttledOnMouseMove = useCallback(
  //   mode === "draw" && drawThrottleDelay > 0
  //     ? _.throttle(onMouseMove, drawThrottleDelay)
  //     : onMouseMove,
  //   [onMouseMove, drawThrottleDelay],
  // );

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseEnter,
  };
}

function drawingOnMouseDown(
  layers: Array<DrawAreaLayer>,
  strokeRef: React.RefObject<BrushStrokeArtifact | null>,
  eraserStrokeRef: React.RefObject<BrushStroke | null>,
  eraserBrushSize: number,
  brushShape: DrawAreaBrushShape,
  prevPointRef: React.RefObject<CanvasPoint | null>,
  isDrawingRef: React.RefObject<boolean>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  activeLayerIdx: number,
  canvasMode: DrawAreaMode,
): React.MouseEventHandler<HTMLCanvasElement> {
  return (e, offsetX: number | null = null, offsetY: number | null = null) => {
    isDrawingRef.current = true;
    const point: CanvasPoint =
      offsetX !== null && offsetY !== null ? [offsetX, offsetY] : getXY(e);
    if (canvasMode === DrawAreaModeEnum.erase) {
      eraserStrokeRef.current = startNewEraserStroke(
        eraserBrushSize,
        brushShape,
        point,
      );
      const layer = layers[activeLayerIdx];
      const layerCanvas = layerCanvasRefs.current[activeLayerIdx];
      if (!layer || !layerCanvas) {
        return;
      }
      drawOneLayer(
        layer,
        layerCanvas,
        tempCanvasRefs,
        [],
        null,
        eraserStrokeRef.current,
      );
    } else {
      strokeRef.current = startNewStroke(draftCanvasRef, point);
    }
    prevPointRef.current = point;
  };
}

function drawingOnMouseMove(
  layers: Array<DrawAreaLayer>,
  strokeRef: React.RefObject<BrushStrokeArtifact | null>,
  eraserStrokeRef: React.RefObject<BrushStroke | null>,
  prevPointRef: React.RefObject<CanvasPoint | null>,
  isDrawingRef: React.RefObject<boolean>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  canvasTransferQueueLength: number,
  activeLayerIdx: number,
  canvasMode: DrawAreaMode,
): React.MouseEventHandler<HTMLCanvasElement> {
  return (e) => {
    if (!isDrawingRef.current) {
      return;
    }
    const point = getXY(e);
    if (canvasMode === DrawAreaModeEnum.erase && eraserStrokeRef.current) {
      eraserStrokeRef.current.points.push(point);
      prevPointRef.current = point;
      const [layer, layerCanvas] = getActiveLayerAndCanvas(
        layers,
        layerCanvasRefs,
        activeLayerIdx,
      );
      if (!layer || !layerCanvas) {
        return;
      }
      drawOneLayer(
        layer,
        layerCanvas,
        tempCanvasRefs,
        [],
        null,
        eraserStrokeRef.current,
      );
    } else if (
      canvasMode === DrawAreaModeEnum.draw &&
      draftCanvasRef.current &&
      strokeRef.current
    ) {
      if (strokeRef.current.value.points.length >= canvasTransferQueueLength) {
        const [layer, layerCanvas] = getActiveLayerAndCanvas(
          layers,
          layerCanvasRefs,
          activeLayerIdx,
        );
        if (!layer || !layerCanvas) {
          return;
        }
        setGlobalBrushStrokeAndDrawLayer(
          layer,
          strokeRef.current,
          layerCanvas,
          tempCanvasRefs,
          draftCanvasRef.current,
        );
        strokeRef.current = startNewStroke(draftCanvasRef, point);
        prevPointRef.current = point;
      } else if (prevPointRef.current) {
        drawStroke(draftCanvasRef.current, prevPointRef.current, point);
        strokeRef.current.value.points.push(point);
        prevPointRef.current = point;
      }
    }
  };
}

function drawingOnMouseUp(
  layers: Array<DrawAreaLayer>,
  eraserStrokeRef: React.RefObject<BrushStroke | null>,
  isDrawingRef: React.RefObject<boolean>,
  activeLayerIdx: number,
  strokeRef: React.RefObject<BrushStrokeArtifact | null>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  canvasMode: DrawAreaMode,
) {
  return () => {
    if (!isDrawingRef.current) {
      return;
    }
    isDrawingRef.current = false;
    const [layer, layerCanvas] = getActiveLayerAndCanvas(
      layers,
      layerCanvasRefs,
      activeLayerIdx,
    );
    if (!layer || !layerCanvas) {
      return;
    }

    if (canvasMode === DrawAreaModeEnum.erase) {
      const images = useDecodedImages.getState().x;
      const brushStrokes = useBrushStrokes.getState().x;
      const layer = layers[activeLayerIdx];
      if (!layer) {
        return;
      }
      useDrawAreaLayerItemTransform.setState((state) => {
        if (!eraserStrokeRef.current) {
          return;
        }
        for (const el of layer.elements) {
          const artifact = state.x[el.transformId];
          if (!artifact) {
            continue;
          }
          const inverseTransform = getInverseTransform(
            artifact.value.transform,
          );
          let bounds;
          if (el.type === ArtifactTypeEnum.Image) {
            const img = images[el.dataPath];
            if (img) {
              bounds = getImageBounds(img, artifact.value.transform);
            }
          } else if (el.type === ArtifactTypeEnum.BrushStroke) {
            const brushStroke = brushStrokes[el.dataPath];
            if (brushStroke) {
              bounds = getBrushStrokesBounds(
                brushStroke,
                artifact.value.transform,
              );
            }
          }

          const intersectingPath = filterEraserPath(
            eraserStrokeRef.current.points,
            eraserStrokeRef.current.lineWidth,
            eraserStrokeRef.current.lineCap,
            bounds,
          );
          artifact.value.eraserStrokes.push({
            ...eraserStrokeRef.current,
            points: intersectingPath,
            transform: inverseTransform,
          });
        }
      });

      eraserStrokeRef.current = null;
      drawOneLayer(layer, layerCanvas, tempCanvasRefs, [], null, null);
    } else if (canvasMode === DrawAreaModeEnum.draw) {
      if (!strokeRef.current || !draftCanvasRef.current) {
        return;
      }
      setGlobalBrushStrokeAndDrawLayer(
        layer,
        strokeRef.current,
        layerCanvas,
        tempCanvasRefs,
        draftCanvasRef.current,
      );
    }
  };
}

function drawingOnMouseEnter(
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  onMouseDown: (
    e: React.MouseEvent<HTMLCanvasElement>,
    offsetX: number | null,
    offsetY: number | null,
  ) => void,
): React.MouseEventHandler<HTMLCanvasElement> {
  return (e) => {
    if (!draftCanvasRef.current) {
      return;
    }
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
  layerCanvasRefs,
  selectedIdx,
  localArtifactTransformsRef,
  resizeHandle,
  resizeHandleCorners,
  lastPos,
  draggedIdx,
  isDragging,
  activeLayerId,
}) {
  // returns true if layers should be redrawn
  return (e) => {
    const artifactState = useArtifacts.getState().x;
    const canvas = layerCanvasRefs.current[activeLayerId];
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
      if (artifact.type === ArtifactTypeEnum.IMG) {
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
      } else if (artifact.type === ArtifactTypeEnum.BRUSH_STROKES) {
        const hit = detectHit(x, y, artifact, transform);
        if (hit) {
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
    selectedIdx.current = null;
    resizeHandleCorners.current = null;
    return false;
  };
}

function editingOnMouseMove({
  layerCanvasRefs,
  isDragging,
  lastPos,
  resizeHandle,
  resizeHandleCorners,
  selectedIdx,
  draggedIdx,
  localArtifactTransformsRef,
  activeLayerId,
}) {
  // returns true if layers should be redrawn
  return (e) => {
    if (!isDragging.current && resizeHandle.current === null) return false;

    const artifactState = useArtifacts.getState().x;
    const canvas = layerCanvasRefs.current[activeLayerId];
    const rect = canvas.getBoundingClientRect();
    const zoom = getZoom();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const dx = x - lastPos.current.x;
    const dy = y - lastPos.current.y;
    // Check if shift key is pressed to preserve aspect ratio
    const preserveAspectRatio = e.shiftKey;

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

      if (artifact.type === ArtifactTypeEnum.IMG) {
        const scaledWidth = getScaledWidth(artifact.value, transform);
        const scaledHeight = getScaledHeight(artifact.value, transform);
        const handleBehaviorFn = getImageHandleBehaviorFn(
          resizeHandle.current.idx,
          resizeHandle.current.wasPositive.xScale,
          resizeHandle.current.wasPositive.yScale,
        );

        if (preserveAspectRatio) {
          // When preserving aspect ratio, use the dimension with the larger change
          const aspectRatio = scaledWidth / scaledHeight;

          // Always use the mouse movement as the dominant input
          // If dx is close to zero, use dy as the primary change
          // If dy is close to zero, use dx as the primary change
          // Otherwise, use whichever has a larger absolute value

          // Use a small threshold to prevent division by zero or tiny values
          const epsilon = 0.001;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          let newDx = dx;
          let newDy = dy;

          // Normalize the changes based on handle position and dominant dimension
          if (absDx < epsilon && absDy < epsilon) {
            // Both changes are too small, keep original values
            newDx = dx;
            newDy = dy;
          } else if (absDx < epsilon) {
            // Height change is dominant (dx is nearly zero)
            newDx = (dy > 0 ? 1 : -1) * absDy * aspectRatio;
            // Adjust direction based on handle
            if (
              resizeHandle.current.idx === 1 ||
              resizeHandle.current.idx === 2
            ) {
              newDx = -newDx;
            }
          } else if (absDy < epsilon) {
            // Width change is dominant (dy is nearly zero)
            newDy = ((dx > 0 ? 1 : -1) * absDx) / aspectRatio;
            // Adjust direction based on handle
            if (
              resizeHandle.current.idx === 1 ||
              resizeHandle.current.idx === 2
            ) {
              newDy = -newDy;
            }
          } else if (absDx > absDy) {
            // Width change is dominant
            newDy = ((dx > 0 ? 1 : -1) * absDx) / aspectRatio;
            // For top-right and bottom-left handles, flip the sign
            if (
              resizeHandle.current.idx === 1 ||
              resizeHandle.current.idx === 2
            ) {
              newDy = -newDy;
            }
          } else {
            // Height change is dominant
            newDx = (dy > 0 ? 1 : -1) * absDy * aspectRatio;
            // For top-right and bottom-left handles, flip the sign
            if (
              resizeHandle.current.idx === 1 ||
              resizeHandle.current.idx === 2
            ) {
              newDx = -newDx;
            }
          }

          handleBehaviorFn(
            transform,
            scaledWidth,
            scaledHeight,
            newDx,
            newDy,
            artifact,
          );
        } else {
          // Original behavior without aspect ratio preservation
          handleBehaviorFn(
            transform,
            scaledWidth,
            scaledHeight,
            dx,
            dy,
            artifact,
          );
        }
      } else if (artifact.type === ArtifactTypeEnum.BRUSH_STROKES) {
        const bounds =
          getPseudoBoundsFromResizeHandleCorners(resizeHandleCorners);
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        // For each case, we'll modify handling when preserveAspectRatio is true
        switch (resizeHandle.current.idx) {
          case 0: {
            // Top-left
            let scaleX = (width - dx) / width;
            let scaleY = (height - dy) / height;

            if (preserveAspectRatio) {
              // Use the larger scale factor for both dimensions
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }

            // Anchor point is bottom-right
            const anchorX = bounds.maxX;
            const anchorY = bounds.maxY;

            transform[0] = preventExactZero(transform[0] * scaleX);
            transform[3] = preventExactZero(transform[3] * scaleY);
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;

            break;
          }
          case 1: {
            // Top-right
            let scaleX = (width + dx) / width;
            let scaleY = (height - dy) / height;

            if (preserveAspectRatio) {
              // Use the larger scale factor for both dimensions
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }

            // Anchor point is bottom-left
            const anchorX = bounds.minX;
            const anchorY = bounds.maxY;

            transform[0] = preventExactZero(transform[0] * scaleX);
            transform[3] = preventExactZero(transform[3] * scaleY);
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;

            break;
          }
          case 2: {
            // Bottom-left
            let scaleX = (width - dx) / width;
            let scaleY = (height + dy) / height;

            if (preserveAspectRatio) {
              // Use the larger scale factor for both dimensions
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }

            // Anchor point is top-right
            const anchorX = bounds.maxX;
            const anchorY = bounds.minY;

            transform[0] = preventExactZero(transform[0] * scaleX);
            transform[3] = preventExactZero(transform[3] * scaleY);
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;

            break;
          }
          case 3: {
            // Bottom-right
            let scaleX = (width + dx) / width;
            let scaleY = (height + dy) / height;

            if (preserveAspectRatio) {
              // Use the larger scale factor for both dimensions
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }

            // Anchor point is top-left
            const anchorX = bounds.minX;
            const anchorY = bounds.minY;

            transform[0] = preventExactZero(transform[0] * scaleX);
            transform[3] = preventExactZero(transform[3] * scaleY);
            transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
            transform[5] = anchorY - (anchorY - transform[5]) * scaleY;
            break;
          }
        }
      }

      // When preserving aspect ratio, we need to update the corners based on
      // the actual transform rather than the mouse movement
      if (preserveAspectRatio && artifact) {
        const bounds =
          artifact.type === ArtifactTypeEnum.IMG
            ? getImageBounds(artifact.value, transform)
            : getBrushStrokesBounds(artifact.value, transform);

        setResizeHandleCorners(resizeHandleCorners, bounds);
      } else {
        incrementResizeHandleCorners(
          resizeHandle,
          resizeHandleCorners,
          preserveAspectRatio ? 0 : dx,
          preserveAspectRatio ? 0 : dy,
          transform,
        );
      }

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
  layerCanvasRefs,
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
      layerCanvasRefs,
      tempCanvasRefs,
    );
    isDragging.current = false;
    draggedIdx.current = null;
    resizeHandle.current = null;
  };
}
