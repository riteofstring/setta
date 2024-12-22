import _ from "lodash";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { useArtifacts } from "state/definitions";
import { setDrawAreaSectionSize } from "state/hooks/sectionSizes";

export function setDraftCanvasProperties({
  draftCanvasRef,
  color,
  brushSize,
  brushShape,
  brushOpacity,
  eraserBrushSize,
  isEraser,
  layerOpacity,
}) {
  const dCtx = getCtx(draftCanvasRef);
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

export function setCanvasSize({
  sectionId,
  canvasRef,
  tempCanvasRef,
  draftCanvasRef,
  layers,
  state,
}) {
  const [canvas] = getCanvasAndCtx(canvasRef);
  const [tempCanvas] = getCanvasAndCtx(tempCanvasRef);
  const [draftCanvas] = getCanvasAndCtx(draftCanvasRef);

  const artifactIdUsedToSetCanvasSize =
    state.x[sectionId].canvasSettings.artifactIdUsedToSetCanvasSize;
  const artifactState = useArtifacts.getState();
  let imgSize = maybeGetImgSizeFromArtifact(
    artifactState[artifactIdUsedToSetCanvasSize],
  );
  let isNewImg = false;

  if (!imgSize) {
    for (const layer of layers) {
      for (const t of layer.artifactTransforms) {
        const id = t.artifactId;
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

  draftCanvas.width = canvasSize.width;
  draftCanvas.height = canvasSize.height;

  drawAllLayers(canvasRef, tempCanvasRef, layers);
}

export function getXY(e) {
  const { offsetX, offsetY } = e.nativeEvent;
  return [offsetX, offsetY];
}

export function clearCanvas(canvasRef) {
  const ctx = getCtx(canvasRef);
  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
}

export function getCanvasAndCtx(canvasRef) {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  return [canvas, ctx];
}

export function getCtx(canvasRef) {
  return canvasRef.current.getContext("2d");
}

export function drawAllLayers(
  canvasRef,
  tempCanvasRef,
  layers,
  realTimeValues = {}, // layerId -> artifactId -> value
  realTimeTransforms = {}, // layerId -> index -> value
  realTimeResizeHandles = {}, // layerId -> handles
) {
  // console.log(
  //   "drawAllLayers",
  //   realTimeValues,
  //   realTimeTransforms,
  //   realTimeResizeHandles,
  // );
  const ctx = getCtx(canvasRef);
  const [tempCanvas, tempCtx] = getCanvasAndCtx(tempCanvasRef);
  clearCanvas(canvasRef);

  const artifactState = useArtifacts.getState();
  for (const layer of layers) {
    if (!layer.visible) {
      continue;
    }
    const { layerOpacity } = layer;
    const artifactsToDraw = reorderArtifactsWithBrushStrokesLast(
      layer.artifactTransforms,
      artifactState,
    );

    for (const [idx, t] of artifactsToDraw.entries()) {
      const id = t.artifactId;
      if (!(id in artifactState)) {
        return;
      }
      const artifact = artifactState[id];
      if (
        artifact.type === "img" &&
        artifact.value instanceof Image &&
        artifact.value.complete
      ) {
        const image = realTimeValues[layer.id]?.[id] ?? artifact.value;
        // const scale = Math.min(
        //   canvas.width / image.width,
        //   canvas.height / image.height,
        // );
        // const x = canvas.width / 2 - (image.width / 2) * scale;
        // const y = canvas.height / 2 - (image.height / 2) * scale;

        const transform = realTimeTransforms[layer.id]?.[idx] ?? t;
        tempCtx.globalAlpha = 1;
        tempCtx.globalCompositeOperation = "source-over";
        tempCtx.drawImage(
          image,
          transform.x,
          transform.y,
          // image.width * scale,
          // image.height * scale,
          transform.w,
          transform.h,
        );
      } else if (
        artifact.type === "brushStrokes" &&
        artifact.value.length > 0
      ) {
        const strokes = realTimeValues[layer.id]?.[id] ?? artifact.value;
        strokes.forEach((stroke) => {
          drawSavedStrokeOntoTempCanvas(tempCanvas, tempCtx, stroke);
        });
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = layerOpacity;
    ctx.drawImage(tempCanvas, 0, 0);

    if (realTimeResizeHandles[layer.id]) {
      drawResizeHandles(ctx, realTimeResizeHandles[layer.id]);
    }

    clearCanvas(tempCanvasRef);
  }
}

export function startNewStroke(
  draftCanvasRef,
  strokesRef,
  firstPoint,
  isEraser,
) {
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
  if (!isEraser) {
    drawStroke(draftCanvasRef, firstPoint, firstPoint);
  }
}

export function drawSavedStrokeOntoTempCanvas(canvas, ctx, stroke) {
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

export function drawStroke(canvasRef, from, to) {
  const ctx = getCtx(canvasRef);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

function drawResizeHandles(ctx, resizeHandles) {
  const handleSize = 8;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#4299e1"; // blue-500

  resizeHandles.forEach((corner) => {
    ctx.fillRect(
      corner.x - handleSize / 2,
      corner.y - handleSize / 2,
      handleSize,
      handleSize,
    );
  });
}

export function hexToRGBA(_hex, opacity) {
  // Remove # if present
  const hex = _hex.replace("#", "");

  // Parse r, g, b values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function reorderArtifactsWithBrushStrokesLast(
  artifactTransforms,
  artifactState,
) {
  const brushStrokes = [];
  const other = [];

  // Sort ids into two arrays using a for loop
  for (let i = 0; i < artifactTransforms.length; i++) {
    const obj = artifactState[artifactTransforms[i].artifactId];

    if (obj && obj.type === "brushStrokes") {
      brushStrokes.push(artifactTransforms[i]);
    } else {
      other.push(artifactTransforms[i]);
    }
  }

  // Combine arrays using spread operator
  return [...other, ...brushStrokes];
}

export function maybeGetImgSizeFromArtifact(artifact) {
  if (artifact?.type === "img" && artifact?.value?.complete) {
    const image = artifact.value;
    return { width: image.width, height: image.height };
  }
  return null;
}

export const debouncedSetBrushStrokesArtifact = _.debounce(
  (artifactId, strokes) => {
    useArtifacts.setState((state) => ({
      [artifactId]: { ...state[artifactId], value: _.cloneDeep(strokes) },
    }));
  },
  50,
);

export const debouncedSendDrawingToInteractiveTasks = _.debounce(
  (sectionId, fnToBase64) => {
    sendToInteractiveTasks([sectionId, "drawing"], fnToBase64());
  },
  500,
);
