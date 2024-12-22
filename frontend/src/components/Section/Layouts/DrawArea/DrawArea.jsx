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
import { useSectionArtifactGroups } from "state/hooks/artifacts";
import useDeepCompareEffect from "use-deep-compare-effect";
import { DrawAreaControls } from "./DrawAreaControls";
import { useDrawModeMouseHandlers } from "./useDrawModeMouseHandlers";
import { useImageLoadViaDropzone } from "./useImageLoadViaDropzone";
import {
  clearCanvas,
  debouncedSetBrushStrokesArtifact,
  drawAllLayers,
  setCanvasSize,
  setDraftCanvasProperties,
} from "./utils";

export function DrawArea({ sectionId }) {
  const { artifactGroups: layers, loadedArtifacts } = useSectionArtifactGroups(
    sectionId,
    ["type"],
  );

  // console.log("layers", layers);
  // console.log("loadedArtifactTypes", loadedArtifactTypes);

  const {
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
    },
  } = useSectionInfos((x) => {
    return {
      size: x.x[sectionId].size,
      canvasSettings: x.x[sectionId].canvasSettings,
    };
  }, _.isEqual);
  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const strokesRef = useRef([]);
  const localArtifactTransformsRef = useRef([]);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null);

  const activeLayer = layers.find((x) => x.id === activeLayerId);
  const layerOpacity = activeLayer?.layerOpacity ?? 1;
  const brushOpacity = activeLayer?.brushOpacity ?? 1;
  const currBrushStrokeArtifactId = activeLayer?.artifactTransforms?.find(
    (a) => loadedArtifacts[a.artifactId]?.type === "brushStrokes",
  )?.artifactId;

  console.log("selectedIndex", selectedIndex)

  // console.log("currBrushStrokeArtifactId", currBrushStrokeArtifactId);

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

  useDeepCompareEffect(() => {
    useSectionInfos.setState((state) => {
      console.log("setting canvas size");
      setCanvasSize({
        sectionId,
        canvasRef,
        tempCanvasRef,
        draftCanvasRef,
        layers,
        state,
      });
    });
    setDraftCanvasProperties({
      draftCanvasRef,
      color,
      brushSize,
      brushShape,
      brushOpacity,
      eraserBrushSize,
      isEraser,
      layerOpacity,
    });
    drawAllLayers(canvasRef, tempCanvasRef, layers);
  }, [
    height,
    width,
    isEraser,
    color,
    brushSize,
    eraserBrushSize,
    brushShape,
    layerOpacity,
    brushOpacity,
    layers,
    loadedArtifacts,
  ]);

  useEffect(() => {
    if (!currBrushStrokeArtifactId) {
      return;
    }
    const storedStrokes =
      useArtifacts.getState()[currBrushStrokeArtifactId]?.value;
    if (storedStrokes) {
      strokesRef.current = _.cloneDeep(storedStrokes);
    }
  }, [currBrushStrokeArtifactId]);

  useDeepCompareEffect(() => {
    localArtifactTransformsRef.current = _.cloneDeep(
      activeLayer.artifactTransforms,
    );
  }, [activeLayer]);

  function transferEverythingToRealCanvas() {
    useArtifacts.setState((state) => ({
      [currBrushStrokeArtifactId]: {
        ...state[currBrushStrokeArtifactId],
        value: _.cloneDeep(strokesRef.current),
      },
    }));
    drawAllLayers(canvasRef, tempCanvasRef, layers);
    clearCanvas(draftCanvasRef);
  }

  function clearStrokes() {
    strokesRef.current = [];
    transferEverythingToRealCanvas();
    debouncedSetBrushStrokesArtifact(
      currBrushStrokeArtifactId,
      strokesRef.current,
    );
  }

  const { onMouseDown, onMouseMove, onMouseUp, onMouseEnter } =
    useDrawModeMouseHandlers({
      sectionId,
      isEraser,
      strokesRef,
      prevPointRef,
      isDrawing,
      setIsDrawing,
      isDragging,
      setIsDragging,
      draggedIndex,
      setDraggedIndex,
      lastPos,
      setLastPos,
      selectedIndex,
      setSelectedIndex,
      resizeHandle,
      setResizeHandle,
      transferEverythingToRealCanvas,
      drawThrottleDelay,
      canvasRef,
      tempCanvasRef,
      draftCanvasRef,
      canvasTransferQueueLength,
      currBrushStrokeArtifactId,
      layers,
      activeLayerId,
      localArtifactTransformsRef,
      mode,
    });

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
        layers={layers}
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
