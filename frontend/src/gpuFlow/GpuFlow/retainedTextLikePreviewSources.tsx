import {
  useCallback,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";

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
import { getGpuRetainedContentSceneSourceInput } from "../retainedContentSceneSourceMetadata";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";

export type GpuRetainedTextLikePreviewSource = {
  readonly code: string;
  readonly defaultValue: string;
  readonly disabled: boolean;
  readonly error: boolean;
  readonly height: number;
  readonly language: string | null;
  readonly linePolicy: "multiline-auto" | "multiline-fixed" | "single-line";
  readonly rowId: string;
  readonly sectionId: string;
  readonly sourceHeight: number;
  readonly sourceId: string;
  readonly sourceWidth: number;
  readonly surfaceId: string;
  readonly textureSourceRect?: GpuRect | undefined;
  readonly width: number;
  readonly wrapLines: boolean;
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
  return (scene?.contentSurfaces ?? []).flatMap((surface) =>
    getGpuRetainedTextLikePreviewSourcesForSurface(surface),
  );
}

function getGpuRetainedTextLikePreviewSourcesForSurface(
  surface: GpuContentSurface,
): readonly GpuRetainedTextLikePreviewSource[] {
  const retainedScene = surface.retainedScene;
  if (surface.renderer.kind !== "canvas-content" || !retainedScene) {
    return [];
  }
  const sourceInput = getGpuRetainedContentSceneSourceInput(retainedScene);
  if (!sourceInput) {
    return [];
  }
  return retainedScene.rows.flatMap((row) => {
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
    const worldRect = translateGpuRetainedTextLikePreviewRect(
      controlRect,
      surface.rect,
    );
    const clippedWorldRect = intersectGpuRetainedTextLikePreviewRects(
      worldRect,
      surface.clipRect,
    );
    if (clippedWorldRect.width <= 0 || clippedWorldRect.height <= 0) {
      return [];
    }
    const sourceRect = {
      height: clippedWorldRect.height,
      width: clippedWorldRect.width,
      x: clippedWorldRect.x - worldRect.x,
      y: clippedWorldRect.y - worldRect.y,
    };
    return [
      {
        code: row.control.displayValue,
        defaultValue: row.control.defaultDisplayValue,
        disabled: row.state.disabled,
        error: row.state.error,
        height: clippedWorldRect.height,
        language: row.control.policy.language,
        linePolicy: row.control.policy.linePolicy,
        rowId: row.id,
        sectionId: surface.ownerSectionId,
        sourceHeight: worldRect.height,
        sourceId: getGpuRetainedTextLikePreviewSourceId(surface.id, row.id),
        sourceWidth: worldRect.width,
        surfaceId: surface.id,
        width: clippedWorldRect.width,
        wrapLines: row.control.policy.wrapLines,
        x: clippedWorldRect.x,
        y: clippedWorldRect.y,
        zIndex: surface.zIndex + 1,
        textureSourceRect: sourceRect,
      },
    ];
  });
}

function toGpuRetainedTextLikePreviewSurfaceLayout(
  source: GpuRetainedTextLikePreviewSource,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height: source.height,
    layer: "late",
    ownerNodeId: source.surfaceId,
    surfaceId: source.sourceId,
    textureContentKey: JSON.stringify({
      code: source.code,
      defaultValue: source.defaultValue,
      disabled: source.disabled,
      error: source.error,
      height: source.sourceHeight,
      language: source.language,
      linePolicy: source.linePolicy,
      width: source.sourceWidth,
      wrapLines: source.wrapLines,
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

function getGpuRetainedTextLikePreviewSourceId(
  surfaceId: string,
  rowId: string,
): string {
  return `retained-text-like-preview:${surfaceId}:${rowId}`;
}

function configureGpuRetainedTextLikePreviewSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedTextLikePreviewSource>) {
  host.dataset.gpuFlowRetainedTextLikePreviewSource = "true";
  host.dataset.gpuFlowRetainedSurfaceId = source.surfaceId;
  host.dataset.gpuFlowRetainedRowId = source.rowId;
  host.style.height = `${source.sourceHeight}px`;
  host.style.overflow = "hidden";
  host.style.width = `${source.sourceWidth}px`;
}

function translateGpuRetainedTextLikePreviewRect(
  rect: GpuRect,
  surfaceRect: GpuRect,
): GpuRect {
  return {
    height: rect.height,
    width: rect.width,
    x: surfaceRect.x + rect.x,
    y: surfaceRect.y + rect.y,
  };
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
