import _ from "lodash";
import {
  useArtifacts,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { setDrawAreaSectionSize } from "state/hooks/sectionSizes";
import {
  ArtifactTypeEnum,
  CanvasPoint,
  DrawAreaBrushShape,
  DrawAreaLayer,
  DrawAreaLayerItem,
  DrawAreaLayerItemTypeEnum,
  SectionSize,
} from "utils/generatedTypes";
import { LayerCanvasesType, Strokes, TempCanvasesType } from "./types";

export const RESIZE_HANDLE_SIZE = 16;

export function setDraftCanvasProperties(
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  brushColor: string,
  brushSize: number,
  brushShape: DrawAreaBrushShape,
  brushOpacity: number,
  layerOpacity: number,
) {
  if (!draftCanvasRef.current) {
    return;
  }
  const dCtx = getCtx(draftCanvasRef.current);
  if (!dCtx) {
    return;
  }
  dCtx.globalCompositeOperation = "source-over";
  dCtx.strokeStyle = hexToRGBA(brushColor, brushOpacity);
  dCtx.lineWidth = brushSize;
  dCtx.lineCap = brushShape;
  dCtx.globalAlpha = layerOpacity;
}

// ctx.save() -> ctx.restore() doesn't work: https://stackoverflow.com/questions/48044951/canvas-state-lost-after-changing-size
function resizeDraftCanvasAndKeepProperties(
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
) {
  if (!draftCanvasRef.current) {
    return;
  }
  const dCtx = getCtx(draftCanvasRef.current);
  if (!dCtx) {
    return;
  }
  const {
    globalCompositeOperation,
    strokeStyle,
    lineWidth,
    lineCap,
    globalAlpha,
  } = dCtx;
  draftCanvasRef.current.width = width;
  draftCanvasRef.current.height = height;
  dCtx.globalCompositeOperation = globalCompositeOperation;
  dCtx.strokeStyle = strokeStyle;
  dCtx.lineWidth = lineWidth;
  dCtx.lineCap = lineCap;
  dCtx.globalAlpha = globalAlpha;
}

export function setCanvasSize(
  sectionId: string,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  sectionSize: SectionSize,
  state: ZustandProjectState,
) {
  const canvasSize = setDrawAreaSectionSize(sectionId, sectionSize, state);

  for (const c of Object.values(layerCanvasRefs.current)) {
    if (c) {
      c.width = canvasSize.width;
      c.height = canvasSize.height;
    }
  }

  for (const c of Object.values(tempCanvasRefs.current)) {
    if (c) {
      c.width = canvasSize.width;
      c.height = canvasSize.height;
    }
  }

  resizeDraftCanvasAndKeepProperties(
    draftCanvasRef,
    canvasSize.width,
    canvasSize.height,
  );
}

export function getXY(e: React.MouseEvent<HTMLCanvasElement>): CanvasPoint {
  const { offsetX, offsetY } = e.nativeEvent;
  return [offsetX, offsetY];
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = getCtx(canvas);
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function getCtx(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d");
}

export function setGlobalBrushStrokesAndDrawAllLayers(
  sectionId: string,
  strokesRef,
  layerCanvasRefs,
  tempCanvasRefs,
  draftCanvasRef,
) {
  useArtifacts.setState((state) => ({
    x: {
      ...state.x,
      [currBrushStrokeArtifactId]: {
        ...state.x[currBrushStrokeArtifactId],
        value: _.cloneDeep(strokesRef.current),
        modifiedByInfo: {
          modifiedBy: sectionId,
          timestamp: Date.now().toString(),
        },
      },
    },
  }));
  drawAllLayers(sectionId, layerCanvasRefs, tempCanvasRefs);
  clearCanvas(draftCanvasRef.current);
}

export function setGlobalArtifactTransformsAndDrawAllLayers(
  sectionId,
  activeLayerId,
  localArtifactTransformsRef,
  resizeHandleCorners,
  layerCanvasRefs,
  tempCanvasRefs,
  fnCanvasToBase64,
) {
  useProjectState.setState((state) => {
    for (const [idx, t] of state.artifactGroups[
      activeLayerId
    ].artifactTransforms.entries()) {
      const { transform, eraserStrokes } =
        localArtifactTransformsRef.current[idx];
      t.transform = _.cloneDeep(transform);
      t.eraserStrokes = _.cloneDeep(eraserStrokes);
    }
  });

  drawAllLayers(
    sectionId,
    layerCanvasRefs,
    tempCanvasRefs,
    fnCanvasToBase64,
    {},
    {},
    { [activeLayerId]: resizeHandleCorners.current },
  );
}

export function drawAllLayers(
  layers: Array<DrawAreaLayer>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  realTimeValues = [], // array of {artifactId: value}
  realTimeTransforms = [], // array of {idx: {transform, eraserStrokes}}
  realTimeResizeHandles = [], // array of array of corner coordinates
  realTimeEraserStrokes = [], // array of eraserStrokes array
) {
  for (const [idx, layer] of layers.entries()) {
    if (!layerCanvasRefs.current[idx]) {
      continue;
    }
    drawOneLayer(
      layer,
      layerCanvasRefs.current[idx],
      tempCanvasRefs,
      realTimeValues[idx],
      realTimeTransforms[idx],
      realTimeResizeHandles[idx],
      realTimeEraserStrokes[idx],
    );
  }
}

function drawOneLayer(
  layer: DrawAreaLayer,
  layerCanvas: HTMLCanvasElement,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
  realTimeValues = {}, // artifactId -> value
  realTimeTransforms = {}, // idx -> {transform, eraserStrokes}
  realTimeResizeHandles = [], // array of corner coordinates
  realTimeEraserStrokes = [], // eraserStrokes array
) {
  clearCanvas(layerCanvas);

  if (
    !layer.visible ||
    !tempCanvasRefs.current.layer ||
    !tempCanvasRefs.current.artifact
  ) {
    return;
  }

  const ctx = getCtx(layerCanvas);
  const layerTempCanvas = tempCanvasRefs.current.layer;
  const layerTempCtx = getCtx(tempCanvasRefs.current.layer);
  const artifactTempCanvas = tempCanvasRefs.current.artifact;
  const artifactTempCtx = getCtx(tempCanvasRefs.current.artifact);
  if (!ctx || !layerTempCtx || !artifactTempCtx) {
    return;
  }

  const artifactState = useArtifacts.getState().x;
  const { layerOpacity } = layer;

  for (const [idx, t] of layer.elements.entries()) {
    if (!(t.dataPath in artifactState)) {
      continue;
    }
    const artifact = artifactState[t.dataPath];

    artifactTempCtx.globalAlpha = 1;
    artifactTempCtx.globalCompositeOperation = "source-over";

    if (
      t.type === DrawAreaLayerItemTypeEnum.Image &&
      artifact.value instanceof Image &&
      artifact.value.complete
    ) {
      const image = realTimeValues?.[id] ?? artifact.value;
      const transformInfo = realTimeTransforms?.[idx] ?? t.transform;
      artifactTempCtx.setTransform(...transformInfo.transform);
      artifactTempCtx.drawImage(image, 0, 0, image.width, image.height);
      drawStrokesOntoTempCanvas(
        artifactTempCtx,
        transformInfo.eraserStrokes,
        transformInfo.transform,
      );
    } else if (
      artifact.type === ArtifactTypeEnum.BRUSH_STROKES &&
      artifact.value.length > 0
    ) {
      const strokes = realTimeValues?.[id] ?? artifact.value;
      const artifactTransformInfo = realTimeTransforms?.[idx] ?? t;
      drawStrokesOntoTempCanvas(
        artifactTempCtx,
        strokes,
        artifactTransformInfo.transform,
        artifactTransformInfo.eraserStrokes,
      );
    }

    artifactTempCtx.resetTransform(); // MUST reset, otherwise get smudging when moving images around. No idea why

    layerTempCtx.globalAlpha = 1;
    layerTempCtx.globalCompositeOperation = "source-over";
    layerTempCtx.drawImage(artifactTempCanvas, 0, 0);

    clearCanvas(tempCanvasRefs.current.artifact);
  }

  if (realTimeEraserStrokes) {
    drawStrokesOntoTempCanvas(layerTempCtx, realTimeEraserStrokes);
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = layerOpacity;
  ctx.drawImage(layerTempCanvas, 0, 0);

  if (realTimeResizeHandles) {
    drawResizeHandles(ctx, realTimeResizeHandles);
  }

  clearCanvas(tempCanvasRefs.current.layer);
}

export function startNewStroke(
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  strokesRef: React.RefObject<Strokes>,
  firstPoint: CanvasPoint,
) {
  if (!draftCanvasRef.current) {
    return;
  }
  const dCtx = getCtx(draftCanvasRef.current);
  if (!dCtx) {
    return;
  }
  // for now, only allow string strokeStyle.
  // we can add support for CanvasGradient etc later if needed.
  if (typeof dCtx.strokeStyle !== "string") {
    return;
  }
  strokesRef.current.push({
    strokeStyle: dCtx.strokeStyle,
    lineWidth: dCtx.lineWidth,
    lineCap: dCtx.lineCap,
    points: [firstPoint],
    // canvasHeight: draftCanvas.height,
    // canvasWidth: draftCanvas.width,
    globalCompositeOperation: dCtx.globalCompositeOperation,
  });
  drawStroke(draftCanvasRef.current, firstPoint, firstPoint);
}

export function startNewEraserStroke(
  eraserStrokesRef: React.RefObject<Strokes>,
  eraserBrushSize: number,
  brushShape: DrawAreaBrushShape,
  firstPoint: CanvasPoint,
) {
  eraserStrokesRef.current.push({
    strokeStyle: "rgba(0,0,0,1)",
    lineWidth: eraserBrushSize,
    lineCap: brushShape,
    points: [firstPoint],
    // canvasHeight: draftCanvas.height,
    // canvasWidth: draftCanvas.width,
    globalCompositeOperation: "destination-out",
  });
}

function drawStrokesOntoTempCanvas(
  ctx,
  strokes,
  artifactTransform = null,
  pairedStrokes = {},
) {
  for (const [idx, stroke] of strokes.entries()) {
    // const scale = Math.min(
    //   canvas.width / stroke.canvasWidth,
    //   canvas.height / stroke.canvasHeight,
    // );
    // ctx.scale(scale, scale);
    drawStrokeOntoTempCanvas(ctx, stroke, artifactTransform);
    if (pairedStrokes[idx]) {
      for (const pairedStroke of pairedStrokes[idx]) {
        drawStrokeOntoTempCanvas(ctx, pairedStroke, artifactTransform);
      }
    }
  }
}

function drawStrokeOntoTempCanvas(ctx, stroke, artifactTransform) {
  const transform = getCombinedTransformForStroke(
    artifactTransform,
    stroke.transform,
  );
  if (transform) {
    ctx.setTransform(...transform);
  }
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
}

export function drawStroke(
  canvas: HTMLCanvasElement,
  from: CanvasPoint,
  to: CanvasPoint,
) {
  const ctx = getCtx(canvas);
  if (!ctx) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

function drawResizeHandles(ctx, resizeHandles) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#4299e1"; // blue-500

  resizeHandles.forEach((corner) => {
    ctx.fillRect(
      corner.x - RESIZE_HANDLE_SIZE / 2,
      corner.y - RESIZE_HANDLE_SIZE / 2,
      RESIZE_HANDLE_SIZE,
      RESIZE_HANDLE_SIZE,
    );
  });
}

export function getCombinedTransformForStroke(
  artifactTransform,
  strokeTransform,
) {
  if (!artifactTransform && !strokeTransform) {
    return null;
  }
  if (!strokeTransform) {
    return artifactTransform;
  }
  if (!artifactTransform) {
    return strokeTransform;
  }

  return [
    artifactTransform[0] * strokeTransform[0], // multiply scales
    0,
    0,
    artifactTransform[3] * strokeTransform[3], // multiply scales
    artifactTransform[4] + strokeTransform[4] * artifactTransform[0], // transform the translation
    artifactTransform[5] + strokeTransform[5] * artifactTransform[3], // transform the translation
  ];
}

export function getInverseTransform(
  transform: DrawAreaLayerItem["transform"],
): DrawAreaLayerItem["transform"] {
  // Inverse transform:
  // - Divide by scale instead of multiply
  // - Subtract translated position divided by scale
  return [
    1 / transform[0],
    0,
    0,
    1 / transform[3],
    -transform[4] / transform[0],
    -transform[5] / transform[3],
  ];
}

function hexToRGBA(_hex: string, opacity: number) {
  // Remove # if present
  const hex = _hex.replace("#", "");

  // Parse r, g, b values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function maybeGetImgSizeFromArtifact(artifact) {
  if (artifact?.type === ArtifactTypeEnum.IMG && artifact?.value?.complete) {
    const image = artifact.value;
    return { width: image.width, height: image.height };
  }
  return null;
}
