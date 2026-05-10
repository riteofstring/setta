import {
  useCallback,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { getGpuRetainedContentSourceSurfaces } from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCacheNode,
  type GpuHtmlSurfaceOverlayLayout,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "../htmlSurfaces/sourceLayer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import { createGpuRetainedContentRowControlRect } from "../retainedContentRowLayout";
import { createGpuRetainedRowContentSceneWithScrollWindow } from "../retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "../retainedContentSceneSourceMetadata";
import type { GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";

export type GpuRetainedTextLikePreviewRecord = {
  readonly code: string;
  readonly defaultValue: string;
  readonly disabled: boolean;
  readonly error: boolean;
  readonly height: number;
  readonly language: string | null;
  readonly linePolicy: "multiline-auto" | "multiline-fixed" | "single-line";
  readonly rowId: string;
  readonly width: number;
  readonly wrapLines: boolean;
  readonly x: number;
  readonly y: number;
};

export type GpuRetainedTextLikePreviewSource = {
  readonly height: number;
  readonly previews: readonly GpuRetainedTextLikePreviewRecord[];
  readonly sectionId: string;
  readonly sourceHeight: number;
  readonly sourceId: string;
  readonly sourceWidth: number;
  readonly surfaceId: string;
  readonly textureSourceRect: GpuRect;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type GpuRetainedTextLikePreviewRenderer = (
  source: GpuRetainedTextLikePreviewSource,
) => ReactNode;

const GPU_RETAINED_TEXT_LIKE_PREVIEW_SOURCE_CLASS_NAME =
  "setta-gpu-flow__retained-text-like-preview-source";

export function useGpuFlowRetainedTextLikePreviewSources({
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  renderPreview,
  scene,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
}: {
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly renderPreview: GpuRetainedTextLikePreviewRenderer | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
}): {
  readonly retainedTextLikePreviewSourceElement: ReactNode;
  readonly retainedTextLikePreviewSurfaces: readonly GpuHtmlSurfaceOverlayLayout[];
} {
  const sources = useMemo(
    () =>
      renderPreview
        ? getGpuRetainedTextLikePreviewSources(scene)
        : EMPTY_TEXT_LIKE_PREVIEW_SOURCES,
    [renderPreview, scene],
  );
  const retainedTextLikePreviewSurfaces = useMemo(
    () => sources.map(toGpuRetainedTextLikePreviewSurfaceLayout),
    [sources],
  );
  const handlePreviewElementChange = useCallback(
    (sourceId: string, element: HTMLElement | null) => {
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        sourceId,
      );
      if (!element) {
        nodeElementByIdRef.current.delete(sourceId);
        transformOnlyPaintNodeIdsRef.current.delete(sourceId);
        textureManagerRef.current?.destroySurfaceTexture(sourceId);
        return;
      }
      nodeElementByIdRef.current.set(sourceId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [
      nodeDomTransformSyncCacheRef,
      nodeElementByIdRef,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
    ],
  );

  return {
    retainedTextLikePreviewSourceElement:
      renderPreview && sources.length > 0 ? (
        <GpuRetainedTextLikePreviewSourceLayer
          onPreviewElementChange={handlePreviewElementChange}
          renderPreview={renderPreview}
          sources={sources}
        />
      ) : null,
    retainedTextLikePreviewSurfaces,
  };
}

const EMPTY_TEXT_LIKE_PREVIEW_SOURCES: readonly GpuRetainedTextLikePreviewSource[] =
  [];

export function getGpuRetainedTextLikePreviewSources(
  scene: GpuFlowScene | undefined,
): readonly GpuRetainedTextLikePreviewSource[] {
  return getGpuRetainedContentSourceSurfaces(scene?.contentSurfaces).flatMap(
    (surface) => getGpuRetainedTextLikePreviewSourcesForSurface(surface),
  );
}

function getGpuRetainedTextLikePreviewSourcesForSurface(
  surface: ReturnType<typeof getGpuRetainedContentSourceSurfaces>[number],
): readonly GpuRetainedTextLikePreviewSource[] {
  const rasterScene = createGpuRetainedRowContentSceneWithScrollWindow({
    scene: surface.retainedScene,
    scrollOffset: surface.textureWindow.cacheScrollOffset,
    viewportRect: surface.textureWindow.cacheViewportRect,
  });
  const sourceInput = getGpuRetainedContentSceneSourceInput(rasterScene);
  if (!sourceInput) {
    return [];
  }
  const textureBounds = {
    height: surface.textureWindow.textureHeight,
    width: surface.textureWindow.textureWidth,
    x: 0,
    y: 0,
  };
  const previews = rasterScene.rows.flatMap((row) => {
    if (row.control?.kind !== "text-like" || row.state.nativeControlActive) {
      return [];
    }
    const controlRect = createGpuRetainedContentRowControlRect({
      controlWidth: sourceInput.controlWidth,
      indentWidth: sourceInput.indentWidth,
      rightInset: sourceInput.controlRightInset,
      rowDepth: row.depth,
      rowRect: row.projectedRect,
    });
    const visibleControlRect = intersectGpuRetainedTextLikePreviewRects(
      controlRect,
      textureBounds,
    );
    if (visibleControlRect.width <= 0 || visibleControlRect.height <= 0) {
      return [];
    }
    return [
      {
        code: row.control.displayValue,
        defaultValue: row.control.defaultDisplayValue,
        disabled: row.state.disabled,
        error: row.state.error,
        height: controlRect.height,
        language: row.control.policy.language,
        linePolicy: row.control.policy.linePolicy,
        rowId: row.id,
        width: controlRect.width,
        wrapLines: row.control.policy.wrapLines,
        x: controlRect.x,
        y: controlRect.y,
      },
    ];
  });
  if (previews.length === 0) {
    return [];
  }
  return [
    {
      height: surface.rect.height,
      previews,
      sectionId: surface.ownerSectionId,
      sourceHeight: surface.textureWindow.textureHeight,
      sourceId: getGpuRetainedTextLikePreviewSourceId(surface.id),
      sourceWidth: surface.textureWindow.textureWidth,
      surfaceId: surface.id,
      textureSourceRect: surface.textureWindow.sourceRect,
      width: surface.rect.width,
      x: surface.rect.x,
      y: surface.rect.y,
      zIndex: surface.zIndex + 1,
    },
  ];
}

function toGpuRetainedTextLikePreviewSurfaceLayout(
  source: GpuRetainedTextLikePreviewSource,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height: source.height,
    layer: "page",
    ownerNodeId: source.surfaceId,
    surfaceId: source.sourceId,
    textureContentKey: JSON.stringify({
      height: source.sourceHeight,
      previews: source.previews,
      width: source.sourceWidth,
    }),
    textureCssHeight: source.sourceHeight,
    textureCssWidth: source.sourceWidth,
    textureSourceRect: source.textureSourceRect,
    width: source.width,
    x: source.x,
    y: source.y,
    zIndex: source.zIndex,
  };
}

function GpuRetainedTextLikePreviewSourceLayer({
  onPreviewElementChange,
  renderPreview,
  sources,
}: {
  readonly onPreviewElementChange:
    | ((sourceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly renderPreview: GpuRetainedTextLikePreviewRenderer;
  readonly sources: readonly GpuRetainedTextLikePreviewSource[];
}) {
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuRetainedTextLikePreviewSourceElement}
      getSourceId={getGpuRetainedTextLikePreviewSourceIdFromSource}
      onSourceElementChange={onPreviewElementChange}
      renderSource={renderPreview}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_TEXT_LIKE_PREVIEW_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

function getGpuRetainedTextLikePreviewSourceIdFromSource(
  source: GpuRetainedTextLikePreviewSource,
): string {
  return source.sourceId;
}

function getGpuRetainedTextLikePreviewSourceId(surfaceId: string): string {
  return `retained-text-like-preview-page:${surfaceId}`;
}

function configureGpuRetainedTextLikePreviewSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedTextLikePreviewSource>) {
  host.dataset.gpuFlowRetainedTextLikePreviewPageSource = "true";
  host.dataset.gpuFlowRetainedSurfaceId = source.surfaceId;
  host.style.height = `${source.sourceHeight}px`;
  host.style.overflow = "hidden";
  host.style.width = `${source.sourceWidth}px`;
}

function intersectGpuRetainedTextLikePreviewRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
