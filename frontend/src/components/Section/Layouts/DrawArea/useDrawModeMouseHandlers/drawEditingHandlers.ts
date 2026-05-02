import { useBrushStrokes, useDecodedImages } from "state/definitions";

import {
  ArtifactTypeEnum,
  BrushStroke,
  BrushStrokeArtifact,
  CanvasPoint,
  DrawAreaLayer,
  DrawAreaMode,
  DrawAreaModeEnum,
} from "utils/generatedTypes";

import {
  RESIZE_HANDLE_SIZE,
  drawOneLayer,
  drawStroke,
  getActiveLayerAndCanvas,
  setGlobalArtifactTransformsAndDrawAllLayers,
} from "./canvasUtils";

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
  CanvasPointXY,
  LayerCanvasesType,
  LocalLayerItemState,
  ResizeHandle,
  ResizeHandleCorners,
  TempCanvasesType,
} from "./types";

import {
  BRUSH_RESIZE_HANDLE_CONFIGS,
  DrawingMouseDownHandler,
  EditModeMouseDownArgs,
  EditModeMouseMoveArgs,
  EditModeMouseUpArgs,
  ResizeBounds,
  getCanvasMousePoint,
  pushBreakPoint,
} from "./drawStrokeHandlers";

export function resumeDrawStrokeOnMouseEnter({
  canvasMode,
  point,
  draftCanvas,
  onMouseDown,
  strokeRef,
  prevPointRef,
  isDrawingRef,
  notifyRealtimeDirty,
  event,
}: {
  canvasMode: DrawAreaMode;
  point: CanvasPoint;
  draftCanvas: HTMLCanvasElement;
  onMouseDown: DrawingMouseDownHandler;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  isDrawingRef: React.RefObject<boolean>;
  notifyRealtimeDirty: () => void;
  event: React.MouseEvent<HTMLCanvasElement>;
}): boolean {
  if (canvasMode !== DrawAreaModeEnum.draw) {
    return false;
  }

  const activeStroke = strokeRef.current;
  if (!activeStroke) {
    onMouseDown(event, point[0], point[1]);
    return true;
  }

  pushBreakPoint(activeStroke.value.points, point);
  drawStroke(draftCanvas, point, point);
  prevPointRef.current = point;
  isDrawingRef.current = true;
  notifyRealtimeDirty();
  return true;
}

export function resumeEraserStrokeOnMouseEnter({
  canvasMode,
  point,
  onMouseDown,
  eraserStrokeRef,
  prevPointRef,
  isDrawingRef,
  layers,
  layerCanvasRefs,
  tempCanvasRefs,
  activeLayerIdx,
  notifyRealtimeDirty,
  event,
}: {
  canvasMode: DrawAreaMode;
  point: CanvasPoint;
  onMouseDown: DrawingMouseDownHandler;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  isDrawingRef: React.RefObject<boolean>;
  layers: Array<DrawAreaLayer>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  activeLayerIdx: number;
  notifyRealtimeDirty: () => void;
  event: React.MouseEvent<HTMLCanvasElement>;
}): boolean {
  if (canvasMode !== DrawAreaModeEnum.erase) {
    return false;
  }

  const activeEraserStroke = eraserStrokeRef.current;
  if (!activeEraserStroke) {
    onMouseDown(event, point[0], point[1]);
    return true;
  }

  pushBreakPoint(activeEraserStroke.points, point);
  prevPointRef.current = point;
  isDrawingRef.current = true;

  const [layer, layerCanvas] = getActiveLayerAndCanvas(
    layers,
    layerCanvasRefs,
    activeLayerIdx,
  );
  if (!layer || !layerCanvas) {
    return true;
  }

  drawOneLayer({
    layer,
    layerCanvas,
    tempCanvasRefs,
    realTimeEraserStroke: activeEraserStroke,
  });
  notifyRealtimeDirty();
  return true;
}

