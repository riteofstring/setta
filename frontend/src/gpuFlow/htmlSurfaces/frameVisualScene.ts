import type { HtmlSurfaceVisualBuildResult } from "./surfaceVisuals";
import {
  createHtmlSurfaceVisualScene,
  type FlowRect,
  type HtmlSurfaceFlatVisual,
  type HtmlSurfaceSolidRoundedRectVisual,
  type HtmlSurfaceTextureCoordinates,
  type HtmlSurfaceTiledFlatVisual,
  type HtmlSurfaceVisualScene,
} from "./visualScene";

type CreateGpuNodeVisualSceneInput = {
  readonly htmlSurfaceNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly htmlSurfaceOverlayVisuals: HtmlSurfaceVisualBuildResult | undefined;
  readonly htmlSurfacePageVisuals: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly htmlSurfaceVisuals: HtmlSurfaceVisualBuildResult;
};

export function createGpuNodeVisualScene(
  input: CreateGpuNodeVisualSceneInput,
): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    ...createGpuNodeVisualSceneSurfaces(input),
    displayListGroups: createGpuNodeVisualSceneDisplayListGroups(input),
  });
}

function createGpuNodeVisualSceneSurfaces({
  htmlSurfaceNativeVisuals,
  htmlSurfaceOverlayVisuals,
  htmlSurfacePageVisuals,
  htmlSurfaceVisuals,
}: CreateGpuNodeVisualSceneInput) {
  const flatSurfaces = [
    ...htmlSurfaceVisuals.flatSurfaces,
    ...(htmlSurfacePageVisuals ?? []),
    ...(htmlSurfaceOverlayVisuals?.flatSurfaces ?? []),
  ];
  const tiledFlatSurfaces = [
    ...htmlSurfaceVisuals.tiledFlatSurfaces,
    ...(htmlSurfaceOverlayVisuals?.tiledFlatSurfaces ?? []),
  ];
  return {
    flatSurfaces,
    solidRoundedRectSurfaces: htmlSurfaceNativeVisuals ?? [],
    tiledFlatSurfaces,
  };
}

function createGpuNodeVisualSceneDisplayListGroups({
  htmlSurfaceNativeVisuals,
  htmlSurfaceOverlayVisuals,
  htmlSurfacePageVisuals,
  htmlSurfaceVisuals,
}: CreateGpuNodeVisualSceneInput) {
  const retainedContentRects = (htmlSurfacePageVisuals ?? []).map(toFlowRect);
  const clippedHtmlSurfaceVisuals = clipHtmlSurfaceVisualsAgainstRects(
    htmlSurfaceVisuals,
    retainedContentRects,
  );
  return [
    {
      flatSurfaces: clippedHtmlSurfaceVisuals.flatSurfaces,
      renderLayer: "section-shell",
      role: "section-shell",
      tiledFlatSurfaces: clippedHtmlSurfaceVisuals.tiledFlatSurfaces,
    },
    {
      flatSurfaces: htmlSurfacePageVisuals,
      renderLayer: "retained-content",
      role: "retained-content-page",
    },
    {
      renderLayer: "retained-overlay",
      role: "retained-scrollbar",
      solidRoundedRectSurfaces: htmlSurfaceNativeVisuals,
    },
    {
      flatSurfaces: htmlSurfaceOverlayVisuals?.flatSurfaces,
      renderLayer: "section-overlay",
      role: "section-overlay",
      tiledFlatSurfaces: htmlSurfaceOverlayVisuals?.tiledFlatSurfaces,
    },
  ] as const;
}

function clipHtmlSurfaceVisualsAgainstRects(
  visualSurfaces: HtmlSurfaceVisualBuildResult,
  clipRects: readonly FlowRect[],
): HtmlSurfaceVisualBuildResult {
  if (clipRects.length === 0) {
    return visualSurfaces;
  }
  return {
    flatSurfaces: visualSurfaces.flatSurfaces.flatMap((surface) =>
      clipFlatSurfaceAgainstRects(surface, clipRects),
    ),
    tiledFlatSurfaces: visualSurfaces.tiledFlatSurfaces.flatMap((surface) =>
      clipTiledFlatSurfaceAgainstRects(surface, clipRects),
    ),
  };
}

function clipFlatSurfaceAgainstRects(
  surface: HtmlSurfaceFlatVisual,
  clipRects: readonly FlowRect[],
): readonly HtmlSurfaceFlatVisual[] {
  const pieces = subtractRects(toFlowRect(surface), clipRects);
  if (pieces.length === 1 && flowRectsEqual(pieces[0], surface)) {
    return [surface];
  }
  const sourceCoordinates = resolveFlatSurfaceTextureCoordinates(surface);
  return pieces.map((piece) => ({
    ...piece,
    kind: "flat",
    surfaceId: surface.surfaceId,
    texture: surface.texture,
    textureCoordinates: mapFlatSurfaceTextureCoordinates({
      piece,
      sourceCoordinates,
      surfaceRect: toFlowRect(surface),
    }),
    zIndex: surface.zIndex,
  }));
}

