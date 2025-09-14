import _ from "lodash";
import { useEffect, useRef } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useArtifacts, useProjectState } from "state/definitions";
import useDeepCompareEffect, {
  useDeepCompareEffectNoCheck,
} from "use-deep-compare-effect";
import {
  ArtifactTypeEnum,
  DrawAreaLayerItem,
  DrawAreaMode,
  DrawAreaModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  drawAllLayers,
  setCanvasSize,
  setDraftCanvasProperties,
  setGlobalBrushStrokesAndDrawAllLayers,
} from "./canvasUtils";
import { DrawAreaControls } from "./DrawAreaControls";
import {
  CanvasPoint,
  EraserStrokeElement,
  LayerCanvasesType,
  ResizeHandle,
  ResizeHandleCorners,
  StrokeElement,
  TempCanvasesType,
} from "./types";
import { useDrawModeMouseHandlers } from "./useDrawModeMouseHandlers";

export function DrawArea({ sectionId }: { sectionId: string }) {
  const {
    numLayers,
    activeLayerIdx,
    size: sectionSize,
    brushColor,
    brushSize,
    brushShape,
    eraserBrushSize,
    drawThrottleDelay,
    canvasTransferQueueLength,
    canvasMode,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Draw,
    );
    const numLayers = impl.layers.length;
    return {
      numLayers,
      activeLayerIdx: impl.activeLayerIdx,
      size: impl.size,
      brushColor: impl.brushColor,
      brushSize: impl.brushSize,
      brushShape: impl.brushShape,
      eraserBrushSize: impl.eraserBrushSize,
      drawThrottleDelay: impl.drawThrottleDelay,
      canvasTransferQueueLength: impl.canvasTransferQueueLength,
      canvasMode: impl.canvasMode,
    };
  }, _.isEqual);

  // const {
  //   activeLayer,
  //   allLayersMetadata,
  //   loadedArtifacts,
  //   loadedArtifactIdsWithDuplicates,
  // } = useDrawAreaActiveLayerAndLoadedArtifacts(sectionId);

  const layerCanvasRefs = useRef<LayerCanvasesType>([]);
  const draftCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRefs = useRef<TempCanvasesType>({
    layer: null,
    artifact: null,
  });
  const strokesRef = useRef<Array<StrokeElement>>([]);
  const eraserStrokesRef = useRef<Array<EraserStrokeElement>>([]); // store in here until mouseup, then compute collisions with artifacts and store in localArtifactTransformsRef
  const localArtifactTransformsRef = useRef<DrawAreaLayerItem["transform"]>([
    1, 0, 0, 1, 0, 0,
  ]);
  const prevPointRef = useRef<CanvasPoint>(null);
  const isDrawing = useRef(false);
  const isDragging = useRef(false);
  const draggedIdx = useRef<number>(null);
  const lastPos = useRef<CanvasPoint>(null);
  const selectedIdx = useRef<number>(null);
  const resizeHandle = useRef<ResizeHandle>(null);
  const resizeHandleCorners = useRef<ResizeHandleCorners>(null);

  const layerOpacity = activeLayer?.layerOpacity ?? 1;
  const brushOpacity = activeLayer?.brushOpacity ?? 1;
  const currBrushStrokeArtifactId = activeLayer?.artifactTransforms?.find(
    (a) =>
      loadedArtifacts[a.artifactId]?.type === ArtifactTypeEnum.BRUSH_STROKES,
  )?.artifactId;

  // const updateDrawArea = useMisc(
  //   (x) => x.updateAllDrawAreas || x.updateDrawArea[sectionId],
  // );

  useEffect(() => {
    tempCanvasRefs.current.layer = document.createElement("canvas");
    tempCanvasRefs.current.artifact = document.createElement("canvas");
  }, []);

  // const fnCanvasToBase64 = useCallback(
  //   () => combinedAndSeparateLayersToBase64(layerCanvasRefs.current, layerIds),
  //   [JSON.stringify(layerIds)],
  // );

  // useDeepCompareEffect(() => {
  //   const unsub = listenForCanvasToBase64Requests(sectionId, fnCanvasToBase64);
  //   return unsub;
  // }, [sectionId, fnCanvasToBase64]);

  useEffect(() => {
    useProjectState.setState((state) => {
      setCanvasSize(
        sectionId,
        layerCanvasRefs,
        tempCanvasRefs,
        draftCanvasRef,
        sectionSize,
        state,
      );
    });
    drawAllLayers(sectionId, layerCanvasRefs, tempCanvasRefs);
  }, [
    sectionSize.height,
    sectionSize.width,
    // JSON.stringify(layerIds),
    // updateDrawArea,
  ]);

  useEffect(() => {
    setDraftCanvasProperties(
      draftCanvasRef,
      brushColor,
      brushSize,
      brushShape,
      brushOpacity,
      layerOpacity,
    );
  }, [
    brushColor,
    brushSize,
    brushShape,
    brushOpacity,
    layerOpacity,
    // updateDrawArea,
  ]);

  useDeepCompareEffect(() => {
    if (canvasMode === DrawAreaModeEnum.draw) {
      selectedIdx.current = null;
      resizeHandleCorners.current = null;
    }
    drawAllLayers(sectionId, layerCanvasRefs, tempCanvasRefs);
  }, [
    canvasMode,
    layerOpacity,
    // allLayersMetadata,
    // loadedArtifactIdsWithDuplicates,
    // updateDrawArea,
  ]);
  // loadedArtifactIdsWithDuplicates contains all artifacts ids present in all layers
  // including duplicates (e.g. the same artifact present multiple times in a single layer, or across multiple layers)

  useEffect(() => {
    if (!currBrushStrokeArtifactId) {
      strokesRef.current = [];
    } else {
      strokesRef.current = _.cloneDeep(
        useArtifacts.getState().x[currBrushStrokeArtifactId].value,
      );
    }
  }, [currBrushStrokeArtifactId]); //updateDrawArea]);

  useDeepCompareEffectNoCheck(() => {
    if (!activeLayer?.artifactTransforms) {
      localArtifactTransformsRef.current = [];
    } else {
      localArtifactTransformsRef.current = _.cloneDeep(
        activeLayer.artifactTransforms,
      );
    }
  }, [activeLayer?.artifactTransforms, updateDrawArea]);

  const { onMouseDown, onMouseMove, onMouseUp, onMouseEnter } =
    useDrawModeMouseHandlers(
      sectionId,
      strokesRef,
      eraserStrokesRef,
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
      canvasTransferQueueLength,
      currBrushStrokeArtifactId,
      activeLayerIdx,
      localArtifactTransformsRef,
      canvasMode,
    );

  function clearStrokes() {
    strokesRef.current = [];
    setGlobalBrushStrokesAndDrawAllLayers(
      sectionId,
      currBrushStrokeArtifactId,
      strokesRef,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
    );
  }

  // const { getRootProps, isDragActive } = useLoadArtifactViaDropzone(
  //   sectionId,
  //   true,
  //   ArtifactTypeEnum.IMG,
  // );

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
        className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0"
        // {...getRootProps()}
      >
        <div className="single-cell-child single-cell-container">
          <LayerCanvases
            numLayers={numLayers}
            activeLayerIdx={activeLayerIdx}
            layerCanvasRefs={layerCanvasRefs}
            cursorIcon={cursorIcon}
            canvasClassName={canvasClassName}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseEnter={onMouseEnter}
          />
          <canvas
            ref={draftCanvasRef}
            className={`pointer-events-none ${canvasClassName}`}
          />
        </div>
      </section>
    </>
  );
}

