import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import cloneDeep from "lodash/cloneDeep";
import { queueTransformsForSave } from "state/actions/artifacts";
import {
  useBrushStrokes,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
} from "state/stores/artifactStores";
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
  lastPos: React.RefObject<CanvasPointXY | null>,
  selectedIdx: React.RefObject<number | null>,
  resizeHandle: React.RefObject<ResizeHandle | null>,
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>,
  drawThrottleDelay: number,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  activeLayerIdx: number,
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>,
  canvasMode: DrawAreaMode,
  notifyRealtimeDirty: () => void,
  flushRealtimeSnapshot: () => void,
) {
  let onMouseDown: React.MouseEventHandler<HTMLCanvasElement>,
    onMouseMove: React.MouseEventHandler<HTMLCanvasElement>,
    onMouseUp: React.MouseEventHandler<HTMLCanvasElement>,
    onMouseEnter: React.MouseEventHandler<HTMLCanvasElement>;

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
      notifyRealtimeDirty,
    );

    onMouseMove = drawingOnMouseMove(
      sectionId,
      layers,
      strokeRef,
      eraserStrokeRef,
      prevPointRef,
      isDrawing,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      activeLayerIdx,
      canvasMode,
      notifyRealtimeDirty,
    );

    onMouseUp = drawingOnMouseUp(
      sectionId,
      layers,
      eraserStrokeRef,
      isDrawing,
      activeLayerIdx,
      strokeRef,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      canvasMode,
      flushRealtimeSnapshot,
    );

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
  notifyRealtimeDirty: () => void,
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
      notifyRealtimeDirty();
    } else {
      strokeRef.current = startNewStroke(draftCanvasRef, point);
      notifyRealtimeDirty();
    }
    prevPointRef.current = point;
  };
}

