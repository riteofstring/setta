import { getZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
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
  newDrawAreaLocalLayerState,
  newLayerSettings,
} from "utils/objs/artifact";
import { DrawAreaControls } from "./DrawAreaControls";
import { useImageLoadViaDropzone } from "./utils";

export function DrawOnImage({ sectionId }) {
  const { artifacts, isLoaded } = useArtifactData(sectionId);
  const {
    size: { width, height },
    canvasSettings: {
      layerSettings,
      activeLayerId,
      color,
      brushSize,
      brushShape,
      eraserBrushSize,
    },
  } = useSectionInfos((x) => {
    return {
      size: x.x[sectionId].size,
      canvasSettings: x.x[sectionId].canvasSettings,
    };
  }, _.isEqual);
  const layers = useRef({});
  const canvasRef = useRef(null);
  const draftCanvasRef = useRef(null);
  const tempCanvasRef = useRef(null);
  const strokesRef = useRef([]);
  const prevPointRef = useRef(null);
  const artifactIdUsedToSetCanvasSize = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEraser, setIsEraser] = useState(false);

  const layerOpacity = layerSettings[activeLayerId]?.layerOpacity ?? 1;
  const brushOpacity = layerSettings[activeLayerId]?.brushOpacity ?? 1;

  async function processLoadedArtifacts() {
    if (!isLoaded) {
      return;
    }
    let firstBrushStrokeLayerId = null;
    for (const [artifactId, v] of Object.entries(artifacts)) {
      if (!(artifactId in layers.current)) {
        layers.current[artifactId] = newDrawAreaLocalLayerState(v.type);
      }
      if (v.type === "img") {
        const base64String = `data:image/png;base64,${v.value}`;
        const storedImage = layers.current[artifactId].image;
        if (storedImage.src !== base64String) {
          storedImage.src = base64String;
          await storedImage.decode();
        }
      } else if (v.type === "brushStrokes") {
        layers.current[artifactId].strokes = _.cloneDeep(v.value);
        if (!firstBrushStrokeLayerId) {
          firstBrushStrokeLayerId = artifactId;
        }
      }
    }

    useSectionInfos.setState((state) => {
      if (!firstBrushStrokeLayerId) {
        firstBrushStrokeLayerId = createNewId();
        layers.current[firstBrushStrokeLayerId] =
          newDrawAreaLocalLayerState("brushStrokes");
        maybeCreateArtifactAndUpdateSection(
          sectionId,
          firstBrushStrokeLayerId,
          {
            type: "brushStrokes",
            value: [],
          },
          state,
        );
      }

      const latestLayerSettings =
        state.x[sectionId].canvasSettings.layerSettings;
      for (const id of Object.keys(layers.current)) {
        if (!(id in latestLayerSettings)) {
          latestLayerSettings[id] = newLayerSettings();
        }
      }
      setCanvasSize({
        sectionId,
        canvasRef,
        tempCanvasRef,
        draftCanvasRef,
        layers,
        layerSettings: latestLayerSettings,
        artifactIdUsedToSetCanvasSize,
        state,
      });

      if (!activeLayerId) {
        state.x[sectionId].canvasSettings.activeLayerId =
          firstBrushStrokeLayerId;
      }
    });
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
        layers,
        layerSettings,
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
    drawAllLayers({ canvasRef, tempCanvasRef, layers, layerSettings });
  }, [
    isEraser,
    color,
    brushSize,
    eraserBrushSize,
    brushShape,
    layerOpacity,
    brushOpacity,
    Object.values(layerSettings).map((v) => v.visible),
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
    transferActiveLayerToDraft();
    startNewStroke(draftCanvasRef, strokesRef, point);
    prevPointRef.current = point;
  }

  function onMouseMove(e) {
    if (!isDrawing) {
      return;
    }
    const point = getXY(e);
    const currStroke = strokesRef.current[strokesRef.current.length - 1];
    if (!isEraser && currStroke.points.length >= 50) {
      // simulate mouseup->mousedown
      transferEverythingToRealCanvas();
      transferActiveLayerToDraft();
      startNewStroke(draftCanvasRef, strokesRef, point);
      prevPointRef.current = point;
    } else {
      drawStroke(draftCanvasRef, prevPointRef.current, point);
      currStroke.points.push(point);
      prevPointRef.current = point;
    }
  }

  function onMouseUp() {
    if (!isDrawing) {
      return;
    }
    setIsDrawing(false);
    transferEverythingToRealCanvas();
    // debouncedSetBrushStrokesArtifact(
    //   sectionId,
    //   activeLayerId,
    //   strokesRef.current,
    // );
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
    layers.current[activeLayerId].strokes = strokesRef.current;
    drawAllLayers({ canvasRef, tempCanvasRef, layers, layerSettings });
    clearCanvas(draftCanvasRef);
  }

  function transferActiveLayerToDraft() {
    clearAllCanvases();
    drawAllLayers({
      canvasRef,
      tempCanvasRef,
      layers,
      layerSettings,
      excludeLayer: activeLayerId,
    });
    drawAllLayers({
      canvasRef: draftCanvasRef,
      tempCanvasRef,
      layers,
      layerSettings,
      includeLayer: activeLayerId,
      applyLayerOpacityToGlobalAlpha: false,
    });
  }

  function clearStrokes() {
    strokesRef.current = [];
    clearAllCanvases();
    debouncedSetBrushStrokesArtifact(
      sectionId,
      strokesArtifactId,
      strokesRef.current,
    );
  }

  function clearAllCanvases() {
    clearCanvas(canvasRef);
    clearCanvas(tempCanvasRef);
    clearCanvas(draftCanvasRef);
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
        layers={layers.current}
        layerSettings={layerSettings}
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
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseEnter={onMouseEnter}
            className={`${cursorIcon} ${canvasClassName}`}
          />
          <canvas
            ref={draftCanvasRef}
            className={`pointer-events-none z-10 ${canvasClassName}`}
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
    dCtx.globalAlpha = 1;
    draftCanvas.style.opacity = layerOpacity;
  }
}