export function editingOnMouseDown({
  layerCanvasRefs,
  selectedIdx,
  localArtifactTransformsRef,
  resizeHandle,
  resizeHandleCorners,
  lastPos,
  draggedIdx,
  isDragging,
  activeLayerIdx,
}: EditModeMouseDownArgs): (
  event: React.MouseEvent<HTMLCanvasElement>,
) => boolean {
  return (e) => {
    const canvas = layerCanvasRefs.current[activeLayerIdx];
    if (!canvas) {
      return false;
    }
    const { x, y } = getCanvasMousePoint(canvas, e);

    const localTransforms = localArtifactTransformsRef.current;
    if (
      tryStartResizeHandleDrag({
        x,
        y,
        selectedIdx,
        localTransforms,
        resizeHandle,
        resizeHandleCorners,
        lastPos,
      })
    ) {
      return true;
    }

    const selection = resolveLocalSelectionAtPoint({
      x,
      y,
      localTransforms,
      images: useDecodedImages.getState().x,
      brushStrokes: useBrushStrokes.getState().x,
    });
    if (!selection) {
      return clearEditSelectionState({
        selectedIdx,
        resizeHandleCorners,
        isDragging,
        draggedIdx,
        resizeHandle,
        lastPos,
      });
    }

    setResizeHandleCorners(resizeHandleCorners, selection.bounds);
    isDragging.current = true;
    draggedIdx.current = selection.index;
    selectedIdx.current = selection.index;
    lastPos.current = { x, y };
    return true;
  };
}

export function tryStartResizeHandleDrag({
  x,
  y,
  selectedIdx,
  localTransforms,
  resizeHandle,
  resizeHandleCorners,
  lastPos,
}: {
  x: number;
  y: number;
  selectedIdx: React.RefObject<number | null>;
  localTransforms: Array<LocalLayerItemState>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  lastPos: React.RefObject<CanvasPointXY | null>;
}): boolean {
  const selectedIndex = selectedIdx.current;
  if (selectedIndex === null || !resizeHandleCorners.current) {
    return false;
  }

  const local = localTransforms[selectedIndex];
  if (!local) {
    return false;
  }

  const handleIdx = findResizeHandleIndex(x, y, resizeHandleCorners.current);
  if (handleIdx === null) {
    return false;
  }

  resizeHandle.current = {
    idx: handleIdx,
    wasPositive: {
      xScale: local.transform[0] >= 0,
      yScale: local.transform[3] >= 0,
    },
  };
  lastPos.current = { x, y };
  return true;
}

export function findResizeHandleIndex(
  x: number,
  y: number,
  corners: ResizeHandleCorners,
): number | null {
  for (let i = 0; i < corners.length; i += 1) {
    const corner = corners[i];
    if (
      Math.abs(x - corner.x) <= RESIZE_HANDLE_SIZE / 2 &&
      Math.abs(y - corner.y) <= RESIZE_HANDLE_SIZE / 2
    ) {
      return i;
    }
  }

  return null;
}

export function resolveLocalSelectionAtPoint({
  x,
  y,
  localTransforms,
  images,
  brushStrokes,
}: {
  x: number;
  y: number;
  localTransforms: Array<LocalLayerItemState>;
  images: ReturnType<typeof useDecodedImages.getState>["x"];
  brushStrokes: ReturnType<typeof useBrushStrokes.getState>["x"];
}): { index: number; bounds: ResizeBounds } | null {
  for (let i = localTransforms.length - 1; i >= 0; i -= 1) {
    const local = localTransforms[i];
    if (!local) {
      continue;
    }

    const bounds = getLocalSelectionBounds({
      x,
      y,
      local,
      images,
      brushStrokes,
    });
    if (bounds) {
      return { index: i, bounds };
    }
  }

  return null;
}

export function getLocalSelectionBounds({
  x,
  y,
  local,
  images,
  brushStrokes,
}: {
  x: number;
  y: number;
  local: LocalLayerItemState;
  images: ReturnType<typeof useDecodedImages.getState>["x"];
  brushStrokes: ReturnType<typeof useBrushStrokes.getState>["x"];
}): ResizeBounds | null {
  if (local.type === ArtifactTypeEnum.Image) {
    const image = images[local.dataPath];
    if (!image) {
      return null;
    }
    const bounds = getImageBounds(image, local.transform);
    return isPointInBounds(x, y, bounds) ? bounds : null;
  }

  if (local.type === ArtifactTypeEnum.BrushStroke) {
    const brushStrokeArtifact = brushStrokes[local.dataPath];
    if (!brushStrokeArtifact) {
      return null;
    }
    if (!detectHit(x, y, brushStrokeArtifact, local.transform)) {
      return null;
    }
    return getBrushStrokesBounds(brushStrokeArtifact.value, local.transform);
  }

  return null;
}

