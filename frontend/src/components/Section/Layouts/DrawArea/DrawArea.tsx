import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useArtifacts, useMisc, useProjectState } from "state/definitions";
import { useLoadArtifactViaDropzone } from "state/hooks/artifacts";
import useDeepCompareEffect, {
  useDeepCompareEffectNoCheck,
} from "use-deep-compare-effect";
import {
  ArtifactTypeEnum,
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
import { useDrawModeMouseHandlers } from "./useDrawModeMouseHandlers";

export function DrawArea({ sectionId }: { sectionId: string }) {
  const {
    numLayers,
    activeLayerIdx,
    size: { width, height },
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

  const layerCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const draftCanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRefs = useRef<{
    layer: HTMLCanvasElement | null;
    artifact: HTMLCanvasElement | null;
  }>({ layer: null, artifact: null });
  const strokesRef = useRef([]);
  const eraserStrokesRef = useRef([]); // store in here until mouseup, then compute collisions with artifacts and store in localArtifactTransformsRef
  const localArtifactTransformsRef = useRef([]);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDragging = useRef(false);
  const draggedIdx = useRef(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const selectedIdx = useRef(null);
  const resizeHandle = useRef(null);
  const resizeHandleCorners = useRef(null);

  const layerOpacity = activeLayer?.layerOpacity ?? 1;
  const brushOpacity = activeLayer?.brushOpacity ?? 1;
  const currBrushStrokeArtifactId = activeLayer?.artifactTransforms?.find(
    (a) =>
      loadedArtifacts[a.artifactId]?.type === ArtifactTypeEnum.BRUSH_STROKES,
  )?.artifactId;

  const updateDrawArea = useMisc(
    (x) => x.updateAllDrawAreas || x.updateDrawArea[sectionId],
  );

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
      setCanvasSize({
        sectionId,
        layerCanvasRefs,
        tempCanvasRefs,
        draftCanvasRef,
        height,
        width,
        state,
      });
    });
    drawAllLayers(sectionId, layerCanvasRefs, tempCanvasRefs, fnCanvasToBase64);
  }, [height, width, JSON.stringify(layerIds), updateDrawArea]);

  useEffect(() => {
    setDraftCanvasProperties({
      draftCanvasRef,
      color,
      brushSize,
      brushShape,
      brushOpacity,
      layerOpacity,
    });
  }, [
    color,
    brushSize,
    brushShape,
    brushOpacity,
    layerOpacity,
    updateDrawArea,
  ]);

  useDeepCompareEffect(() => {
    if (mode === "draw") {
      selectedIdx.current = null;
      resizeHandleCorners.current = null;
    }
    drawAllLayers(sectionId, layerCanvasRefs, tempCanvasRefs, fnCanvasToBase64);
  }, [
    mode,
    layerOpacity,
    allLayersMetadata,
    loadedArtifactIdsWithDuplicates,
    updateDrawArea,
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
  }, [currBrushStrokeArtifactId, updateDrawArea]);

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
    useDrawModeMouseHandlers({
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
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      canvasTransferQueueLength,
      currBrushStrokeArtifactId,
      activeLayerId,
      localArtifactTransformsRef,
      mode,
      fnCanvasToBase64,
    });

  function clearStrokes() {
    strokesRef.current = [];
    setGlobalBrushStrokesAndDrawAllLayers(
      sectionId,
      currBrushStrokeArtifactId,
      strokesRef,
      layerCanvasRefs,
      tempCanvasRefs,
      draftCanvasRef,
      fnCanvasToBase64,
    );
  }

  const { getRootProps, isDragActive } = useLoadArtifactViaDropzone(
    sectionId,
    true,
    ArtifactTypeEnum.IMG,
  );

  const canvasClassName = `single-cell-child max-w-full place-self-center ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`;

  const cursorIcon = getCursorIcon(canvasMode);

  return (
    <>
      <DrawAreaControls
        sectionId={sectionId}
        activeLayerId={activeLayerId}
        color={color}
        brushOpacity={brushOpacity}
        brushSize={brushSize}
        brushShape={brushShape}
        eraserBrushSize={eraserBrushSize}
        isEraser={isEraser}
        setIsEraser={setIsEraser}
        layerOpacity={layerOpacity}
        mode={mode}
        clearStrokes={clearStrokes}
      />
      <section
        className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0"
        {...getRootProps()}
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
  layerCanvasRefs: React.RefObject<Array<HTMLCanvasElement | null>>;
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