function drawingOnMouseMove(
  sectionId: string,
  layers: Array<DrawAreaLayer>,
  strokeRef: React.RefObject<BrushStrokeArtifact | null>,
  eraserStrokeRef: React.RefObject<BrushStroke | null>,
  prevPointRef: React.RefObject<CanvasPoint | null>,
  isDrawingRef: React.RefObject<boolean>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  activeLayerIdx: number,
  canvasMode: DrawAreaMode,
  notifyRealtimeDirty: () => void,
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

function drawingOnMouseUp(
  sectionId: string,
  layers: Array<DrawAreaLayer>,
  eraserStrokeRef: React.RefObject<BrushStroke | null>,
  isDrawingRef: React.RefObject<boolean>,
  activeLayerIdx: number,
  strokeRef: React.RefObject<BrushStrokeArtifact | null>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  canvasMode: DrawAreaMode,
  flushRealtimeSnapshot: () => void,
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
      const touchedTransformIds = new Set<string>();
      useDrawAreaLayerItemTransform.setState((state) => {
        if (!eraserStrokeRef.current) {
          return;
        }
        const changedIds: Array<string> = [];
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
                brushStroke.value,
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
          if (intersectingPath.length === 0) {
            continue;
          }
          artifact.value.eraserStrokes.push({
            ...eraserStrokeRef.current,
            points: intersectingPath,
            transform: inverseTransform,
          });
          touchedTransformIds.add(el.transformId);
          changedIds.push(el.transformId);
        }
        if (changedIds.length > 0) {
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
        }
      });

      eraserStrokeRef.current = null;
      drawOneLayer(layer, layerCanvas, tempCanvasRefs, [], null, null);
      if (touchedTransformIds.size > 0) {
        queueTransformsForSave(Array.from(touchedTransformIds));
      }
    } else if (canvasMode === DrawAreaModeEnum.draw) {
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
}): React.MouseEventHandler<HTMLCanvasElement> {
  return (e) => {
    if (!draftCanvasRef.current || e.buttons !== 1) {
      return;
    }

    const zoom = getZoom();
    const rect = draftCanvasRef.current.getBoundingClientRect();
    const offsetX = (e.clientX - rect.left) / zoom;
    const offsetY = (e.clientY - rect.top) / zoom;
    const point: CanvasPoint = [offsetX, offsetY];

    if (canvasMode === DrawAreaModeEnum.draw) {
      const activeStroke = strokeRef.current;
      if (!activeStroke) {
        onMouseDown(e, offsetX, offsetY);
        return;
      }

      const points = activeStroke.value.points;
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        if (lastPoint !== "BREAK") {
          points.push("BREAK");
        }
      }
      points.push(point);

      drawStroke(draftCanvasRef.current, point, point);
      prevPointRef.current = point;
      isDrawingRef.current = true;
      notifyRealtimeDirty();
      return;
    }

    if (canvasMode === DrawAreaModeEnum.erase) {
      const activeEraserStroke = eraserStrokeRef.current;
      if (!activeEraserStroke) {
        onMouseDown(e, offsetX, offsetY);
        return;
      }

      const points = activeEraserStroke.points;
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        if (lastPoint !== "BREAK") {
          points.push("BREAK");
        }
      }
      points.push(point);

      prevPointRef.current = point;
      isDrawingRef.current = true;

      const [layer, layerCanvas] = getActiveLayerAndCanvas(
        layers,
        layerCanvasRefs,
        activeLayerIdx,
      );
      if (layer && layerCanvas) {
        drawOneLayer(
          layer,
          layerCanvas,
          tempCanvasRefs,
          [],
          null,
          activeEraserStroke,
        );
        notifyRealtimeDirty();
      }
      return;
    }

    onMouseDown(e, offsetX, offsetY);
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
  activeLayerIdx,
}) {
  return (e) => {
    const canvas = layerCanvasRefs.current[activeLayerIdx];
    if (!canvas) {
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const zoom = getZoom();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    const localTransforms = localArtifactTransformsRef.current;
    const images = useDecodedImages.getState().x;
    const brushStrokes = useBrushStrokes.getState().x;

    if (
      selectedIdx.current !== null &&
      resizeHandleCorners.current &&
      localTransforms[selectedIdx.current]
    ) {
      const currTransform = localTransforms[selectedIdx.current].transform;
      for (let i = 0; i < resizeHandleCorners.current.length; i++) {
        const corner = resizeHandleCorners.current[i];
        if (
          Math.abs(x - corner.x) <= RESIZE_HANDLE_SIZE / 2 &&
          Math.abs(y - corner.y) <= RESIZE_HANDLE_SIZE / 2
        ) {
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

    for (let i = localTransforms.length - 1; i >= 0; i--) {
      const local = localTransforms[i];
      if (!local) {
        continue;
      }
      if (local.type === ArtifactTypeEnum.Image) {
        const img = images[local.dataPath];
        if (!img) {
          continue;
        }
        const bounds = getImageBounds(img, local.transform);
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
      } else if (local.type === ArtifactTypeEnum.BrushStroke) {
        const brushStrokeArtifact = brushStrokes[local.dataPath];
        if (!brushStrokeArtifact) {
          continue;
        }
        const hit = detectHit(x, y, brushStrokeArtifact, local.transform);
        if (hit) {
          const bounds = getBrushStrokesBounds(
            brushStrokeArtifact.value,
            local.transform,
          );
          setResizeHandleCorners(resizeHandleCorners, bounds);
          isDragging.current = true;
          draggedIdx.current = i;
          selectedIdx.current = i;
          lastPos.current = { x, y };
          return true;
        }
      }
    }

    const hadSelection = selectedIdx.current !== null;
    selectedIdx.current = null;
    resizeHandleCorners.current = null;
    isDragging.current = false;
    draggedIdx.current = null;
    resizeHandle.current = null;
    lastPos.current = null;
    return hadSelection;
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
  activeLayerIdx,
}) {
  return (e) => {
    if (
      (!isDragging.current || draggedIdx.current === null) &&
      (resizeHandle.current === null || selectedIdx.current === null)
    ) {
      return false;
    }

    const canvas = layerCanvasRefs.current[activeLayerIdx];
    if (!canvas) {
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const zoom = getZoom();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    if (!lastPos.current) {
      lastPos.current = { x, y };
      return false;
    }
    const prev = lastPos.current as unknown as { x: number; y: number };
    const dx = x - prev.x;
    const dy = y - prev.y;
    // Check if shift key is pressed to preserve aspect ratio
    const preserveAspectRatio = e.shiftKey;

    if (isDragging.current && draggedIdx.current !== null) {
      const local = localArtifactTransformsRef.current[draggedIdx.current];
      if (!local || !resizeHandleCorners.current) {
        return false;
      }
      local.transform[4] += dx;
      local.transform[5] += dy;
      resizeHandleCorners.current = resizeHandleCorners.current.map((c) => ({
        x: c.x + dx,
        y: c.y + dy,
      })) as ResizeHandleCorners;
      lastPos.current = { x, y };
      return true;
    }

    if (
      resizeHandle.current !== null &&
      selectedIdx.current !== null &&
      resizeHandleCorners.current
    ) {
      const local = localArtifactTransformsRef.current[selectedIdx.current];
      if (!local) {
        return false;
      }
      const images = useDecodedImages.getState().x;
      const brushStrokes = useBrushStrokes.getState().x;

      let latestBounds:
        | ReturnType<typeof getImageBounds>
        | ReturnType<typeof getBrushStrokesBounds>
        | null = null;

      if (local.type === ArtifactTypeEnum.Image) {
        const img = images[local.dataPath];
        if (!img) {
          return false;
        }
        const scaledWidth = getScaledWidth(img, local.transform);
        const scaledHeight = getScaledHeight(img, local.transform);
        const handleBehaviorFn = getImageHandleBehaviorFn(
          resizeHandle.current.idx,
          resizeHandle.current.wasPositive.xScale,
          resizeHandle.current.wasPositive.yScale,
        );
        let nextDx = dx;
        let nextDy = dy;

        if (preserveAspectRatio) {
          const aspectRatio = scaledWidth / scaledHeight;
          const epsilon = 0.001;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          if (!(absDx < epsilon && absDy < epsilon)) {
            if (absDx < epsilon) {
              nextDx = (dy > 0 ? 1 : -1) * absDy * aspectRatio;
              if (
                resizeHandle.current.idx === 1 ||
                resizeHandle.current.idx === 2
              ) {
                nextDx = -nextDx;
              }
            } else if (absDy < epsilon) {
              nextDy = ((dx > 0 ? 1 : -1) * absDx) / aspectRatio;
              if (
                resizeHandle.current.idx === 1 ||
                resizeHandle.current.idx === 2
              ) {
                nextDy = -nextDy;
              }
            } else if (absDx > absDy) {
              nextDy = ((dx > 0 ? 1 : -1) * absDx) / aspectRatio;
              if (
                resizeHandle.current.idx === 1 ||
                resizeHandle.current.idx === 2
              ) {
                nextDy = -nextDy;
              }
            } else {
              nextDx = (dy > 0 ? 1 : -1) * absDy * aspectRatio;
              if (
                resizeHandle.current.idx === 1 ||
                resizeHandle.current.idx === 2
              ) {
                nextDx = -nextDx;
              }
            }
          }
        }

        handleBehaviorFn(
          local.transform,
          scaledWidth,
          scaledHeight,
          preserveAspectRatio ? nextDx : dx,
          preserveAspectRatio ? nextDy : dy,
          { value: img },
        );

        if (preserveAspectRatio) {
          latestBounds = getImageBounds(img, local.transform);
        }
      } else if (local.type === ArtifactTypeEnum.BrushStroke) {
        const brushStrokeArtifact = brushStrokes[local.dataPath];
        if (!brushStrokeArtifact) {
          return false;
        }
        const bounds =
          getPseudoBoundsFromResizeHandleCorners(resizeHandleCorners);
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        switch (resizeHandle.current.idx) {
          case 0: {
            let scaleX = (width - dx) / width;
            let scaleY = (height - dy) / height;
            if (preserveAspectRatio) {
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }
            const anchorX = bounds.maxX;
            const anchorY = bounds.maxY;
            local.transform[0] = preventExactZero(local.transform[0] * scaleX);
            local.transform[3] = preventExactZero(local.transform[3] * scaleY);
            local.transform[4] =
              anchorX - (anchorX - local.transform[4]) * scaleX;
            local.transform[5] =
              anchorY - (anchorY - local.transform[5]) * scaleY;
            break;
          }
          case 1: {
            let scaleX = (width + dx) / width;
            let scaleY = (height - dy) / height;
            if (preserveAspectRatio) {
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }
            const anchorX = bounds.minX;
            const anchorY = bounds.maxY;
            local.transform[0] = preventExactZero(local.transform[0] * scaleX);
            local.transform[3] = preventExactZero(local.transform[3] * scaleY);
            local.transform[4] =
              anchorX - (anchorX - local.transform[4]) * scaleX;
            local.transform[5] =
              anchorY - (anchorY - local.transform[5]) * scaleY;
            break;
          }
          case 2: {
            let scaleX = (width - dx) / width;
            let scaleY = (height + dy) / height;
            if (preserveAspectRatio) {
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }
            const anchorX = bounds.maxX;
            const anchorY = bounds.minY;
            local.transform[0] = preventExactZero(local.transform[0] * scaleX);
            local.transform[3] = preventExactZero(local.transform[3] * scaleY);
            local.transform[4] =
              anchorX - (anchorX - local.transform[4]) * scaleX;
            local.transform[5] =
              anchorY - (anchorY - local.transform[5]) * scaleY;
            break;
          }
          case 3: {
            let scaleX = (width + dx) / width;
            let scaleY = (height + dy) / height;
            if (preserveAspectRatio) {
              const uniformScale = Math.max(scaleX, scaleY);
              scaleX = scaleY = uniformScale;
            }
            const anchorX = bounds.minX;
            const anchorY = bounds.minY;
            local.transform[0] = preventExactZero(local.transform[0] * scaleX);
            local.transform[3] = preventExactZero(local.transform[3] * scaleY);
            local.transform[4] =
              anchorX - (anchorX - local.transform[4]) * scaleX;
            local.transform[5] =
              anchorY - (anchorY - local.transform[5]) * scaleY;
            break;
          }
        }

        if (preserveAspectRatio) {
          latestBounds = getBrushStrokesBounds(
            brushStrokeArtifact.value,
            local.transform,
          );
        }
      }

      if (preserveAspectRatio && latestBounds) {
        setResizeHandleCorners(resizeHandleCorners, latestBounds);
      } else {
        incrementResizeHandleCorners(
          resizeHandle,
          resizeHandleCorners,
          preserveAspectRatio ? 0 : dx,
          preserveAspectRatio ? 0 : dy,
        );
      }

      lastPos.current = { x, y };
      return true;
    }

    return false;
  };
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
