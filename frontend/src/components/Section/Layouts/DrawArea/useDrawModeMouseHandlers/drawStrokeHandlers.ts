import { getZoom } from "gpuFlow/viewportActions";

import cloneDeep from "lodash/cloneDeep";

import { queueTransformsForSave } from "state/actions/artifacts";

import {
  useBrushStrokes,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
} from "state/definitions";

import { bumpLocalRevisions } from "state/utils/revisions";

import {
  ArtifactTypeEnum,
  BrushStroke,
  BrushStrokeArtifact,
  CanvasPoint,
  DrawAreaBrushShape,
  DrawAreaLayer,
  DrawAreaLayerItemTransformArtifact,
  DrawAreaMode,
  DrawAreaModeEnum,
} from "utils/generatedTypes";

import {
  addNewBrushStrokeToGlobalStateAndDrawLayer,
  drawOneLayer,
  drawStroke,
  getActiveLayerAndCanvas,
  getInverseTransform,
  getXY,
  startNewEraserStroke,
  startNewStroke,
} from "../canvasUtils";

import { filterEraserPath } from "../eraserIntersection";

import { getBrushStrokesBounds, getImageBounds } from "../mouseHandlerUtils";

import {
  CanvasPointXY,
  LayerCanvasesType,
  LocalLayerItemState,
  ResizeHandle,
  ResizeHandleCorners,
  TempCanvasesType,
} from "../types";

import {
  editingOnMouseDown,
  editingOnMouseMove,
  editingOnMouseUp,
  resumeDrawStrokeOnMouseEnter,
  resumeEraserStrokeOnMouseEnter,
} from "./drawEditingHandlers";

export type CanvasMouseHandler = React.MouseEventHandler<HTMLCanvasElement>;

export type DrawingMouseDownHandler = (
  e: React.MouseEvent<HTMLCanvasElement>,
  offsetX?: number | null,
  offsetY?: number | null,
) => void;

export type DrawModeMouseHandlersArgs = {
  layers: Array<DrawAreaLayer>;
  sectionId: string;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  eraserBrushSize: number;
  brushShape: DrawAreaBrushShape;
  isDrawing: React.RefObject<boolean>;
  isDragging: React.RefObject<boolean>;
  draggedIdx: React.RefObject<number | null>;
  lastPos: React.RefObject<CanvasPointXY | null>;
  selectedIdx: React.RefObject<number | null>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  drawThrottleDelay: number;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeLayerIdx: number;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  canvasMode: DrawAreaMode;
  notifyRealtimeDirty: () => void;
  flushRealtimeSnapshot: () => void;
};

export type DrawingMouseDownArgs = {
  layers: Array<DrawAreaLayer>;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  eraserBrushSize: number;
  brushShape: DrawAreaBrushShape;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  isDrawingRef: React.RefObject<boolean>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeLayerIdx: number;
  canvasMode: DrawAreaMode;
  notifyRealtimeDirty: () => void;
};

export type DrawingMouseMoveArgs = {
  layers: Array<DrawAreaLayer>;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  isDrawingRef: React.RefObject<boolean>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeLayerIdx: number;
  canvasMode: DrawAreaMode;
  notifyRealtimeDirty: () => void;
};

export type DrawingMouseUpArgs = {
  sectionId: string;
  layers: Array<DrawAreaLayer>;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  isDrawingRef: React.RefObject<boolean>;
  activeLayerIdx: number;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasMode: DrawAreaMode;
  flushRealtimeSnapshot: () => void;
};

export type EditModeMouseDownArgs = {
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  selectedIdx: React.RefObject<number | null>;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  lastPos: React.RefObject<CanvasPointXY | null>;
  draggedIdx: React.RefObject<number | null>;
  isDragging: React.RefObject<boolean>;
  activeLayerIdx: number;
};

export type EditModeMouseMoveArgs = {
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  isDragging: React.RefObject<boolean>;
  lastPos: React.RefObject<CanvasPointXY | null>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  selectedIdx: React.RefObject<number | null>;
  draggedIdx: React.RefObject<number | null>;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  activeLayerIdx: number;
};