export function isPointInBounds(
  x: number,
  y: number,
  bounds: ResizeBounds,
): boolean {
  return (
    x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
  );
}

export function clearEditSelectionState({
  selectedIdx,
  resizeHandleCorners,
  isDragging,
  draggedIdx,
  resizeHandle,
  lastPos,
}: {
  selectedIdx: React.RefObject<number | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  isDragging: React.RefObject<boolean>;
  draggedIdx: React.RefObject<number | null>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  lastPos: React.RefObject<CanvasPointXY | null>;
}): boolean {
  const hadSelection = selectedIdx.current !== null;
  selectedIdx.current = null;
  resizeHandleCorners.current = null;
  isDragging.current = false;
  draggedIdx.current = null;
  resizeHandle.current = null;
  lastPos.current = null;
  return hadSelection;
}

export function editingOnMouseMove({
  layerCanvasRefs,
  isDragging,
  lastPos,
  resizeHandle,
  resizeHandleCorners,
  selectedIdx,
  draggedIdx,
  localArtifactTransformsRef,
  activeLayerIdx,
}: EditModeMouseMoveArgs): (
  event: React.MouseEvent<HTMLCanvasElement>,
) => boolean {
  return (e) => {
    if (
      !hasActiveEditInteraction({
        isDragging,
        draggedIdx,
        resizeHandle,
        selectedIdx,
      })
    ) {
      return false;
    }

    const canvas = layerCanvasRefs.current[activeLayerIdx];
    if (!canvas) {
      return false;
    }
    const nextPos = getCanvasMousePoint(canvas, e);
    const delta = getMouseDelta(lastPos, nextPos);
    if (!delta) {
      return false;
    }

    if (
      moveDraggedSelection({
        draggedIdx,
        localArtifactTransformsRef,
        resizeHandleCorners,
        lastPos,
        nextPos,
        dx: delta.dx,
        dy: delta.dy,
      })
    ) {
      return true;
    }

    if (
      !hasActiveResizeInteraction({
        resizeHandle,
        selectedIdx,
        resizeHandleCorners,
      })
    ) {
      return false;
    }

    const preserveAspectRatio = e.shiftKey;
    const latestBounds = resizeSelectedArtifact({
      selectedIdx,
      localArtifactTransformsRef,
      resizeHandle: resizeHandle.current,
      resizeHandleCorners,
      dx: delta.dx,
      dy: delta.dy,
      preserveAspectRatio,
    });
    if (latestBounds === false) {
      return false;
    }

    updateResizeHandleCornersAfterMove({
      resizeHandle,
      resizeHandleCorners,
      preserveAspectRatio,
      latestBounds,
      dx: delta.dx,
      dy: delta.dy,
    });
    lastPos.current = nextPos;
    return true;
  };
}

export function hasActiveEditInteraction({
  isDragging,
  draggedIdx,
  resizeHandle,
  selectedIdx,
}: {
  isDragging: React.RefObject<boolean>;
  draggedIdx: React.RefObject<number | null>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  selectedIdx: React.RefObject<number | null>;
}): boolean {
  return (
    (isDragging.current && draggedIdx.current !== null) ||
    (resizeHandle.current !== null && selectedIdx.current !== null)
  );
}

export function hasActiveResizeInteraction({
  resizeHandle,
  selectedIdx,
  resizeHandleCorners,
}: {
  resizeHandle: React.RefObject<ResizeHandle | null>;
  selectedIdx: React.RefObject<number | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
}): boolean {
  return (
    resizeHandle.current !== null &&
    selectedIdx.current !== null &&
    resizeHandleCorners.current !== null
  );
}

export function getMouseDelta(
  lastPos: React.RefObject<CanvasPointXY | null>,
  nextPos: CanvasPointXY,
): { dx: number; dy: number } | null {
  const previousPos = lastPos.current;
  if (!previousPos) {
    lastPos.current = nextPos;
    return null;
  }

  return {
    dx: nextPos.x - previousPos.x,
    dy: nextPos.y - previousPos.y,
  };
}