function clipTiledFlatSurfaceAgainstRects(
  surface: HtmlSurfaceTiledFlatVisual,
  clipRects: readonly FlowRect[],
): readonly HtmlSurfaceTiledFlatVisual[] {
  const pieces = subtractRects(surface.rect, clipRects);
  if (pieces.length === 1 && flowRectsEqual(pieces[0], surface.rect)) {
    return [surface];
  }
  const sourceRect = surface.textureSourceRect ?? {
    height: surface.rect.height,
    width: surface.rect.width,
    x: 0,
    y: 0,
  };
  return pieces.map((piece) => ({
    kind: "tiled-flat",
    rect: piece,
    surfaceId: surface.surfaceId,
    texture: surface.texture,
    textureSourceRect: mapSurfaceRectToSourceRect({
      piece,
      sourceRect,
      surfaceRect: surface.rect,
    }),
    tiles: surface.tiles,
    zIndex: surface.zIndex,
  }));
}

function subtractRects(
  surfaceRect: FlowRect,
  clipRects: readonly FlowRect[],
): readonly FlowRect[] {
  let pieces = [surfaceRect];
  for (const clipRect of clipRects) {
    pieces = pieces.flatMap((piece) => subtractRect(piece, clipRect));
    if (pieces.length === 0) {
      break;
    }
  }
  return pieces;
}

function subtractRect(surfaceRect: FlowRect, clipRect: FlowRect): FlowRect[] {
  const intersection = intersectFlowRects(surfaceRect, clipRect);
  if (!intersection) {
    return [surfaceRect];
  }
  const pieces: FlowRect[] = [];
  const surfaceBottom = surfaceRect.y + surfaceRect.height;
  const surfaceRight = surfaceRect.x + surfaceRect.width;
  const intersectionBottom = intersection.y + intersection.height;
  const intersectionRight = intersection.x + intersection.width;
  pushPositiveRect(pieces, {
    height: intersection.y - surfaceRect.y,
    width: surfaceRect.width,
    x: surfaceRect.x,
    y: surfaceRect.y,
  });
  pushPositiveRect(pieces, {
    height: surfaceBottom - intersectionBottom,
    width: surfaceRect.width,
    x: surfaceRect.x,
    y: intersectionBottom,
  });
  pushPositiveRect(pieces, {
    height: intersection.height,
    width: intersection.x - surfaceRect.x,
    x: surfaceRect.x,
    y: intersection.y,
  });
  pushPositiveRect(pieces, {
    height: intersection.height,
    width: surfaceRight - intersectionRight,
    x: intersectionRight,
    y: intersection.y,
  });
  return pieces;
}

function pushPositiveRect(rects: FlowRect[], rect: FlowRect) {
  if (rect.width > 0 && rect.height > 0) {
    rects.push(rect);
  }
}

function intersectFlowRects(left: FlowRect, right: FlowRect): FlowRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.min(left.x + left.width, right.x + right.width) - x;
  const height = Math.min(left.y + left.height, right.y + right.height) - y;
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}

function resolveFlatSurfaceTextureCoordinates(
  surface: HtmlSurfaceFlatVisual,
): HtmlSurfaceTextureCoordinates {
  return surface.textureCoordinates ?? { u0: 0, u1: 1, v0: 0, v1: 1 };
}

function mapFlatSurfaceTextureCoordinates({
  piece,
  sourceCoordinates,
  surfaceRect,
}: {
  readonly piece: FlowRect;
  readonly sourceCoordinates: HtmlSurfaceTextureCoordinates;
  readonly surfaceRect: FlowRect;
}): HtmlSurfaceTextureCoordinates {
  const uScale = sourceCoordinates.u1 - sourceCoordinates.u0;
  const vScale = sourceCoordinates.v1 - sourceCoordinates.v0;
  return {
    u0:
      sourceCoordinates.u0 +
      ((piece.x - surfaceRect.x) / surfaceRect.width) * uScale,
    u1:
      sourceCoordinates.u0 +
      ((piece.x + piece.width - surfaceRect.x) / surfaceRect.width) * uScale,
    v0:
      sourceCoordinates.v0 +
      ((piece.y - surfaceRect.y) / surfaceRect.height) * vScale,
    v1:
      sourceCoordinates.v0 +
      ((piece.y + piece.height - surfaceRect.y) / surfaceRect.height) * vScale,
  };
}

function mapSurfaceRectToSourceRect({
  piece,
  sourceRect,
  surfaceRect,
}: {
  readonly piece: FlowRect;
  readonly sourceRect: FlowRect;
  readonly surfaceRect: FlowRect;
}): FlowRect {
  const scaleX = sourceRect.width / surfaceRect.width;
  const scaleY = sourceRect.height / surfaceRect.height;
  return {
    height: piece.height * scaleY,
    width: piece.width * scaleX,
    x: sourceRect.x + (piece.x - surfaceRect.x) * scaleX,
    y: sourceRect.y + (piece.y - surfaceRect.y) * scaleY,
  };
}

function toFlowRect(surface: FlowRect): FlowRect {
  return {
    height: surface.height,
    width: surface.width,
    x: surface.x,
    y: surface.y,
  };
}

function flowRectsEqual(left: FlowRect | undefined, right: FlowRect): boolean {
  return (
    Boolean(left) &&
    left?.height === right.height &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y
  );
}
