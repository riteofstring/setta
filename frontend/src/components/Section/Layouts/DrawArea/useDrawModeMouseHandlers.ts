import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
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
  RESIZE_HANDLE_SIZE,
  setGlobalArtifactTransformsAndDrawAllLayers,
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
  CanvasPointXY,
  LayerCanvasesType,
  LocalLayerItemState,
  ResizeHandle,
  ResizeHandleCorners,
  TempCanvasesType,
} from "./types";

type CanvasMouseHandler = React.MouseEventHandler<HTMLCanvasElement>;

type DrawingMouseDownHandler = (
  e: React.MouseEvent<HTMLCanvasElement>,
  offsetX?: number | null,
  offsetY?: number | null,
) => void;

type DrawModeMouseHandlersArgs = {
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

type DrawingMouseDownArgs = {
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

type DrawingMouseMoveArgs = {
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

type DrawingMouseUpArgs = {
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

type EditModeMouseDownArgs = {
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

type EditModeMouseMoveArgs = {
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

type EditModeMouseUpArgs = {
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

type ResizeBounds =
  | ReturnType<typeof getImageBounds>
  | ReturnType<typeof getBrushStrokesBounds>;

type BrushResizeHandleConfig = {
  widthDirection: -1 | 1;
  heightDirection: -1 | 1;
  anchorX: "minX" | "maxX";
  anchorY: "minY" | "maxY";
};

const BRUSH_RESIZE_HANDLE_CONFIGS: Array<BrushResizeHandleConfig> = [
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

    drawOneLayer(
      activeLayer,
      layerCanvas,
      tempCanvasRefs,
      transforms,
      handles,
      null,
    );
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

function syncLocalTransformsForEditMode(
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

function drawingOnMouseDown({
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
      drawOneLayer(
        layer,
        layerCanvas,
        tempCanvasRefs,
        [],
        null,
        eraserStrokeRef.current,
      );
      notifyRealtimeDirty();
    } else {
      strokeRef.current = startNewStroke(draftCanvasRef, point);
      notifyRealtimeDirty();
    }
    prevPointRef.current = point;
  };
}

function drawingOnMouseMove({
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
      notifyRealtimeDirty();
    } else if (
      canvasMode === DrawAreaModeEnum.draw &&
      draftCanvasRef.current &&
      strokeRef.current &&
      prevPointRef.current
    ) {
      drawStroke(draftCanvasRef.current, prevPointRef.current, point);
      strokeRef.current.value.points.push(point);
      prevPointRef.current = point;
      notifyRealtimeDirty();
    }
  };
}

function drawingOnMouseUp({
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
      addNewBrushStrokeToGlobalStateAndDrawLayer(
        sectionId,
        activeLayerIdx,
        strokeRef.current,
        layer,
        layerCanvas,
        tempCanvasRefs,
        draftCanvasRef.current,
      );
    }
    flushRealtimeSnapshot();
  };
}

function finishEraserStroke({
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
  drawOneLayer(layer, layerCanvas, tempCanvasRefs, [], null, null);
  return Array.from(touchedTransformIds);
}

function getErasableBounds({
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

function drawingOnMouseEnter({
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

function getCanvasMousePoint(
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

function pushBreakPoint(
  points: Array<CanvasPoint | "BREAK">,
  point: CanvasPoint,
) {
  const lastPoint = points[points.length - 1];
  if (points.length > 0 && lastPoint !== "BREAK") {
    points.push("BREAK");
  }
  points.push(point);
}

function resumeDrawStrokeOnMouseEnter({
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

function resumeEraserStrokeOnMouseEnter({
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

  drawOneLayer(
    layer,
    layerCanvas,
    tempCanvasRefs,
    [],
    null,
    activeEraserStroke,
  );
  notifyRealtimeDirty();
  return true;
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

function tryStartResizeHandleDrag({
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

function findResizeHandleIndex(
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

function resolveLocalSelectionAtPoint({
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

function getLocalSelectionBounds({
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

function isPointInBounds(x: number, y: number, bounds: ResizeBounds): boolean {
  return (
    x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
  );
}

function clearEditSelectionState({
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

function editingOnMouseMove({
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

function hasActiveEditInteraction({
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

function hasActiveResizeInteraction({
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

function getMouseDelta(
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

function moveDraggedSelection({
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

function resizeSelectedArtifact({
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

function resizeSelectedImage({
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

function resizeSelectedBrushStroke({
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

function resolveSignedMagnitude(value: number, magnitude: number): number {
  return value > 0 ? magnitude : -magnitude;
}

function flipDerivedAspectRatioDelta(
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

function applyScaleAroundAnchor(
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

function updateResizeHandleCornersAfterMove({
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

function editingOnMouseUp({
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
    setGlobalArtifactTransformsAndDrawAllLayers(
      sectionId,
      layers,
      activeLayerIdx,
      localArtifactTransformsRef,
      resizeHandleCorners,
      layerCanvasRefs,
      tempCanvasRefs,
    );
    isDragging.current = false;
    draggedIdx.current = null;
    resizeHandle.current = null;
    flushRealtimeSnapshot();
  };
}
