import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { appendDrawAreaLayerItem } from "openapi/http";
import {
  queueBrushStrokeForSave,
  queueTransformsForSave,
} from "state/actions/artifacts";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useBrushStrokes,
  useDecodedImages,
  useDrawAreaLayerItemTransform,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { setDrawAreaSectionSize } from "state/hooks/sectionSizes";
import { bumpLocalRevisions } from "state/utils/revisions";
import {
  ArtifactTypeEnum,
  BrushStroke,
  BrushStrokeArtifact,
  BrushStrokeWithTransform,
  CanvasPoint,
  createBrushStroke,
  createBrushStrokeArtifact,
  createDrawAreaLayerItem,
  createDrawAreaLayerItemTransform,
  createDrawAreaLayerItemTransformArtifact,
  DrawAreaBrushShape,
  DrawAreaLayer,
  DrawAreaLayerItem,
  DrawAreaLayerItemTransformArtifact,
  DrawAreaTransform,
  SectionSize,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { updateArrayAt } from "utils/utils";
import { filterEraserPath } from "./eraserIntersection";
import { getBrushStrokesBounds, getImageBounds } from "./mouseHandlerUtils";
import {
  getIdentityTransform,
  invertTransform as invertAffineTransform,
  multiplyTransforms,
} from "./transformUtils";
import {
  LayerCanvasesType,
  LocalLayerItemState,
  ResizeHandleCorners,
  TempCanvasesType,
} from "./types";
export const RESIZE_HANDLE_SIZE = 16;

type DraftCanvasPropertiesArgs = {
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  brushColor: string;
  brushSize: number;
  brushShape: DrawAreaBrushShape;
  brushOpacity: number;
  layerOpacity: number;
};

type SetCanvasSizeArgs = {
  sectionId: string;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sectionSize: SectionSize;
  state: ZustandProjectState;
};

type DrawLayerRealtimeArgs = {
  realTimeTransforms?: Array<DrawAreaLayerItemTransformArtifact>;
  realTimeResizeHandles?: ResizeHandleCorners | null;
  realTimeEraserStroke?: BrushStroke | null;
};

type DrawOneLayerArgs = {
  layer: DrawAreaLayer;
  layerCanvas: HTMLCanvasElement;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
} & DrawLayerRealtimeArgs;

type DrawAllLayersArgs = {
  layers: Array<DrawAreaLayer>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  realTimeTransforms?: Record<
    number,
    Array<DrawAreaLayerItemTransformArtifact>
  >;
  realTimeResizeHandles?: Record<number, ResizeHandleCorners>;
  realTimeEraserStroke?: Record<number, BrushStroke>;
};

type AddNewBrushStrokeArgs = {
  sectionId: string;
  layerIdx: number;
  stroke: BrushStrokeArtifact;
  layer: DrawAreaLayer;
  layerCanvas: HTMLCanvasElement;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
  draftCanvas: HTMLCanvasElement;
};

type SetGlobalArtifactTransformsArgs = {
  sectionId: string;
  layers: Array<DrawAreaLayer>;
  activeLayerIdx: number;
  localArtifactTransformsRef: React.RefObject<Array<LocalLayerItemState>>;
  resizeHandleCorners: React.RefObject<ResizeHandleCorners | null>;
  layerCanvasRefs: React.RefObject<LayerCanvasesType>;
  tempCanvasRefs: React.RefObject<TempCanvasesType>;
};

type DrawLayerContexts = {
  ctx: CanvasRenderingContext2D;
  layerTempCanvas: HTMLCanvasElement;
  layerTempCtx: CanvasRenderingContext2D;
  artifactTempCanvas: HTMLCanvasElement;
  artifactTempCtx: CanvasRenderingContext2D;
};

type LayerItemRenderArtifact =
  | {
      kind: "image";
      image: HTMLImageElement;
      transformArtifact: DrawAreaLayerItemTransformArtifact;
    }
  | {
      kind: "brushStroke";
      brushStroke: BrushStrokeArtifact;
      transformArtifact: DrawAreaLayerItemTransformArtifact;
    };

export function setDraftCanvasProperties({
  draftCanvasRef,
  brushColor,
  brushSize,
  brushShape,
  brushOpacity,
  layerOpacity,
}: DraftCanvasPropertiesArgs) {
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
export function setCanvasSize({
  sectionId,
  layerCanvasRefs,
  tempCanvasRefs,
  draftCanvasRef,
  sectionSize,
  state,
}: SetCanvasSizeArgs) {
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
function addDrawAreaLayerItem(
  sectionId: string,
  layerIdx: number,
  layerItem: DrawAreaLayerItem,
) {
  useProjectState.setState((state) => {
    setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
      layers: (currLayers) => {
        const target = currLayers[layerIdx];
        if (!target) {
          return currLayers;
        }
        target.elements.push(layerItem);
        return updateArrayAt(currLayers, layerIdx, target);
      },
    });
  });
  return getCurrEffectiveSectionImplOfType(
    useProjectState.getState(),
    sectionId,
    SectionTypeEnum.Draw,
  ).layers[layerIdx];
}
export function addNewBrushStrokeToGlobalStateAndDrawLayer({
  sectionId,
  layerIdx,
  stroke,
  layer,
  layerCanvas,
  tempCanvasRefs,
  draftCanvas,
}: AddNewBrushStrokeArgs) {
  useBrushStrokes.setState((state) => {
    const existing = state.x[stroke.id];
    if (existing && _.isEqual(existing, stroke)) {
      return state;
    }
    const revisions = bumpLocalRevisions(
      {
        revisionById: state.revisionById,
        localRevisionById: state.localRevisionById,
      },
      [stroke.id],
      sectionId,
    );
    return {
      x: {
        ...state.x,
        [stroke.id]: _.cloneDeep(stroke),
      },
      ...revisions,
    };
  });
  const existingElement = layer.elements.find(
    (el) =>
      el.type === ArtifactTypeEnum.BrushStroke && el.dataPath === stroke.id,
  );
  if (existingElement) {
    drawOneLayer({ layer, layerCanvas, tempCanvasRefs });
    clearCanvas(draftCanvas);
    queueBrushStrokeForSave(stroke.id);
    return;
  }
  const newTransform = createDrawAreaLayerItemTransform({});
  const newTransformArtifact = createDrawAreaLayerItemTransformArtifact({
    value: newTransform,
  });
  useDrawAreaLayerItemTransform.setState((state) => {
    const existing = state.x[newTransformArtifact.id];
    if (existing && _.isEqual(existing, newTransformArtifact)) {
      return state;
    }
    const revisions = bumpLocalRevisions(
      {
        revisionById: state.revisionById,
        localRevisionById: state.localRevisionById,
      },
      [newTransformArtifact.id],
      sectionId,
    );
    return {
      x: { ...state.x, [newTransformArtifact.id]: newTransformArtifact },
      ...revisions,
    };
  });
  const newLayerItem = createDrawAreaLayerItem({
    type: ArtifactTypeEnum.BrushStroke,
    dataPath: stroke.id,
    transformId: newTransformArtifact.id,
  });
  const updatedLayer = addDrawAreaLayerItem(sectionId, layerIdx, newLayerItem);
  if (updatedLayer) {
    drawOneLayer({
      layer: updatedLayer,
      layerCanvas,
      tempCanvasRefs,
    });
    void callOpenAPI(
      appendDrawAreaLayerItem({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          layerIdx,
          element: newLayerItem,
        },
      } as Parameters<typeof appendDrawAreaLayerItem>[0]),
    );
  } else {
    console.error("updatedLayer is undefined. This shouldn't happen");
  }
  queueBrushStrokeForSave(stroke.id, {
    transformId: newTransformArtifact.id,
  });
  clearCanvas(draftCanvas);
}
export function setGlobalArtifactTransformsAndDrawAllLayers({
  sectionId,
  layers,
  activeLayerIdx,
  localArtifactTransformsRef,
  resizeHandleCorners,
  layerCanvasRefs,
  tempCanvasRefs,
}: SetGlobalArtifactTransformsArgs): Array<string> {
  const activeLayer = layers[activeLayerIdx];
  if (!activeLayer) {
    return [];
  }
  const updatedTransformIds: Array<string> = [];
  useDrawAreaLayerItemTransform.setState((state) => {
    const changedIds: Array<string> = [];
    for (const [idx, element] of activeLayer.elements.entries()) {
      const local = localArtifactTransformsRef.current[idx];
      if (!local) {
        continue;
      }
      const transformArtifact = state.x[element.transformId];
      if (!transformArtifact) {
        continue;
      }
      transformArtifact.value.transform = _.cloneDeep(local.transform);
      transformArtifact.value.eraserStrokes = _.cloneDeep(local.eraserStrokes);
      updatedTransformIds.push(element.transformId);
      changedIds.push(element.transformId);
    }
    if (changedIds.length > 0) {
      const revisions = bumpLocalRevisions(
        {
          revisionById: state.revisionById,
          localRevisionById: state.localRevisionById,
        },
        changedIds,
        sectionId,
      );
      state.revisionById = revisions.revisionById;
      state.localRevisionById = revisions.localRevisionById;
    }
  });
  const layerCanvas = layerCanvasRefs.current[activeLayerIdx];
  if (!layerCanvas) {
    return [];
  }
  const activeResizeHandles =
    resizeHandleCorners.current && activeLayerIdx !== undefined
      ? resizeHandleCorners.current
      : null;
  drawOneLayer({
    layer: activeLayer,
    layerCanvas,
    tempCanvasRefs,
    realTimeResizeHandles: activeResizeHandles,
  });
  const uniqueIds = Array.from(new Set(updatedTransformIds));
  if (uniqueIds.length > 0) {
    queueTransformsForSave(uniqueIds, { immediate: true });
  }
  return uniqueIds;
}
export function drawAllLayers({
  layers,
  layerCanvasRefs,
  tempCanvasRefs,
  realTimeTransforms = {},
  realTimeResizeHandles = {},
  realTimeEraserStroke = {},
}: DrawAllLayersArgs) {
  for (const [idx, layer] of layers.entries()) {
    const layerCanvas = layerCanvasRefs.current[idx];
    if (!layerCanvas) {
      continue;
    }
    drawOneLayer({
      layer,
      layerCanvas,
      tempCanvasRefs,
      realTimeTransforms: realTimeTransforms[idx] ?? [],
      realTimeResizeHandles: realTimeResizeHandles[idx] ?? null,
      realTimeEraserStroke: realTimeEraserStroke[idx] ?? null,
    });
  }
}