export type EditModeMouseUpArgs = {
  sectionId: string;
  isDragging: React.RefObject<boolean>;
  draggedIdx: React.RefObject<number | null>;
  resizeHandle: React.RefObject<ResizeHandle | null>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  activeLayerIdx: number;
  layers: Array<DrawAreaLayer>;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  flushRealtimeSnapshot: () => void;
};

export type ResizeBounds =
  | ReturnType<typeof getImageBounds>
  | ReturnType<typeof getBrushStrokesBounds>;

export type BrushResizeHandleConfig = {
  widthDirection: -1 | 1;
  heightDirection: -1 | 1;
  anchorX: "minX" | "maxX";
  anchorY: "minY" | "maxY";
};

export const BRUSH_RESIZE_HANDLE_CONFIGS: Array<BrushResizeHandleConfig> = [
  { widthDirection: -1, heightDirection: -1, anchorX: "maxX", anchorY: "maxY" },
  { widthDirection: 1, heightDirection: -1, anchorX: "minX", anchorY: "maxY" },
  { widthDirection: -1, heightDirection: 1, anchorX: "maxX", anchorY: "minY" },
  { widthDirection: 1, heightDirection: 1, anchorX: "minX", anchorY: "minY" },
];

export function useDrawModeMouseHandlers({
  layers,
  sectionId,
  strokeRef,
  eraserStrokeRef,
  prevPointRef,
  eraserBrushSize,
  brushShape,
  isDrawing,
  isDragging,
  draggedIdx,
  lastPos,
  selectedIdx,
  resizeHandle,
  resizeHandleCorners,
  drawThrottleDelay: _drawThrottleDelay,
  layerCanvasRefs,
  tempCanvasRefs,
  draftCanvasRef,
  activeLayerIdx,
  localArtifactTransformsRef,
  canvasMode,
  notifyRealtimeDirty,
  flushRealtimeSnapshot,
}: DrawModeMouseHandlersArgs) {
  void _drawThrottleDelay;

  let onMouseDown: DrawingMouseDownHandler;
  let onMouseMove: CanvasMouseHandler;
  let onMouseUp: CanvasMouseHandler;
  let onMouseEnter: CanvasMouseHandler;

  const activeLayer = layers[activeLayerIdx];

  if (
    canvasMode === DrawAreaModeEnum.edit &&
    !isDragging.current &&
    resizeHandle.current === null
  ) {
    syncLocalTransformsForEditMode(activeLayer, localArtifactTransformsRef);
  }

  const redrawEditMode = () => {
    if (canvasMode !== DrawAreaModeEnum.edit) {
      return;
    }

    if (!activeLayer) {
      return;
    }

    const layerCanvas = layerCanvasRefs.current[activeLayerIdx];
    if (!layerCanvas) {
      return;
    }

    const transforms =
      localArtifactTransformsRef.current.length === activeLayer.elements.length
        ? localArtifactTransformsRef.current.map(
            (local): DrawAreaLayerItemTransformArtifact => ({
              type: ArtifactTypeEnum.DrawAreaLayerItemTransform,
              id: local.transformId,
              value: {
                transform: local.transform,
                eraserStrokes: local.eraserStrokes,
              },
            }),
          )
        : [];

    const handles =
      selectedIdx.current !== null && resizeHandleCorners.current
        ? resizeHandleCorners.current
        : null;

    drawOneLayer({
      layer: activeLayer,
      layerCanvas,
      tempCanvasRefs,
      realTimeTransforms: transforms,
      realTimeResizeHandles: handles,
    });
    notifyRealtimeDirty();
  };

  if (
    canvasMode === DrawAreaModeEnum.draw ||
    canvasMode === DrawAreaModeEnum.erase
  ) {
    onMouseDown = drawingOnMouseDown({
      layers,
      strokeRef,
      eraserStrokeRef,
      eraserBrushSize,
      brushShape,
      prevPointRef,
      isDrawingRef: isDrawing,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      activeLayerIdx,
      canvasMode,
      notifyRealtimeDirty,
    });

    onMouseMove = drawingOnMouseMove({
      layers,
      strokeRef,
      eraserStrokeRef,
      prevPointRef,
      isDrawingRef: isDrawing,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      activeLayerIdx,
      canvasMode,
      notifyRealtimeDirty,
    });

    onMouseUp = drawingOnMouseUp({
      sectionId,
      layers,
      eraserStrokeRef,
      isDrawingRef: isDrawing,
      activeLayerIdx,
      strokeRef,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      canvasMode,
      flushRealtimeSnapshot,
    });

    onMouseEnter = drawingOnMouseEnter({
      canvasMode,
      draftCanvasRef,
      onMouseDown,
      strokeRef,
      eraserStrokeRef,
      prevPointRef,
      isDrawingRef: isDrawing,
      layers,
      layerCanvasRefs,
      tempCanvasRefs,
      activeLayerIdx,
      notifyRealtimeDirty,
    });
  } else {
    const handleMouseDown = editingOnMouseDown({
      layerCanvasRefs,
      selectedIdx,
      localArtifactTransformsRef,
      resizeHandle,
      resizeHandleCorners,
      lastPos,
      draggedIdx,
      isDragging,
      activeLayerIdx,
    });

    const handleMouseMove = editingOnMouseMove({
      layerCanvasRefs,
      isDragging,
      lastPos,
      resizeHandle,
      resizeHandleCorners,
      selectedIdx,
      draggedIdx,
      localArtifactTransformsRef,
      activeLayerIdx,
    });

    const handleMouseUp = editingOnMouseUp({
      sectionId,
      layers,
      isDragging,
      draggedIdx,
      resizeHandle,
      resizeHandleCorners,
      activeLayerIdx,
      localArtifactTransformsRef,
      layerCanvasRefs,
      tempCanvasRefs,
      flushRealtimeSnapshot,
    });

    onMouseDown = (e) => {
      const shouldRedraw = handleMouseDown(e);
      if (shouldRedraw) {
        redrawEditMode();
      }
    };

    onMouseMove = (e) => {
      const shouldRedraw = handleMouseMove(e);
      if (shouldRedraw) {
        redrawEditMode();
      }
    };

    onMouseUp = () => {
      handleMouseUp();
    };

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

export function syncLocalTransformsForEditMode(
  activeLayer: DrawAreaLayer | undefined,
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>,
) {
  if (!activeLayer) {
    localArtifactTransformsRef.current = [];
    return;
  }

  const transformsState = useDrawAreaLayerItemTransform.getState().x;

  const needsResync =
    localArtifactTransformsRef.current.length !== activeLayer.elements.length ||
    activeLayer.elements.some((element, idx) => {
      const local = localArtifactTransformsRef.current[idx];
      const artifact = transformsState[element.transformId];
      if (!local || !artifact) {
        return true;
      }
      if (local.transformId !== element.transformId) {
        return true;
      }
      return local.eraserStrokes.length !== artifact.value.eraserStrokes.length;
    });

  if (!needsResync) {
    return;
  }

  localArtifactTransformsRef.current = activeLayer.elements.map((element) => {
    const artifact = transformsState[element.transformId];
    const defaultTransform: LocalLayerItemState["transform"] = [
      1, 0, 0, 1, 0, 0,
    ];
    return {
      transformId: element.transformId,
      dataPath: element.dataPath,
      type: element.type,
      transform: artifact
        ? cloneDeep(artifact.value.transform)
        : [...defaultTransform],
      eraserStrokes: artifact ? cloneDeep(artifact.value.eraserStrokes) : [],
    };
  });
}

export function drawingOnMouseDown({
  layers,
  strokeRef,
  eraserStrokeRef,
  eraserBrushSize,
  brushShape,
  prevPointRef,
  isDrawingRef,
  layerCanvasRefs,
  tempCanvasRefs,
  draftCanvasRef,
  activeLayerIdx,
  canvasMode,
  notifyRealtimeDirty,
}: DrawingMouseDownArgs): DrawingMouseDownHandler {
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
      drawOneLayer({
        layer,
        layerCanvas,
        tempCanvasRefs,
        realTimeEraserStroke: eraserStrokeRef.current,
      });
      notifyRealtimeDirty();
    } else {
      strokeRef.current = startNewStroke(draftCanvasRef, point);
      notifyRealtimeDirty();
    }
    prevPointRef.current = point;
  };
}