export function moveDraggedSelection({
  draggedIdx,
  localArtifactTransformsRef,
  resizeHandleCorners,
  lastPos,
  nextPos,
  dx,
  dy,
}: {
  draggedIdx: React.RefObject<number | null>;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  lastPos: React.RefObject<CanvasPointXY | null>;
  nextPos: CanvasPointXY;
  dx: number;
  dy: number;
}): boolean {
  const draggedIndex = draggedIdx.current;
  if (draggedIndex === null) {
    return false;
  }

  const local = localArtifactTransformsRef.current[draggedIndex];
  if (!local || !resizeHandleCorners.current) {
    return false;
  }

  local.transform[4] += dx;
  local.transform[5] += dy;
  resizeHandleCorners.current = resizeHandleCorners.current.map((corner) => ({
    x: corner.x + dx,
    y: corner.y + dy,
  })) as ResizeHandleCorners;
  lastPos.current = nextPos;
  return true;
}

export function resizeSelectedArtifact({
  selectedIdx,
  localArtifactTransformsRef,
  resizeHandle,
  resizeHandleCorners,
  dx,
  dy,
  preserveAspectRatio,
}: {
  selectedIdx: React.RefObject<number | null>;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  resizeHandle: ResizeHandle;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  dx: number;
  dy: number;
  preserveAspectRatio: boolean;
}): ResizeBounds | null | false {
  const selectedIndex = selectedIdx.current;
  if (selectedIndex === null || !resizeHandleCorners.current) {
    return false;
  }

  const local = localArtifactTransformsRef.current[selectedIndex];
  if (!local) {
    return false;
  }

  if (local.type === ArtifactTypeEnum.Image) {
    return resizeSelectedImage({
      local,
      resizeHandle,
      dx,
      dy,
      preserveAspectRatio,
    });
  }

  if (local.type === ArtifactTypeEnum.BrushStroke) {
    return resizeSelectedBrushStroke({
      local,
      resizeHandleIdx: resizeHandle.idx,
      resizeHandleCorners,
      dx,
      dy,
      preserveAspectRatio,
    });
  }

  return false;
}

export function resizeSelectedImage({
  local,
  resizeHandle,
  dx,
  dy,
  preserveAspectRatio,
}: {
  local: LocalLayerItemState;
  resizeHandle: ResizeHandle;
  dx: number;
  dy: number;
  preserveAspectRatio: boolean;
}): ResizeBounds | null | false {
  const image = useDecodedImages.getState().x[local.dataPath];
  if (!image) {
    return false;
  }

  const scaledWidth = getScaledWidth(image, local.transform);
  const scaledHeight = getScaledHeight(image, local.transform);
  const nextDelta = preserveAspectRatio
    ? resolveAspectRatioResizeDeltas({
        dx,
        dy,
        aspectRatio: scaledWidth / scaledHeight,
        resizeHandleIdx: resizeHandle.idx,
      })
    : { dx, dy };

  getImageHandleBehaviorFn(
    resizeHandle.idx,
    resizeHandle.wasPositive.xScale,
    resizeHandle.wasPositive.yScale,
  )(local.transform, scaledWidth, scaledHeight, nextDelta.dx, nextDelta.dy, {
    value: image,
  });

  return preserveAspectRatio ? getImageBounds(image, local.transform) : null;
}

export function resizeSelectedBrushStroke({
  local,
  resizeHandleIdx,
  resizeHandleCorners,
  dx,
  dy,
  preserveAspectRatio,
}: {
  local: LocalLayerItemState;
  resizeHandleIdx: number;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  dx: number;
  dy: number;
  preserveAspectRatio: boolean;
}): ResizeBounds | null | false {
  const brushStrokeArtifact = useBrushStrokes.getState().x[local.dataPath];
  if (!brushStrokeArtifact || !resizeHandleCorners.current) {
    return false;
  }

  applyBrushHandleResize({
    transform: local.transform,
    bounds: getPseudoBoundsFromResizeHandleCorners(resizeHandleCorners),
    resizeHandleIdx,
    dx,
    dy,
    preserveAspectRatio,
  });

  return preserveAspectRatio
    ? getBrushStrokesBounds(brushStrokeArtifact.value, local.transform)
    : null;
}

