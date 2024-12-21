import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/activeSections";
import {
  base64RequestId,
  setTemporaryMiscState,
} from "state/actions/temporaryMiscState";
import {
  useArtifacts,
  useMisc,
  useSectionInfos,
  useTemporaryMiscState,
} from "state/definitions";
import { useSectionArtifactGroups } from "state/hooks/artifacts";
import { setDrawAreaSectionSize } from "state/hooks/sectionSizes";
import useDeepCompareEffect from "use-deep-compare-effect";
import { DrawAreaControls } from "./DrawAreaControls";
import {
  debouncedSetBrushStrokesArtifact,
  useImageLoadViaDropzone,
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
    },
  } = useSectionInfos((x) => {
    return {
      size: x.x[sectionId].size,
      canvasSettings: x.x[sectionId].canvasSettings,
    };
  }, _.isEqual);
  const canvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const strokesRef = useRef([]);
  const prevPointRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  const activeLayer = layers.find((x) => x.id === activeLayerId);
  const layerOpacity = activeLayer?.layerOpacity ?? 1;
  const brushOpacity = activeLayer?.brushOpacity ?? 1;
  const currBrushStrokeArtifactId = activeLayer?.artifactIds?.find(
    (a) => loadedArtifacts[a]?.type === "brushStrokes",
  );

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
        layers,
        state,
      });
    });
    setCanvasProperties({
      canvasRef,
      color,
      brushSize,
      brushShape,
      brushOpacity,
      eraserBrushSize,
      isEraser,
      layerOpacity,
    });
    drawAllLayers({ canvasRef, tempCanvasRef, layers });
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
    startNewStroke(canvasRef, strokesRef, point);
    prevPointRef.current = point;
  }

  function onMouseMove(e) {
    if (!isDrawing) {
      return;
    }
    const point = getXY(e);
    const currStroke = strokesRef.current[strokesRef.current.length - 1];
    if (!isEraser && currStroke.points.length >= 10000) {
      transferEverythingToRealCanvas();
      startNewStroke(canvasRef, strokesRef, point);
      prevPointRef.current = point;
    } else {
      drawStroke(canvasRef, prevPointRef.current, point);
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
      const rect = canvasRef.current.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / zoom;
      const offsetY = (e.clientY - rect.top) / zoom;
      onMouseDown(e, offsetX, offsetY);
    }
  }

  function transferEverythingToRealCanvas() {
    useArtifacts.setState((state) => ({
      [currBrushStrokeArtifactId]: {
        ...state[currBrushStrokeArtifactId],
        value: _.cloneDeep(strokesRef.current),
      },
    }));
    // drawAllLayers({ canvasRef, tempCanvasRef, layers });
    // clearCanvas(canvasRef);
  }

  function clearStrokes() {
    strokesRef.current = [];
    transferEverythingToRealCanvas();
    debouncedSetBrushStrokesArtifact(
      currBrushStrokeArtifactId,
      strokesRef.current,
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
            onMouseMove={throttledOnMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseEnter={onMouseEnter}
            className={`${cursorIcon} ${canvasClassName}`}
          />
          {/* <canvas
            ref={canvasRef}
            className={`pointer-events-none ${canvasClassName}`}
          /> */}
        </div>
      </section>
    </>
  );
}

function setCanvasProperties({
  canvasRef,
  color,
  brushSize,
  brushShape,
  brushOpacity,
  eraserBrushSize,
  isEraser,
  layerOpacity,
}) {
  const dCtx = getCtx(canvasRef);
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

function setCanvasSize({ sectionId, canvasRef, tempCanvasRef, layers, state }) {
  const [canvas] = getCanvasAndCtx(canvasRef);
  const [tempCanvas] = getCanvasAndCtx(tempCanvasRef);

  const artifactIdUsedToSetCanvasSize =
    state.x[sectionId].canvasSettings.artifactIdUsedToSetCanvasSize;
  const artifactState = useArtifacts.getState();
  let imgSize = maybeGetImgSizeFromArtifact(
    artifactState[artifactIdUsedToSetCanvasSize],
  );
  let isNewImg = false;

  if (!imgSize) {
    for (const layer of layers) {
      for (const id of layer.artifactIds) {
        if (!(id in artifactState)) {
          continue;
        }
        const artifact = artifactState[id];
        imgSize = maybeGetImgSizeFromArtifact(artifact);
        if (imgSize) {
          state.x[sectionId].canvasSettings.artifactIdUsedToSetCanvasSize = id;
          isNewImg = true;
          break;
        }
      }

      if (imgSize) {
        break;
      }
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

  drawAllLayers({ canvasRef, tempCanvasRef, layers });
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
  layers,
  excludeLayer = null,
  includeLayer = null,
}) {
  const [canvas, ctx] = getCanvasAndCtx(canvasRef);
  const [tempCanvas, tempCtx] = getCanvasAndCtx(tempCanvasRef);
  clearCanvas(canvasRef);

  const artifactState = useArtifacts.getState();
  for (const layer of layers) {
    if (
      !layer.visible ||
      (excludeLayer !== null && layer.id === excludeLayer) ||
      (includeLayer !== null && layer.id !== includeLayer)
    ) {
      continue;
    }
    const { layerOpacity } = layer;
    const artifactIdsToDraw = reorderIdsWithBrushStrokesLast(
      layer.artifactIds,
      artifactState,
    );

    for (const id of artifactIdsToDraw) {
      if (!(id in artifactState)) {
        return;
      }
      const artifact = artifactState[id];
      if (
        artifact.type === "img" &&
        artifact.value instanceof Image &&
        artifact.value.complete
      ) {
        const image = artifact.value;
        const scale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height,
        );
        const x = canvas.width / 2 - (image.width / 2) * scale;
        const y = canvas.height / 2 - (image.height / 2) * scale;

        tempCtx.globalAlpha = 1;
        tempCtx.drawImage(
          image,
          x,
          y,
          image.width * scale,
          image.height * scale,
        );
      } else if (
        artifact.type === "brushStrokes" &&
        artifact.value.length > 0
      ) {
        artifact.value.forEach((stroke) => {
          drawSavedStrokeOntoTempCanvas(tempCanvas, tempCtx, stroke);
        });
      }
    }
    const originalGlobalCompositeOperation = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = layerOpacity;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.globalCompositeOperation = originalGlobalCompositeOperation;
    clearCanvas(tempCanvasRef);
  }
}

function startNewStroke(canvasRef, strokesRef, firstPoint) {
  const [draftCanvas, dCtx] = getCanvasAndCtx(canvasRef);
  strokesRef.current.push({
    strokeStyle: dCtx.strokeStyle,
    lineWidth: dCtx.lineWidth,
    lineCap: dCtx.lineCap,
    points: [firstPoint],
    canvasHeight: draftCanvas.height,
    canvasWidth: draftCanvas.width,
    globalCompositeOperation: dCtx.globalCompositeOperation,
  });
  drawStroke(canvasRef, firstPoint, firstPoint);
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
    ctx.stroke();
    prevPoint = point;
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawStroke(canvasRef, from, to) {
  const ctx = getCtx(canvasRef);
  console.log("drawStroke", ctx)
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

function reorderIdsWithBrushStrokesLast(artifactIds, artifactState) {
  const brushStrokeIds = [];
  const otherIds = [];

  // Sort ids into two arrays using a for loop
  for (let i = 0; i < artifactIds.length; i++) {
    const id = artifactIds[i];
    const obj = artifactState[id];

    if (obj && obj.type === "brushStrokes") {
      brushStrokeIds.push(id);
    } else {
      otherIds.push(id);
    }
  }

  // Combine arrays using spread operator
  return [...otherIds, ...brushStrokeIds];
}

function maybeGetImgSizeFromArtifact(artifact) {
  if (artifact?.type === "img" && artifact?.value?.complete) {
    const image = artifact.value;
    return { width: image.width, height: image.height };
  }
  return null;
}