function LayerCanvases({
  numLayers,
  activeLayerIdx,
  layerCanvasRefs,
  cursorIcon,
  canvasClassName,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseEnter,
}: {
  numLayers: number;
  activeLayerIdx: number;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  cursorIcon: string;
  canvasClassName: string;
  onMouseDown: React.MouseEventHandler<HTMLCanvasElement>;
  onMouseMove: React.MouseEventHandler<HTMLCanvasElement>;
  onMouseUp: React.MouseEventHandler<HTMLCanvasElement>;
  onMouseEnter: React.MouseEventHandler<HTMLCanvasElement>;
}) {
  const canvases: Array<React.ReactElement<HTMLCanvasElement>> = [];
  for (let i = 0; i < numLayers; i++) {
    canvases.push(
      <canvas
        key={i}
        ref={(el) => {
          if (el) {
            layerCanvasRefs.current[i] = el;
          }
        }}
        className={`${cursorIcon} ${canvasClassName} ${i !== activeLayerIdx ? "pointer-events-none" : ""}`}
        onMouseDown={i === activeLayerIdx ? onMouseDown : undefined}
        onMouseMove={i === activeLayerIdx ? onMouseMove : undefined}
        onMouseUp={i === activeLayerIdx ? onMouseUp : undefined}
        onMouseLeave={i === activeLayerIdx ? onMouseUp : undefined}
        onMouseEnter={i === activeLayerIdx ? onMouseEnter : undefined}
      />,
    );
  }
  return canvases;
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
