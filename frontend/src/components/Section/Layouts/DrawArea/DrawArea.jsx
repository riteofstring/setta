import { arrayMove } from "forks/dnd-kit/CustomSortable";
import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import { maybeCreateArtifactAndUpdateSection } from "state/actions/artifacts";
import {
  base64RequestId,
  setTemporaryMiscState,
} from "state/actions/temporaryMiscState";
import {
  useMisc,
  useSectionInfos,
  useTemporaryMiscState,
} from "state/definitions";
import { useArtifactData } from "state/hooks/artifacts";
import { setDrawAreaSectionSize } from "state/hooks/sectionSizes";
import useDeepCompareEffect from "use-deep-compare-effect";
import { createNewId } from "utils/idNameCreation";
import {
  newDrawAreaLocalLayer,
  newDrawAreaLocalLayerArtifactData,
} from "utils/objs/artifact";
import { dataURLToBase64 } from "./base64Conversion";
import { DrawAreaControls } from "./DrawAreaControls";
import {
  debouncedSetBrushStrokesArtifact,
  useImageLoadViaDropzone,
} from "./utils";

export function DrawOnImage({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const {
    size: { width, height },
    canvasSettings: {
      layers,
      activeLayerIdx,
      color,
      brushSize,
      brushShape,
      eraserBrushSize,
      drawThrottleDelay,
      canvasTransferQueueLength,
    },
  } = useSectionInfos((x) => {
    return {
      size: x.x[sectionId].size,
      canvasSettings: x.x[sectionId].canvasSettings,
    };
  }, _.isEqual);
  const localLayers = useRef([]);
  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const strokesRef = useRef([]);
  const prevPointRef = useRef(null);
  const artifactIdUsedToSetCanvasSize = useRef(null);
  const processedArtifacteKeys = useRef([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  // This is hack for getting setDraftCanvasProperties to run again
  // after processLoadedArtifacts runs.
  // For some reason, setDraftCanvasProperties needs to run after processLoadedArtifacts,
  // otherwise the draftCanvas doesn't get the correct strokeStyle. I don't know why though.
  const [forceRerender, setForceRerender] = useState(false);

  const layerOpacity = layers[activeLayerIdx]?.layerOpacity ?? 1;
  const brushOpacity = layers[activeLayerIdx]?.brushOpacity ?? 1;
  const currBrushStrokeArtifactId = layers[activeLayerIdx]?.artifactIds?.find(
    (a) => artifacts[a]?.type === "brushStrokes",
  );

  // console.log("artifacts", artifacts);
  // console.log("layers", layers);
  // console.log("activeLayerIdx", activeLayerIdx);
  // console.log("localLayers", localLayers.current);
  // console.log("currBrushStrokeArtifactId", currBrushStrokeArtifactId);

  async function processLoadedArtifacts() {
    if (!isLoaded) {
      return;
    }
    if (localLayers.current.length === 0) {
      for (const layer of layers) {
        const artifactIdToType = Object.fromEntries(
          layer.artifactIds.map((a) => [a, artifacts[a].type]),
        );
        localLayers.current.push(newDrawAreaLocalLayer(artifactIdToType));
      }
    }

    await syncArtifactValuesWithLocalLayers(artifacts, layers, localLayers);

    if (_.isEqual(Object.keys(artifacts), processedArtifacteKeys)) {
      return;
    }
    // We want to make sure every layer has a brushStrokes artifact
    for (const localLayer of localLayers.current) {
      if (!Object.values(localLayer).some((v) => v.type === "brushStrokes")) {
        localLayer[createNewId()] =
          newDrawAreaLocalLayerArtifactData("brushStrokes");
      }
    }

    useSectionInfos.setState((state) => {
      const currGlobalLayers = syncDrawAreaLocalLayersWithGlobalState(
        sectionId,
        localLayers,
        state,
      );
      setCanvasSize({
        sectionId,
        canvasRef,
        tempCanvasRef,
        draftCanvasRef,
        localLayers,
        layers: currGlobalLayers,
        artifactIdUsedToSetCanvasSize,
        state,
      });

      if (activeLayerIdx === null) {
        state.x[sectionId].canvasSettings.activeLayerIdx =
          localLayers.current.length - 1;
      }
    });

    setForceRerender(true);
    processedArtifacteKeys.current = Object.keys(artifacts);
  }

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
    processLoadedArtifacts();
  }, [Object.keys(artifacts), isLoaded]);

  useEffect(() => {
    useSectionInfos.setState((state) => {
      setCanvasSize({
        sectionId,
        canvasRef,
        tempCanvasRef,
        draftCanvasRef,
        localLayers,
        layers,
        artifactIdUsedToSetCanvasSize,
        state,
      });
    });
  }, [height, width]);

  useDeepCompareEffect(() => {
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
    drawAllLayers({ canvasRef, tempCanvasRef, localLayers, layers });
    setForceRerender(false);
  }, [
    isEraser,
    color,
    brushSize,
    eraserBrushSize,
    brushShape,
    layerOpacity,
    brushOpacity,
    Object.values(layers).map((v) => v.visible),
    forceRerender,
  ]);

  useEffect(() => {
    const storedStrokes =
      localLayers.current[activeLayerIdx]?.[currBrushStrokeArtifactId]?.value;
    if (storedStrokes) {
      strokesRef.current = _.cloneDeep(storedStrokes);
    }
  }, [
    activeLayerIdx,
    currBrushStrokeArtifactId,
    localLayers.current.length === 0,
  ]);

  function onMouseDown(e, offsetX, offsetY) {
    if (useMisc.getState().mouseDownDraggingSection) {
      return;
    }

    if (!useMisc.getState().mouseDownDrawArea) {
      // We want to do this just on the first mouse down.
      setActiveSectionIdAndUpdateZIndex(sectionId);
    }
    useMisc.setState({ mouseDownDrawArea: true });

    // nothing to erase
    if (isEraser && strokesRef.current.length === 0) {
      return;
    }
    setIsDrawing(true);
    let point;
    if (offsetX && offsetY) {
      point = [offsetX, offsetY];
    } else {
      point = getXY(e);
    }
    startNewStroke(draftCanvasRef, strokesRef, point);
    prevPointRef.current = point;
  }

  function onMouseMove(e) {
    if (!isDrawing) {
      return;
    }
    const point = getXY(e);
    const currStroke = strokesRef.current[strokesRef.current.length - 1];
    if (!isEraser && currStroke.points.length >= canvasTransferQueueLength) {
      transferEverythingToRealCanvas();
      startNewStroke(draftCanvasRef, strokesRef, point);
      prevPointRef.current = point;
    } else {
      drawStroke(draftCanvasRef, prevPointRef.current, point);
      currStroke.points.push(point);
      prevPointRef.current = point;
    }
  }

  // useCallback so that throttle function doesn't get recreated and reset timer
  const throttledOnMouseMove = useCallback(
    drawThrottleDelay > 0
      ? _.throttle(onMouseMove, drawThrottleDelay)
      : onMouseMove,
    [onMouseMove, drawThrottleDelay],
  );

  function onMouseUp() {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    transferEverythingToRealCanvas();
    debouncedSetBrushStrokesArtifact(
      currBrushStrokeArtifactId,
      strokesRef.current,
    );
    // debouncedSendDrawingToInteractiveTasks(sectionId, toBase64);
  }

  function onMouseEnter(e) {
    if (e.buttons === 1) {
      // have to compute offset this way for some reason
      // otherwise it's inaccurate
      const zoom = getZoom();
      const rect = draftCanvasRef.current.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / zoom;
      const offsetY = (e.clientY - rect.top) / zoom;
      onMouseDown(e, offsetX, offsetY);
    }
  }

  function transferEverythingToRealCanvas() {
    localLayers.current[activeLayerIdx][currBrushStrokeArtifactId].value =
      _.cloneDeep(strokesRef.current);
    drawAllLayers({ canvasRef, tempCanvasRef, localLayers, layers });
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

  function reorderLayers(draggedIdx, targetIdx) {
    useSectionInfos.setState((state) => {
      const canvasSettings = state.x[sectionId].canvasSettings;
      const currActiveLayerName = canvasSettings.layers[activeLayerIdx].name;
      canvasSettings.layers = arrayMove(
        canvasSettings.layers,
        draggedIdx,
        targetIdx,
      );
      localLayers.current = arrayMove(
        localLayers.current,
        draggedIdx,
        targetIdx,
      );
      canvasSettings.activeLayerIdx = canvasSettings.layers.findIndex(
        (x) => x.name === currActiveLayerName,
      );
    });
    setForceRerender(true);
  }

  const { getRootProps, isDragActive } = useImageLoadViaDropzone(sectionId);

  const canvasClassName = `single-cell-child max-w-full place-self-center ${isDragActive ? "outline outline-4 outline-green-500 dark:outline-green-500/80" : ""}`;
  const cursorIcon = isEraser
    ? "cursor-[url(../../../erase.svg)_0_24,_pointer]"
    : "cursor-[url(../../../pen.svg)_0_24,_pointer]";

  return (
    <>
      <DrawAreaControls
        sectionId={sectionId}
        layers={layers}
        activeLayerIdx={activeLayerIdx}
        color={color}
        brushOpacity={brushOpacity}
        brushSize={brushSize}
        brushShape={brushShape}
        eraserBrushSize={eraserBrushSize}
        isEraser={isEraser}
        setIsEraser={setIsEraser}
        layerOpacity={layerOpacity}
        clearStrokes={clearStrokes}
        reorderLayers={reorderLayers}
      />
      <section
        className="nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0"
        {...getRootProps()}
      >
        <div className="single-cell-child single-cell-container">
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={throttledOnMouseMove}
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

function setDraftCanvasProperties({
  draftCanvasRef,
  color,
  brushSize,
  brushShape,
  brushOpacity,
  eraserBrushSize,
  isEraser,
  layerOpacity,
}) {
  const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
  if (isEraser) {
    dCtx.globalCompositeOperation = "destination-out";
    dCtx.strokeStyle = "rgba(0,0,0,1)";
    dCtx.lineWidth = eraserBrushSize;
    dCtx.lineCap = brushShape;
    dCtx.globalAlpha = 1;
  } else {
    dCtx.globalCompositeOperation = "source-over";
    dCtx.strokeStyle = hexToRGBA(color, brushOpacity);
    dCtx.lineWidth = brushSize;
    dCtx.lineCap = brushShape;
    dCtx.globalAlpha = layerOpacity;
  }
}

function setCanvasSize({
  sectionId,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  localLayers,
  layers,
  artifactIdUsedToSetCanvasSize,
  state,
}) {
  const [canvas] = getCanvasAndCtx(canvasRef);
  const [tempCanvas] = getCanvasAndCtx(tempCanvasRef);
  const [draftCanvas] = getCanvasAndCtx(draftCanvasRef);

  let imgSize = null;
  let isNewImg = false;
  for (const localLayer of localLayers.current) {
    for (const [artifactId, valueInfo] of Object.entries(localLayer)) {
      if (valueInfo.type === "img" && valueInfo.value.complete) {
        const image = valueInfo.value;
        imgSize = { width: image.width, height: image.height };
        isNewImg = artifactId !== artifactIdUsedToSetCanvasSize.current;
        artifactIdUsedToSetCanvasSize.current = artifactId;
        break;
      }
    }

    if (imgSize) {
      break;
    }
  }

  const canvasSize = setDrawAreaSectionSize({
    sectionId,
    imgSize,
    isNewImg,
    state,
  });

  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;

  tempCanvas.width = canvasSize.width;
  tempCanvas.height = canvasSize.height;

  draftCanvas.width = canvasSize.width;
  draftCanvas.height = canvasSize.height;

  drawAllLayers({ canvasRef, tempCanvasRef, localLayers, layers });
}

function getXY(e) {
  const { offsetX, offsetY } = e.nativeEvent;
  return [offsetX, offsetY];
}

function clearCanvas(canvasRef) {
  const ctx = getCtx(canvasRef);
  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
}

function getCanvasAndCtx(canvasRef) {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  return [canvas, ctx];
}

function getCtx(canvasRef) {
  return canvasRef.current.getContext("2d");
}

function drawAllLayers({
  canvasRef,
  tempCanvasRef,
  localLayers,
  layers,
  excludeLayer = null,
  includeLayer = null,
}) {
  const [canvas, ctx] = getCanvasAndCtx(canvasRef);
  clearCanvas(canvasRef);

  for (const [idx, localLayer] of localLayers.current.entries()) {
    if (
      !layers[idx].visible ||
      (excludeLayer !== null && idx === excludeLayer) ||
      (includeLayer !== null && idx !== includeLayer)
    ) {
      continue;
    }
    const { layerOpacity } = layers[idx];

    for (const valueInfo of Object.values(localLayer)) {
      if (valueInfo.type === "img" && valueInfo.value.complete) {
        const image = valueInfo.value;
        const scale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height,
        );
        const x = canvas.width / 2 - (image.width / 2) * scale;
        const y = canvas.height / 2 - (image.height / 2) * scale;

        ctx.globalAlpha = layerOpacity;
        ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
      } else if (
        valueInfo.type === "brushStrokes" &&
        valueInfo.value.length > 0
      ) {
        drawStrokes(canvasRef, tempCanvasRef, valueInfo.value, layerOpacity);
      }
    }
  }
}

function startNewStroke(draftCanvasRef, strokesRef, firstPoint) {
  const [draftCanvas, dCtx] = getCanvasAndCtx(draftCanvasRef);
  strokesRef.current.push({
    strokeStyle: dCtx.strokeStyle,
    lineWidth: dCtx.lineWidth,
    lineCap: dCtx.lineCap,
    points: [firstPoint],
    canvasHeight: draftCanvas.height,
    canvasWidth: draftCanvas.width,
    globalCompositeOperation: dCtx.globalCompositeOperation,
  });
  drawStroke(draftCanvasRef, firstPoint, firstPoint);
}

function drawStrokes(canvasRef, tempCanvasRef, strokes, layerOpacity) {
  const [tempCanvas, tempCtx] = getCanvasAndCtx(tempCanvasRef);
  strokes.forEach((stroke) => {
    drawSavedStrokeOntoTempCanvas(tempCanvas, tempCtx, stroke);
  });

  const ctx = getCtx(canvasRef);
  const originalGlobalCompositeOperation = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = layerOpacity;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.globalCompositeOperation = originalGlobalCompositeOperation;

  clearCanvas(tempCanvasRef);
}

function drawSavedStrokeOntoTempCanvas(canvas, ctx, stroke) {
  const scale = Math.min(
    canvas.width / stroke.canvasWidth,
    canvas.height / stroke.canvasHeight,
  );
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.globalCompositeOperation = stroke.globalCompositeOperation;
  ctx.strokeStyle = stroke.strokeStyle;
  ctx.globalAlpha = 1;
  ctx.lineWidth = stroke.lineWidth;
  ctx.lineCap = stroke.lineCap;
  let prevPoint = stroke.points[0];
  stroke.points.forEach((point) => {
    ctx.moveTo(prevPoint[0], prevPoint[1]);
    ctx.lineTo(point[0], point[1]);
    prevPoint = point;
  });
  ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawStroke(canvasRef, from, to) {
  const ctx = getCtx(canvasRef);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

function hexToRGBA(_hex, opacity) {
  // Remove # if present
  const hex = _hex.replace("#", "");

  // Parse r, g, b values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function syncDrawAreaLocalLayersWithGlobalState(
  sectionId,
  localLayers,
  sectionState,
) {
  const currGlobalLayers = sectionState.x[sectionId].canvasSettings.layers;
  for (const [idx, localLayer] of localLayers.current.entries()) {
    const localLayerArtifactIds = Object.keys(localLayer);
    // add missing layer
    if (idx > currGlobalLayers.length - 1) {
      currGlobalLayers.push(
        newLayerSettings({ artifactIds: localLayerArtifactIds }),
      );
    } else {
      // sync artifactIds
      currGlobalLayers[idx].artifactIds = localLayerArtifactIds;
    }

    for (const artifactId of localLayerArtifactIds) {
      const layerArtifactInfo = localLayer[artifactId];
      const type = layerArtifactInfo.type;
      const value =
        type === "img"
          ? dataURLToBase64(layerArtifactInfo.value.src)
          : layerArtifactInfo.value;
      maybeCreateArtifactAndUpdateSection(
        sectionId,
        artifactId,
        {
          type,
          value,
        },
        sectionState,
      );
    }
  }
  return currGlobalLayers;
}

async function syncArtifactValuesWithLocalLayers(
  artifacts,
  layers,
  localLayers,
) {
  for (const [artifactId, v] of Object.entries(artifacts)) {
    let matchingLocalLayer = null;
    for (const [idx, layer] of layers.entries()) {
      if (layer.artifactIds.includes(artifactId)) {
        matchingLocalLayer = localLayers.current[idx];
        break;
      }
    }
    if (!matchingLocalLayer) {
      localLayers.current.push(newDrawAreaLocalLayer({ [artifactId]: v.type }));
      matchingLocalLayer = localLayers.current[localLayers.current.length - 1];
    }
    if (v.type === "img") {
      const base64String = `data:image/png;base64,${v.value}`;
      const storedImage = matchingLocalLayer[artifactId].value;
      if (storedImage.src !== base64String || !storedImage.complete) {
        storedImage.src = base64String;
        await storedImage.decode();
      }
    } else if (v.type === "brushStrokes") {
      const strokesObj = matchingLocalLayer[artifactId];
      if (!_.isEqual(strokesObj.value, v.value)) {
        strokesObj.value = _.cloneDeep(v.value);
      }
    }
  }
}