function getDrawLayerContexts(
  layerCanvas: HTMLCanvasElement,
  tempCanvasRefs: React.RefObject<TempCanvasesType>,
): DrawLayerContexts | null {
  const layerTempCanvas = tempCanvasRefs.current.layer;
  const artifactTempCanvas = tempCanvasRefs.current.artifact;
  if (!layerTempCanvas || !artifactTempCanvas) {
    return null;
  }
  const ctx = getCtx(layerCanvas);
  const layerTempCtx = getCtx(layerTempCanvas);
  const artifactTempCtx = getCtx(artifactTempCanvas);
  if (!ctx || !layerTempCtx || !artifactTempCtx) {
    return null;
  }
  return {
    ctx,
    layerTempCanvas,
    layerTempCtx,
    artifactTempCanvas,
    artifactTempCtx,
  };
}

function resolveLayerItemRenderArtifact({
  element,
  elementIndex,
  realTimeTransforms,
  transforms,
  images,
  brushStrokes,
}: {
  element: DrawAreaLayer["elements"][number];
  elementIndex: number;
  realTimeTransforms: Array<DrawAreaLayerItemTransformArtifact>;
  transforms: ReturnType<typeof useDrawAreaLayerItemTransform.getState>["x"];
  images: ReturnType<typeof useDecodedImages.getState>["x"];
  brushStrokes: ReturnType<typeof useBrushStrokes.getState>["x"];
}): LayerItemRenderArtifact | null {
  const transformArtifact =
    realTimeTransforms[elementIndex] ?? transforms[element.transformId];
  if (!transformArtifact) {
    return null;
  }
  if (element.type === ArtifactTypeEnum.Image) {
    const image = images[element.dataPath];
    return image && image.complete
      ? {
          kind: "image",
          image,
          transformArtifact,
        }
      : null;
  }
  if (element.type === ArtifactTypeEnum.BrushStroke) {
    const brushStroke = brushStrokes[element.dataPath];
    return brushStroke && brushStroke.value.points.length > 0
      ? {
          kind: "brushStroke",
          brushStroke,
          transformArtifact,
        }
      : null;
  }
  return null;
}