export function drawingOnMouseMove({
  layers,
  strokeRef,
  eraserStrokeRef,
  prevPointRef,
  isDrawingRef,
  layerCanvasRefs,
  tempCanvasRefs,
  draftCanvasRef,
  activeLayerIdx,
  canvasMode,
  notifyRealtimeDirty,
}: DrawingMouseMoveArgs): CanvasMouseHandler {
  return (e) => {
    if (!isDrawingRef.current) {
      return;
    }
    const point = getXY(e);
    if (
      handleEraserMouseMove({
        canvasMode,
        eraserStrokeRef,
        point,
        prevPointRef,
        layers,
        layerCanvasRefs,
        activeLayerIdx,
        tempCanvasRefs,
        notifyRealtimeDirty,
      })
    ) {
      return;
    }

    handleDrawMouseMove({
      canvasMode,
      draftCanvasRef,
      strokeRef,
      prevPointRef,
      point,
      notifyRealtimeDirty,
    });
  };
}

export function handleEraserMouseMove({
  canvasMode,
  eraserStrokeRef,
  point,
  prevPointRef,
  layers,
  layerCanvasRefs,
  activeLayerIdx,
  tempCanvasRefs,
  notifyRealtimeDirty,
}: {
  canvasMode: DrawAreaMode;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  point: CanvasPoint;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  layers: Array<DrawAreaLayer>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  activeLayerIdx: number;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  notifyRealtimeDirty: () => void;
}): boolean {
  const activeEraserStroke = eraserStrokeRef.current;
  if (canvasMode !== DrawAreaModeEnum.erase || !activeEraserStroke) {
    return false;
  }

  activeEraserStroke.points.push(point);
  prevPointRef.current = point;

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

export function handleDrawMouseMove({
  canvasMode,
  draftCanvasRef,
  strokeRef,
  prevPointRef,
  point,
  notifyRealtimeDirty,
}: {
  canvasMode: DrawAreaMode;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  point: CanvasPoint;
  notifyRealtimeDirty: () => void;
}) {
  const draftCanvas = draftCanvasRef.current;
  const activeStroke = strokeRef.current;
  const previousPoint = prevPointRef.current;

  if (
    canvasMode !== DrawAreaModeEnum.draw ||
    !draftCanvas ||
    !activeStroke ||
    !previousPoint
  ) {
    return;
  }

  drawStroke(draftCanvas, previousPoint, point);
  activeStroke.value.points.push(point);
  prevPointRef.current = point;
  notifyRealtimeDirty();
}

export function drawingOnMouseUp({
  sectionId,
  layers,
  eraserStrokeRef,
  isDrawingRef,
  activeLayerIdx,
  strokeRef,
  layerCanvasRefs,
  tempCanvasRefs,
  draftCanvasRef,
  canvasMode,
  flushRealtimeSnapshot,
}: DrawingMouseUpArgs): () => void {
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
      const touchedTransformIds = finishEraserStroke({
        sectionId,
        layer,
        layerCanvas,
        eraserStrokeRef,
        tempCanvasRefs,
      });
      if (touchedTransformIds.length > 0) {
        queueTransformsForSave(touchedTransformIds);
      }
      flushRealtimeSnapshot();
      return;
    }

    if (canvasMode === DrawAreaModeEnum.draw) {
      if (!strokeRef.current || !draftCanvasRef.current) {
        return;
      }
      addNewBrushStrokeToGlobalStateAndDrawLayer({
        sectionId,
        layerIdx: activeLayerIdx,
        stroke: strokeRef.current,
        layer,
        layerCanvas,
        tempCanvasRefs,
        draftCanvas: draftCanvasRef.current,
      });
    }
    flushRealtimeSnapshot();
  };
}

