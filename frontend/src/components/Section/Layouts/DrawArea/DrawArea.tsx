import _ from "lodash";
import { useCallback, useEffect, useRef } from "react";
import {
  registerDrawSnapshotProvider,
  unregisterDrawSnapshotProvider,
} from "state/actions/drawSnapshots";
import {
  getCurrEffectiveSectionImplOfType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useBrushStrokes,
  useDrawAreaLayerItemTransform,
  useProjectState,
} from "state/definitions";
import {
  useDrawAreaArtifactLoader,
  useDrawAreaArtifactRevisionStamps,
} from "state/hooks/artifacts";
import { removeRevisionEntries } from "state/utils/revisions";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "utils/constants";
import {
  ArtifactTypeEnum,
  BrushStroke,
  BrushStrokeArtifact,
  CanvasPoint,
  DrawAreaMode,
  DrawAreaModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { serializeLayerStackToBlob } from "./binaryConversion";
import {
  drawAllLayers,
  getActiveLayerAndCanvas,
  setCanvasSize,
  setDraftCanvasProperties,
} from "./canvasUtils";
import { DrawAreaControls } from "./DrawAreaControls";
import {
  CanvasPointXY,
  LayerCanvasesType,
  LocalLayerItemState,
  ResizeHandle,
  ResizeHandleCorners,
  TempCanvasesType,
} from "./types";
import { useDrawModeMouseHandlers } from "./useDrawModeMouseHandlers";
import { useRealtimeDrawEmitter } from "./useRealtimeDrawEmitter";

export function DrawArea({ sectionId }: { sectionId: string }) {
  useDrawAreaArtifactLoader(sectionId);

  const {
    images: imageRevisionStamp,
    decodedImages: decodedImageRevisionStamp,
    brushStrokes: brushRevisionStamp,
    transforms: transformRevisionStamp,
  } = useDrawAreaArtifactRevisionStamps(sectionId);

  const {
    layers,
    activeLayerIdx,
    size: sectionSize,
    brushColor,
    brushSize,
    brushShape,
    brushOpacity,
    eraserBrushSize,
    drawThrottleDelay,
    canvasMode,
    layerOpacity,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Draw,
    );
    const activeLayer = impl.layers[impl.activeLayerIdx];
    return {
      layers: impl.layers,
      activeLayerIdx: impl.activeLayerIdx,
      size: impl.size,
      brushColor: impl.brushColor,
      brushSize: impl.brushSize,
      brushShape: impl.brushShape,
      brushOpacity: impl.brushOpacity,
      eraserBrushSize: impl.eraserBrushSize,
      drawThrottleDelay: impl.drawThrottleDelay,
      canvasMode: impl.canvasMode,
      layerOpacity: activeLayer?.layerOpacity ?? 0,
    };
  }, _.isEqual);

  const layerCanvasRefs = useRef<LayerCanvasesType>([]);
  const draftCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRefs = useRef<TempCanvasesType>({
    layer: null,
    artifact: null,
  });
  const strokeRef = useRef<BrushStrokeArtifact>(null);
  const eraserStrokeRef = useRef<BrushStroke>(null); // store in here until mouseup, then compute collisions with artifacts and store in localArtifactTransformsRef
  const localArtifactTransformsRef = useRef<Array<LocalLayerItemState>>([]);
  const prevPointRef = useRef<CanvasPoint>(null);
  const isDrawing = useRef(false);
  const isDragging = useRef(false);
  const draggedIdx = useRef<number>(null);
  const lastPos = useRef<CanvasPointXY | null>(null);
  const selectedIdx = useRef<number>(null);
  const resizeHandle = useRef<ResizeHandle | null>(null);
  const resizeHandleCorners = useRef<ResizeHandleCorners | null>(null);

  const { notifyRealtimeDirty, flushRealtimeSnapshot } = useRealtimeDrawEmitter(
    {
      sectionId,
      layerCanvasRefs,
      draftCanvasRef,
      drawThrottleDelay,
    },
  );

  const snapshotProvider = useCallback(() => {
    return serializeLayerStackToBlob(
      layerCanvasRefs.current ?? [],
      draftCanvasRef.current,
    );
  }, [layerCanvasRefs, draftCanvasRef]);

  useEffect(() => {
    registerDrawSnapshotProvider(sectionId, snapshotProvider);
    return () => {
      unregisterDrawSnapshotProvider(sectionId);
    };
  }, [sectionId, snapshotProvider]);

  useEffect(() => {
    tempCanvasRefs.current.layer = document.createElement("canvas");
    tempCanvasRefs.current.artifact = document.createElement("canvas");
  }, []);

  useEffect(() => {
    return () => {
      flushRealtimeSnapshot();
    };
  }, [flushRealtimeSnapshot]);

  const layerCount = layers.length;

  useEffect(() => {
    useProjectState.setState((state) => {
      setCanvasSize({
        sectionId,
        layerCanvasRefs,
        tempCanvasRefs,
        draftCanvasRef,
        sectionSize,
        state,
      });
    });
    notifyRealtimeDirty();
  }, [sectionSize.height, sectionSize.width, layerCount, notifyRealtimeDirty]);

  useEffect(() => {
    setDraftCanvasProperties({
      draftCanvasRef,
      brushColor,
      brushSize,
      brushShape,
      brushOpacity,
      layerOpacity,
    });
  }, [brushColor, brushSize, brushShape, brushOpacity, layerOpacity]);

  useEffect(() => {
    if (canvasMode === DrawAreaModeEnum.draw) {
      selectedIdx.current = null;
      resizeHandleCorners.current = null;
    }
    drawAllLayers({ layers, layerCanvasRefs, tempCanvasRefs });
    notifyRealtimeDirty();
  }, [canvasMode, layerOpacity, notifyRealtimeDirty]);
  useEffect(() => {
    drawAllLayers({ layers, layerCanvasRefs, tempCanvasRefs });
    notifyRealtimeDirty();
  }, [
    layers,
    sectionSize.height,
    sectionSize.width,
    imageRevisionStamp,
    decodedImageRevisionStamp,
    brushRevisionStamp,
    transformRevisionStamp,
    notifyRealtimeDirty,
  ]);

  const { onMouseDown, onMouseMove, onMouseUp, onMouseEnter } =
    useDrawModeMouseHandlers({
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
      drawThrottleDelay,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      activeLayerIdx,
      localArtifactTransformsRef,
      canvasMode,
      notifyRealtimeDirty,
      flushRealtimeSnapshot,
    });

  function clearStrokes() {
    const [layer] = getActiveLayerAndCanvas(
      layers,
      layerCanvasRefs,
      activeLayerIdx,
    );
    if (!layer) {
      return;
    }

    const brushStrokeElements = layer.elements.filter(
      (element) => element.type === ArtifactTypeEnum.BrushStroke,
    );
    if (brushStrokeElements.length === 0) {
      const draftCanvas = draftCanvasRef.current;
      if (draftCanvas) {
        const ctx = draftCanvas.getContext("2d");
        ctx?.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
      }
      strokeRef.current = null;
      eraserStrokeRef.current = null;
      prevPointRef.current = null;
      return;
    }

    const strokeIds = brushStrokeElements.map((element) => element.dataPath);
    const transformIds = brushStrokeElements.map(
      (element) => element.transformId,
    );

    useBrushStrokes.setState((state) => {
      const next = { ...state.x };
      const removedIds: Array<string> = [];
      for (const id of strokeIds) {
        if (id in next) {
          delete next[id];
          removedIds.push(id);
        }
      }
      if (removedIds.length === 0) {
        return state;
      }
      const revisions = removeRevisionEntries(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        removedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });

    useDrawAreaLayerItemTransform.setState((state) => {
      const next = { ...state.x };
      const removedIds: Array<string> = [];
      for (const id of transformIds) {
        if (id in next) {
          delete next[id];
          removedIds.push(id);
        }
      }
      if (removedIds.length === 0) {
        return state;
      }
      const revisions = removeRevisionEntries(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        removedIds,
      );
      return {
        x: next,
        ...revisions,
      };
    });

    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        layers: (currLayers) => {
          const currentLayer = currLayers[activeLayerIdx];
          if (!currentLayer) {
            return currLayers;
          }
          const filteredElements = currentLayer.elements.filter(
            (element) => element.type !== ArtifactTypeEnum.BrushStroke,
          );
          if (filteredElements.length === currentLayer.elements.length) {
            return currLayers;
          }
          const nextLayers = [...currLayers];
          nextLayers[activeLayerIdx] = {
            ...currentLayer,
            elements: filteredElements,
          };
          return nextLayers;
        },
      });
    });

    localArtifactTransformsRef.current =
      localArtifactTransformsRef.current.filter(
        (item) => !strokeIds.includes(item.dataPath),
      );
    isDrawing.current = false;
    isDragging.current = false;
    draggedIdx.current = null;
    lastPos.current = null;
    selectedIdx.current = null;
    resizeHandle.current = null;
    resizeHandleCorners.current = null;
    strokeRef.current = null;
    eraserStrokeRef.current = null;
    prevPointRef.current = null;

    const draftCanvas = draftCanvasRef.current;
    if (draftCanvas) {
      const ctx = draftCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
      }
    }

    const nextLayers = getCurrEffectiveSectionImplOfType(
      useProjectState.getState(),
      sectionId,
      SectionTypeEnum.Draw,
    ).layers;
    drawAllLayers({
      layers: nextLayers,
      layerCanvasRefs,
      tempCanvasRefs,
    });
    flushRealtimeSnapshot();
  }

  const isDragActive = false;

  const canvasClassName = `single-cell-child max-w-full place-self-center ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`;

  const cursorIcon = getCursorIcon(canvasMode);

  return (
    <>
      <DrawAreaControls
        sectionId={sectionId}
        activeLayerIdx={activeLayerIdx}
        brushColor={brushColor}
        brushOpacity={brushOpacity}
        brushSize={brushSize}
        brushShape={brushShape}
        eraserBrushSize={eraserBrushSize}
        layerOpacity={layerOpacity}
        canvasMode={canvasMode}
        clearStrokes={clearStrokes}
      />
      <section
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} single-cell-container section-row-main section-key-value relative max-h-full min-w-0`}
        data-gpu-flow-control={`draw-canvas:${sectionId}`}
        data-gpu-flow-interactive="true"
      >
        <div className="single-cell-child single-cell-container">
          <LayerCanvases
            sectionId={sectionId}
            numLayers={layers.length}
            activeLayerIdx={activeLayerIdx}
            layerCanvasRefs={layerCanvasRefs}
            draftCanvasRef={draftCanvasRef}
            cursorIcon={cursorIcon}
            canvasClassName={canvasClassName}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseEnter={onMouseEnter}
          />
        </div>
      </section>
    </>
  );
}

function LayerCanvases({
  sectionId,
  numLayers,
  activeLayerIdx,
  layerCanvasRefs,
  draftCanvasRef,
  cursorIcon,
  canvasClassName,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseEnter,
}: {
  sectionId: string;
  numLayers: number;
  activeLayerIdx: number;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorIcon: string;
  canvasClassName: string;
  onMouseDown: React.MouseEventHandler<HTMLCanvasElement>;
  onMouseMove: React.MouseEventHandler<HTMLCanvasElement>;
  onMouseUp: React.MouseEventHandler<HTMLCanvasElement>;
  onMouseEnter: React.MouseEventHandler<HTMLCanvasElement>;
}) {
  const canvases: Array<React.ReactElement<HTMLCanvasElement>> = [];
  for (let i = 0; i < numLayers; i++) {
    const isActiveLayer = i === activeLayerIdx;
    const layerCanvasEventHandlers = getLayerCanvasEventHandlers(
      isActiveLayer,
      {
        onMouseDown,
        onMouseEnter,
        onMouseLeave: onMouseUp,
        onMouseMove,
        onMouseUp,
      },
    );
    canvases.push(
      <canvas
        key={i}
        ref={(el) => {
          if (el) {
            layerCanvasRefs.current[i] = el;
          }
        }}
        className={getLayerCanvasClassName({
          canvasClassName,
          cursorIcon,
          isActiveLayer,
        })}
        {...getLayerCanvasOwnershipProps({
          isActiveLayer,
          layerIndex: i,
          sectionId,
        })}
        {...layerCanvasEventHandlers}
      />,
    );
    if (i === activeLayerIdx) {
      canvases.push(
        <canvas
          key="draft-canvas"
          ref={draftCanvasRef}
          className={`pointer-events-none ${canvasClassName}`}
        />,
      );
    }
  }
  return canvases;
}

type LayerCanvasEventHandlers = Pick<
  React.CanvasHTMLAttributes<HTMLCanvasElement>,
  "onMouseDown" | "onMouseEnter" | "onMouseLeave" | "onMouseMove" | "onMouseUp"
>;

function getLayerCanvasEventHandlers(
  isActiveLayer: boolean,
  handlers: LayerCanvasEventHandlers,
): Partial<LayerCanvasEventHandlers> {
  if (!isActiveLayer) {
    return {};
  }
  return handlers;
}

function getLayerCanvasClassName({
  canvasClassName,
  cursorIcon,
  isActiveLayer,
}: {
  canvasClassName: string;
  cursorIcon: string;
  isActiveLayer: boolean;
}) {
  if (!isActiveLayer) {
    return `${cursorIcon} ${canvasClassName} pointer-events-none`;
  }
  return `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${NO_WHEEL_CLASS_NAME} ${cursorIcon} ${canvasClassName}`;
}

function getLayerCanvasOwnershipProps({
  isActiveLayer,
  layerIndex,
  sectionId,
}: {
  isActiveLayer: boolean;
  layerIndex: number;
  sectionId: string;
}) {
  if (!isActiveLayer) {
    return {};
  }
  return {
    "data-gpu-flow-control": `draw-canvas-layer:${sectionId}:${layerIndex}`,
    "data-gpu-flow-interactive": "true",
  };
}

function getCursorIcon(canvasMode: DrawAreaMode) {
  switch (canvasMode) {
    case DrawAreaModeEnum.draw:
      return "cursor-[url(./src/assets/cursor/pen.svg)_0_24,_pointer]";
    case DrawAreaModeEnum.erase:
      return "cursor-[url(./src/assets/cursor/erase.svg)_0_24,_pointer]";
    case DrawAreaModeEnum.edit:
      return "cursor-pointer";
    default:
      return canvasMode satisfies never;
  }
}
