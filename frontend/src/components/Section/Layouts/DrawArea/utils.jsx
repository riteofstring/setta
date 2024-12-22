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
  realTimeTransforms = {}, // layerId -> artifactId -> {transform, eraserStrokes}
  realTimeResizeHandles = {}, // layerId -> array of corner coordinates
  realTimeEraserStrokes = {}, // layerId -> eraserStrokes array
) {
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

    for (const t of artifactsToDraw) {
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
        const transformInfo = realTimeTransforms[layer.id]?.[id] ?? t;
        tempCtx.globalAlpha = 1;
        tempCtx.globalCompositeOperation = "source-over";
        tempCtx.setTransform(...transformInfo.transform);
        tempCtx.drawImage(image, 0, 0, image.width, image.height);
        drawSavedStrokesOntoTempCanvas(
          tempCanvas,
          tempCtx,
          transformInfo.eraserStrokes,
        );
        tempCtx.setTransform(1, 0, 0, 1, 0, 0); // MUST reset here, otherwise get smudging when moving images around. No idea why
      } else if (
        artifact.type === "brushStrokes" &&
        artifact.value.length > 0
      ) {
        const strokes = realTimeValues[layer.id]?.[id] ?? artifact.value;
        drawSavedStrokesOntoTempCanvas(tempCanvas, tempCtx, strokes);
      }
    }

    if (realTimeEraserStrokes[layer.id]) {
      drawSavedStrokesOntoTempCanvas(
        tempCanvas,
        tempCtx,
        realTimeEraserStrokes[layer.id],
      );
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

export function drawSavedStrokesOntoTempCanvas(canvas, ctx, strokes) {
  for (const stroke of strokes) {
    // const scale = Math.min(
    //   canvas.width / stroke.canvasWidth,
    //   canvas.height / stroke.canvasHeight,
    // );
    // ctx.scale(scale, scale);
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
    // ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
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

export function filterPathForImage(
  pathPoints,
  imageX,
  imageY,
  imageWidth,
  imageHeight,
) {
  if (!pathPoints || pathPoints.length === 0) {
    return [];
  }

  const result = [];
  let includeNext = false;

  for (let i = 0; i < pathPoints.length; i++) {
    const point = pathPoints[i];
    const isInBounds =
      point[0] >= imageX &&
      point[0] <= imageX + imageWidth &&
      point[1] >= imageY &&
      point[1] <= imageY + imageHeight;

    if (isInBounds) {
      if (i > 0 && result.length === 0) {
        // Include the previous point when entering bounds
        result.push(pathPoints[i - 1]);
      }
      result.push(point);
      includeNext = true;
    } else if (includeNext) {
      // Include one point after exiting bounds
      result.push(point);
      includeNext = false;
    }
  }

  return result;
}

export function maybeGetImgSizeFromArtifact(artifact) {
  if (artifact?.type === "img" && artifact?.value?.complete) {
    const image = artifact.value;
    return { width: image.width, height: image.height };
  }
  return null;
}

export const debouncedSendDrawingToInteractiveTasks = _.debounce(
  (sectionId, fnToBase64) => {
    sendToInteractiveTasks([sectionId, "drawing"], fnToBase64());
  },
  500,
);