export function finishEraserStroke({
  sectionId,
  layer,
  layerCanvas,
  eraserStrokeRef,
  tempCanvasRefs,
}: {
  sectionId: string;
  layer: DrawAreaLayer;
  layerCanvas: HTMLCanvasElement;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
}): Array<string> {
  const eraserStroke = eraserStrokeRef.current;
  if (!eraserStroke) {
    return [];
  }

  const images = useDecodedImages.getState().x;
  const brushStrokes = useBrushStrokes.getState().x;
  const touchedTransformIds = new Set<string>();

  useDrawAreaLayerItemTransform.setState((state) => {
    const changedIds: Array<string> = [];
    for (const element of layer.elements) {
      const artifact = state.x[element.transformId];
      if (!artifact) {
        continue;
      }

      const bounds = getErasableBounds({
        element,
        transform: artifact.value.transform,
        images,
        brushStrokes,
      });
      const intersectingPath = filterEraserPath(
        eraserStroke.points,
        eraserStroke.lineWidth,
        eraserStroke.lineCap,
        bounds,
      );
      if (intersectingPath.length === 0) {
        continue;
      }

      artifact.value.eraserStrokes.push({
        ...eraserStroke,
        points: intersectingPath,
        transform: getInverseTransform(artifact.value.transform),
      });
      touchedTransformIds.add(element.transformId);
      changedIds.push(element.transformId);
    }

    if (changedIds.length === 0) {
      return;
    }

    const revisions = bumpLocalRevisions(
      {
        revisionById: state.revisionById,
        localRevisionById: state.localRevisionById,
      },
      changedIds,
      sectionId,
    );
    state.revisionById = revisions.revisionById;
    state.localRevisionById = revisions.localRevisionById;
  });

  eraserStrokeRef.current = null;
  drawOneLayer({ layer, layerCanvas, tempCanvasRefs });
  return Array.from(touchedTransformIds);
}