function prepareArtifactTempCanvas(artifactTempCtx: CanvasRenderingContext2D) {
  artifactTempCtx.globalAlpha = 1;
  artifactTempCtx.globalCompositeOperation = "source-over";
}

function drawStoredEraserStrokes(
  artifactTempCtx: CanvasRenderingContext2D,
  transformArtifact: DrawAreaLayerItemTransformArtifact,
) {
  for (const stroke of transformArtifact.value.eraserStrokes) {
    drawStrokeOntoTempCanvas(
      artifactTempCtx,
      stroke,
      getCombinedTransformForStroke(
        transformArtifact.value.transform,
        stroke.transform,
      ),
    );
  }
}

function drawPreviewEraserStroke({
  artifactTempCtx,
  realTimeEraserStroke,
  bounds,
  artifactTransform,
}: {
  artifactTempCtx: CanvasRenderingContext2D;
  realTimeEraserStroke: BrushStroke | null;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  artifactTransform: DrawAreaTransform;
}) {
  if (!realTimeEraserStroke) {
    return;
  }
  const previewStroke = getPreviewEraserStrokeForBounds(
    realTimeEraserStroke,
    bounds,
    artifactTransform,
  );
  if (!previewStroke) {
    return;
  }
  drawStrokeOntoTempCanvas(
    artifactTempCtx,
    previewStroke,
    getCombinedTransformForStroke(artifactTransform, previewStroke.transform),
  );
}

