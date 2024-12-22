import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import {
  base64RequestId,
  setTemporaryMiscState,
} from "state/actions/temporaryMiscState";
import {
  useArtifacts,
  useSectionInfos,
  useTemporaryMiscState,
} from "state/definitions";
import { useDrawAreaActiveLayerAndLoadedArtifacts } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";
import { DrawAreaControls } from "./DrawAreaControls";
import { useDrawModeMouseHandlers } from "./useDrawModeMouseHandlers";
import { useImageLoadViaDropzone } from "./useImageLoadViaDropzone";
import {
  drawAllLayers,
  setCanvasSize,
  setDraftCanvasProperties,
  setGlobalBrushStrokesAndDrawAllLayers,
} from "./utils";

export function DrawArea({ sectionId }) {
  const {
    activeLayer,
    loadedArtifactIdsWithDuplicates,
    size: { width, height },
    canvasSettings: {
      activeLayerId,
      color,
      brushSize,
      brushShape,
      eraserBrushSize,
      drawThrottleDelay,
      canvasTransferQueueLength,
      mode,
      artifactIdUsedToSetCanvasSize,
    },
    loadedArtifacts,
  } = useDrawAreaActiveLayerAndLoadedArtifacts(sectionId);

  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const strokesRef = useRef([]);
  const eraserStrokesRef = useRef([]); // store in here until mouseup, then compute collisions with artifacts and store in localArtifactTransformsRef
  const localArtifactTransformsRef = useRef([]);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  const isDragging = useRef(false);
  const draggedIdx = useRef(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const selectedIdx = useRef(null);
  const resizeHandle = useRef(null);
  const resizeHandleCorners = useRef(null);

  const layerOpacity = activeLayer?.layerOpacity ?? 1;
  const brushOpacity = activeLayer?.brushOpacity ?? 1;
  const currBrushStrokeArtifactId = activeLayer?.artifactTransforms?.find(
    (a) => loadedArtifacts[a.artifactId]?.type === "brushStrokes",
  )?.artifactId;
  const currentBrushStrokeTransformInfo =
    localArtifactTransformsRef.current.find(
      (l) => l.artifactId === currBrushStrokeArtifactId,
    );

  useEffect(() => {
    tempCanvasRef.current = document.createElement("canvas");

    const id = base64RequestId(sectionId);
    const unsub = useTemporaryMiscState.subscribe(
      (x) => x[id],
      (x) => {
        if (x === true) {
          setTemporaryMiscState(id, allPartsToBase64(canvasRef));
        }
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    console.log("setting canvas size");
    useSectionInfos.setState((state) => {
      setCanvasSize({
        sectionId,
        canvasRef,
        tempCanvasRef,
        draftCanvasRef,
        height,
        width,
        artifactIdUsedToSetCanvasSize,
        state,
      });
    });
    drawAllLayers(sectionId, canvasRef, tempCanvasRef);
  }, [height, width, Boolean(loadedArtifacts[artifactIdUsedToSetCanvasSize])]);
  // the Boolean dependency is checking whether or not the artifactIdUsedToSetCanvasSize has been loaded or not

  useEffect(() => {
    console.log("set draft canvas properties");
    setDraftCanvasProperties({
      draftCanvasRef,
      color,
      brushSize,
      brushShape,
      brushOpacity,
      layerOpacity,
    });
  }, [color, brushSize, brushShape, brushOpacity, layerOpacity]);

  useDeepCompareEffect(() => {
    console.log("layer opacity changed, drawing all layers again");
    drawAllLayers(sectionId, canvasRef, tempCanvasRef);
  }, [layerOpacity, loadedArtifactIdsWithDuplicates]);
  // loadedArtifactIdsWithDuplicates contains all artifacts ids present in all layers
  // including duplicates (e.g. the same artifact present multiple times in a single layer, or across multiple layers)

  useEffect(() => {
    if (!currBrushStrokeArtifactId) {
      strokesRef.current = [];
    } else {
      strokesRef.current = _.cloneDeep(
        useArtifacts.getState()[currBrushStrokeArtifactId].value,
      );
    }
  }, [currBrushStrokeArtifactId]);

  useDeepCompareEffect(() => {
    console.log("activeLayer?.artifactTransforms changed");
    if (!activeLayer?.artifactTransforms) {
      localArtifactTransformsRef.current = [];
    } else {
      localArtifactTransformsRef.current = _.cloneDeep(
        activeLayer.artifactTransforms,
      );
    }
  }, [activeLayer?.artifactTransforms]);

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
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      canvasTransferQueueLength,
      currBrushStrokeArtifactId,
      currentBrushStrokeTransformInfo,
      activeLayerId,
      localArtifactTransformsRef,
      mode,
    });

  function clearStrokes() {
    strokesRef.current = [];
    setGlobalBrushStrokesAndDrawAllLayers(
      sectionId,
      currBrushStrokeArtifactId,
      strokesRef,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
    );
  }

  const { getRootProps, isDragActive } = useImageLoadViaDropzone(
    sectionId,
    activeLayerId,
  );

  const canvasClassName = `single-cell-child max-w-full place-self-center ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`;
  const cursorIcon = isEraser
    ? "cursor-[url(../../../erase.svg)_0_24,_pointer]"
    : "cursor-[url(../../../pen.svg)_0_24,_pointer]";

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
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseEnter={onMouseEnter}
            className={`${cursorIcon} ${canvasClassName}`}
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