export function getErasableBounds({
  element,
  transform,
  images,
  brushStrokes,
}: {
  element: DrawAreaLayer["elements"][number];
  transform: LocalLayerItemState["transform"];
  images: ReturnType<typeof useDecodedImages.getState>["x"];
  brushStrokes: ReturnType<typeof useBrushStrokes.getState>["x"];
}): ResizeBounds | undefined {
  if (element.type === ArtifactTypeEnum.Image) {
    const image = images[element.dataPath];
    return image ? getImageBounds(image, transform) : undefined;
  }

  if (element.type === ArtifactTypeEnum.BrushStroke) {
    const brushStroke = brushStrokes[element.dataPath];
    return brushStroke
      ? getBrushStrokesBounds(brushStroke.value, transform)
      : undefined;
  }

  return undefined;
}

export function drawingOnMouseEnter({
  canvasMode,
  draftCanvasRef,
  onMouseDown,
  strokeRef,
  eraserStrokeRef,
  prevPointRef,
  isDrawingRef,
  layers,
  layerCanvasRefs,
  tempCanvasRefs,
  activeLayerIdx,
  notifyRealtimeDirty,
}: {
  canvasMode: DrawAreaMode;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onMouseDown: (
    e: React.MouseEvent<HTMLCanvasElement>,
    offsetX: number | null,
    offsetY: number | null,
  ) => void;
  strokeRef: React.RefObject<BrushStrokeArtifact | null>;
  eraserStrokeRef: React.RefObject<BrushStroke | null>;
  prevPointRef: React.RefObject<CanvasPoint | null>;
  isDrawingRef: React.RefObject<boolean>;
  layers: Array<DrawAreaLayer>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  activeLayerIdx: number;
  notifyRealtimeDirty: () => void;
}): CanvasMouseHandler {
  return (e) => {
    const draftCanvas = draftCanvasRef.current;
    if (!draftCanvas || e.buttons !== 1) {
      return;
    }

    const { x: offsetX, y: offsetY } = getCanvasMousePoint(draftCanvas, e);
    const point: CanvasPoint = [offsetX, offsetY];

    if (
      resumeDrawStrokeOnMouseEnter({
        canvasMode,
        point,
        draftCanvas,
        onMouseDown,
        strokeRef,
        prevPointRef,
        isDrawingRef,
        notifyRealtimeDirty,
        event: e,
      })
    ) {
      return;
    }

    if (
      resumeEraserStrokeOnMouseEnter({
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
        event: e,
      })
    ) {
      return;
    }

    onMouseDown(e, offsetX, offsetY);
  };
}

export function getCanvasMousePoint(
  canvas: HTMLCanvasElement,
  event: React.MouseEvent<HTMLCanvasElement>,
): CanvasPointXY {
  const rect = canvas.getBoundingClientRect();
  const zoom = getZoom();
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom,
  };
}

export function pushBreakPoint(
  points: Array<CanvasPoint | "BREAK">,
  point: CanvasPoint,
) {
  const lastPoint = points[points.length - 1];
  if (points.length > 0 && lastPoint !== "BREAK") {
    points.push("BREAK");
  }
  points.push(point);
}