function renderImageArtifact({
  artifactTempCtx,
  image,
  transformArtifact,
  realTimeEraserStroke,
}: {
  artifactTempCtx: CanvasRenderingContext2D;
  image: HTMLImageElement;
  transformArtifact: DrawAreaLayerItemTransformArtifact;
  realTimeEraserStroke: BrushStroke | null;
}) {
  const { transform } = transformArtifact.value;
  artifactTempCtx.setTransform(...transform);
  artifactTempCtx.drawImage(image, 0, 0, image.width, image.height);
  drawStoredEraserStrokes(artifactTempCtx, transformArtifact);
  drawPreviewEraserStroke({
    artifactTempCtx,
    realTimeEraserStroke,
    bounds: getImageBounds(image, transform),
    artifactTransform: transform,
  });
}

function renderBrushStrokeArtifact({
  artifactTempCtx,
  brushStroke,
  transformArtifact,
  realTimeEraserStroke,
}: {
  artifactTempCtx: CanvasRenderingContext2D;
  brushStroke: BrushStrokeArtifact;
  transformArtifact: DrawAreaLayerItemTransformArtifact;
  realTimeEraserStroke: BrushStroke | null;
}) {
  const { transform } = transformArtifact.value;
  drawStrokeOntoTempCanvas(artifactTempCtx, brushStroke.value, transform);
  drawStoredEraserStrokes(artifactTempCtx, transformArtifact);
  drawPreviewEraserStroke({
    artifactTempCtx,
    realTimeEraserStroke,
    bounds: getBrushStrokesBounds(brushStroke.value, transform),
    artifactTransform: transform,
  });
}