export function resolveAspectRatioResizeDeltas({
  dx,
  dy,
  aspectRatio,
  resizeHandleIdx,
}: {
  dx: number;
  dy: number;
  aspectRatio: number;
  resizeHandleIdx: number;
}): { dx: number; dy: number } {
  const epsilon = 0.001;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < epsilon && absDy < epsilon) {
    return { dx, dy };
  }

  if (absDx < epsilon) {
    return {
      dx: flipDerivedAspectRatioDelta(
        resizeHandleIdx,
        resolveSignedMagnitude(dy, absDy * aspectRatio),
      ),
      dy,
    };
  }

  const derivedY = flipDerivedAspectRatioDelta(
    resizeHandleIdx,
    resolveSignedMagnitude(dx, absDx / aspectRatio),
  );
  if (absDy < epsilon || absDx > absDy) {
    return { dx, dy: derivedY };
  }

  return {
    dx: flipDerivedAspectRatioDelta(
      resizeHandleIdx,
      resolveSignedMagnitude(dy, absDy * aspectRatio),
    ),
    dy,
  };
}

export function resolveSignedMagnitude(
  value: number,
  magnitude: number,
): number {
  return value > 0 ? magnitude : -magnitude;
}

export function flipDerivedAspectRatioDelta(
  resizeHandleIdx: number,
  value: number,
): number {
  return resizeHandleIdx === 1 || resizeHandleIdx === 2 ? -value : value;
}

export function applyBrushHandleResize({
  transform,
  bounds,
  resizeHandleIdx,
  dx,
  dy,
  preserveAspectRatio,
}: {
  transform: LocalLayerItemState["transform"];
  bounds: ResizeBounds;
  resizeHandleIdx: number;
  dx: number;
  dy: number;
  preserveAspectRatio: boolean;
}) {
  const config =
    BRUSH_RESIZE_HANDLE_CONFIGS[resizeHandleIdx] ??
    BRUSH_RESIZE_HANDLE_CONFIGS[0];
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  let scaleX = (width + dx * config.widthDirection) / width;
  let scaleY = (height + dy * config.heightDirection) / height;

  if (preserveAspectRatio) {
    const uniformScale = Math.max(scaleX, scaleY);
    scaleX = uniformScale;
    scaleY = uniformScale;
  }

  applyScaleAroundAnchor(
    transform,
    bounds[config.anchorX],
    bounds[config.anchorY],
    scaleX,
    scaleY,
  );
}

export function applyScaleAroundAnchor(
  transform: LocalLayerItemState["transform"],
  anchorX: number,
  anchorY: number,
  scaleX: number,
  scaleY: number,
) {
  transform[0] = preventExactZero(transform[0] * scaleX);
  transform[3] = preventExactZero(transform[3] * scaleY);
  transform[4] = anchorX - (anchorX - transform[4]) * scaleX;
  transform[5] = anchorY - (anchorY - transform[5]) * scaleY;
}

export function updateResizeHandleCornersAfterMove({
  resizeHandle,
  resizeHandleCorners,
  preserveAspectRatio,
  latestBounds,
  dx,
  dy,
}: {
  resizeHandle: React.RefObject<ResizeHandle | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  preserveAspectRatio: boolean;
  latestBounds: ResizeBounds | null;
  dx: number;
  dy: number;
}) {
  if (preserveAspectRatio && latestBounds) {
    setResizeHandleCorners(resizeHandleCorners, latestBounds);
    return;
  }

  incrementResizeHandleCorners(
    resizeHandle,
    resizeHandleCorners,
    preserveAspectRatio ? 0 : dx,
    preserveAspectRatio ? 0 : dy,
  );
}

export function editingOnMouseUp({
  sectionId,
  isDragging,
  draggedIdx,
  resizeHandle,
  resizeHandleCorners,
  activeLayerIdx,
  layers,
  localArtifactTransformsRef,
  layerCanvasRefs,
  tempCanvasRefs,
  flushRealtimeSnapshot,
}: EditModeMouseUpArgs): () => void {
  return () => {
    // have to update the corners
    // in case the x or y scaling went from positive to negative or vice versa
    if (resizeHandleCorners.current) {
      setResizeHandleCorners(
        resizeHandleCorners,
        getTrueBoundsFromResizeHandleCorners(resizeHandleCorners),
      );
    }
    setGlobalArtifactTransformsAndDrawAllLayers({
      sectionId,
      layers,
      activeLayerIdx,
      localArtifactTransformsRef,
      resizeHandleCorners,
      layerCanvasRefs,
      tempCanvasRefs,
    });
    isDragging.current = false;
    draggedIdx.current = null;
    resizeHandle.current = null;
    flushRealtimeSnapshot();
  };
}