function setCanvasSize({
  sectionId,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  layers,
  layerSettings,
  artifactIdUsedToSetCanvasSize,
  state,
}) {
  const [canvas] = getCanvasAndCtx(canvasRef);
  const [tempCanvas] = getCanvasAndCtx(tempCanvasRef);
  const [draftCanvas] = getCanvasAndCtx(draftCanvasRef);

  let imgSize = null;
  let isNewImg = false;
  for (const [id, layer] of Object.entries(layers.current)) {
    if (layer.image?.complete) {
      const image = layer.image;
      imgSize = { width: image.width, height: image.height };
      isNewImg = id !== artifactIdUsedToSetCanvasSize.current;
      artifactIdUsedToSetCanvasSize.current = id;
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

  drawAllLayers({ canvasRef, tempCanvasRef, layers, layerSettings });
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
  layerSettings,
  excludeLayer = null,
  includeLayer = null,
  applyLayerOpacityToGlobalAlpha = true,
}) {
  const [canvas, ctx] = getCanvasAndCtx(canvasRef);
  clearCanvas(canvasRef);

  for (const [id, layer] of Object.entries(layers.current)) {
    if (
      !(id in layerSettings) ||
      !layerSettings[id].visible ||
      (excludeLayer && id === excludeLayer) ||
      (includeLayer && id !== includeLayer)
    ) {
      continue;
    }
    const { layerOpacity } = layerSettings[id];
    if (layer.image?.complete) {
      const image = layer.image;

      const scale = Math.min(
        canvas.width / image.width,
        canvas.height / image.height,
      );
      const x = canvas.width / 2 - (image.width / 2) * scale;
      const y = canvas.height / 2 - (image.height / 2) * scale;

      if (applyLayerOpacityToGlobalAlpha) {
        ctx.globalAlpha = layerOpacity;
      }
      ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
    } else if (layer.strokes?.length > 0) {
      drawStrokes(
        canvasRef,
        tempCanvasRef,
        layer.strokes,
        layerOpacity,
        applyLayerOpacityToGlobalAlpha,
      );
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

function drawStrokes(
  canvasRef,
  tempCanvasRef,
  strokes,
  layerOpacity,
  applyLayerOpacityToGlobalAlpha = true,
) {
  const [tempCanvas, tempCtx] = getCanvasAndCtx(tempCanvasRef);
  strokes.forEach((stroke) => {
    drawSavedStrokeOntoTempCanvas(tempCanvas, tempCtx, stroke);
  });

  const ctx = getCtx(canvasRef);
  const originalGlobalCompositeOperation = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "source-over";
  if (applyLayerOpacityToGlobalAlpha) {
    ctx.globalAlpha = layerOpacity;
  }
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