function renderLayerItemArtifact({
  artifact,
  artifactTempCtx,
  realTimeEraserStroke,
}: {
  artifact: LayerItemRenderArtifact;
  artifactTempCtx: CanvasRenderingContext2D;
  realTimeEraserStroke: BrushStroke | null;
}) {
  if (artifact.kind === "image") {
    renderImageArtifact({
      artifactTempCtx,
      image: artifact.image,
      transformArtifact: artifact.transformArtifact,
      realTimeEraserStroke,
    });
    return;
  }
  renderBrushStrokeArtifact({
    artifactTempCtx,
    brushStroke: artifact.brushStroke,
    transformArtifact: artifact.transformArtifact,
    realTimeEraserStroke,
  });
}

function composeRenderedArtifact({
  layerTempCtx,
  artifactTempCanvas,
  artifactTempCtx,
}: {
  layerTempCtx: CanvasRenderingContext2D;
  artifactTempCanvas: HTMLCanvasElement;
  artifactTempCtx: CanvasRenderingContext2D;
}) {
  artifactTempCtx.resetTransform();
  layerTempCtx.globalAlpha = 1;
  layerTempCtx.globalCompositeOperation = "source-over";
  layerTempCtx.drawImage(artifactTempCanvas, 0, 0);
  clearCanvas(artifactTempCanvas);
}

function drawLayerComposite({
  ctx,
  layerTempCanvas,
  layerOpacity,
  realTimeResizeHandles,
}: {
  ctx: CanvasRenderingContext2D;
  layerTempCanvas: HTMLCanvasElement;
  layerOpacity: number;
  realTimeResizeHandles: ResizeHandleCorners | null;
}) {
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = layerOpacity;
  ctx.drawImage(layerTempCanvas, 0, 0);
  if (realTimeResizeHandles) {
    drawResizeHandles(ctx, realTimeResizeHandles);
  }
}

export function drawOneLayer({
  layer,
  layerCanvas,
  tempCanvasRefs,
  realTimeTransforms = [],
  realTimeResizeHandles = null,
  realTimeEraserStroke = null,
}: DrawOneLayerArgs) {
  clearCanvas(layerCanvas);
  if (!layer.visible) {
    return;
  }
  const contexts = getDrawLayerContexts(layerCanvas, tempCanvasRefs);
  if (!contexts) {
    return;
  }
  const {
    ctx,
    layerTempCanvas,
    layerTempCtx,
    artifactTempCanvas,
    artifactTempCtx,
  } = contexts;
  const images = useDecodedImages.getState().x;
  const brushStrokes = useBrushStrokes.getState().x;
  const transforms = useDrawAreaLayerItemTransform.getState().x;
  const { layerOpacity } = layer;
  for (const [elementIndex, element] of layer.elements.entries()) {
    const artifact = resolveLayerItemRenderArtifact({
      element,
      elementIndex,
      realTimeTransforms,
      transforms,
      images,
      brushStrokes,
    });
    if (!artifact) {
      continue;
    }
    prepareArtifactTempCanvas(artifactTempCtx);
    renderLayerItemArtifact({
      artifact,
      artifactTempCtx,
      realTimeEraserStroke,
    });
    composeRenderedArtifact({
      layerTempCtx,
      artifactTempCanvas,
      artifactTempCtx,
    });
  }
  drawLayerComposite({
    ctx,
    layerTempCanvas,
    layerOpacity,
    realTimeResizeHandles,
  });
  clearCanvas(layerTempCanvas);
}
export function startNewStroke(
  draftCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  firstPoint: CanvasPoint,
): BrushStrokeArtifact | null {
  if (!draftCanvasRef.current) {
    return null;
  }
  const dCtx = getCtx(draftCanvasRef.current);
  if (!dCtx) {
    return null;
  }
  // for now, only allow string strokeStyle.
  // we can add support for CanvasGradient etc later if needed.
  if (typeof dCtx.strokeStyle !== "string") {
    return null;
  }
  drawStroke(draftCanvasRef.current, firstPoint, firstPoint);
  return createBrushStrokeArtifact({
    value: {
      strokeStyle: dCtx.strokeStyle,
      lineWidth: dCtx.lineWidth,
      lineCap: dCtx.lineCap,
      points: [firstPoint],
      // canvasHeight: draftCanvas.height,
      // canvasWidth: draftCanvas.width,
      globalCompositeOperation: dCtx.globalCompositeOperation,
    },
  });
}
export function startNewEraserStroke(
  eraserBrushSize: number,
  brushShape: DrawAreaBrushShape,
  firstPoint: CanvasPoint,
) {
  return createBrushStroke({
    strokeStyle: "rgba(0,0,0,1)",
    lineWidth: eraserBrushSize,
    lineCap: brushShape,
    points: [firstPoint],
    // canvasHeight: draftCanvas.height,
    // canvasWidth: draftCanvas.width,
    globalCompositeOperation: "destination-out",
  });
}
function drawStrokeOntoTempCanvas(
  ctx: CanvasRenderingContext2D,
  stroke: BrushStroke,
  transform: DrawAreaTransform | null,
) {
  if (transform) {
    ctx.setTransform(...transform);
  }
  ctx.globalCompositeOperation = stroke.globalCompositeOperation;
  ctx.strokeStyle = stroke.strokeStyle;
  ctx.globalAlpha = 1;
  ctx.lineWidth = stroke.lineWidth;
  ctx.lineCap = stroke.lineCap;
  let prevPoint: CanvasPoint | null = null;
  for (const point of stroke.points) {
    if (point === "BREAK") {
      // Reset the previous point to break the path
      prevPoint = null;
    } else if (prevPoint !== null) {
      // Draw a segment from prevPoint to current point
      ctx.beginPath();
      ctx.moveTo(prevPoint[0], prevPoint[1]);
      ctx.lineTo(point[0], point[1]);
      ctx.stroke();
      prevPoint = point;
    } else {
      // First point after a break or at the start
      prevPoint = point;
    }
  }
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
function drawResizeHandles(
  ctx: CanvasRenderingContext2D,
  resizeHandles: ResizeHandleCorners,
) {
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
  artifactTransform: DrawAreaTransform,
  strokeTransform: DrawAreaTransform,
): DrawAreaTransform {
  const artifact = artifactTransform ?? getIdentityTransform();
  const stroke = strokeTransform ?? getIdentityTransform();
  return multiplyTransforms(artifact, stroke);
}
function getPreviewEraserStrokeForBounds(
  eraserStroke: BrushStroke,
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  },
  artifactTransform: DrawAreaTransform,
): BrushStrokeWithTransform | null {
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
    return null;
  }
  const filteredPoints = filterEraserPath(
    eraserStroke.points,
    eraserStroke.lineWidth,
    eraserStroke.lineCap,
    bounds,
  );
  if (filteredPoints.length === 0) {
    return null;
  }
  return {
    ...eraserStroke,
    points: filteredPoints,
    transform: getInverseTransform(artifactTransform),
  };
}
export function getInverseTransform(
  transform: DrawAreaTransform,
): DrawAreaTransform {
  return invertAffineTransform(transform) ?? getIdentityTransform();
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
export function getActiveLayerAndCanvas(
  layers: Array<DrawAreaLayer>,
  layerCanvasRefs: React.RefObject<LayerCanvasesType>,
  activeLayerIdx: number,
) {
  const layer = layers[activeLayerIdx];
  const layerCanvas = layerCanvasRefs.current[activeLayerIdx];
  return [layer, layerCanvas] as const;
}
