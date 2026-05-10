import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "../htmlSurfaces/sourceLayer";
import { createGpuRetainedContentRowControlRect } from "../retainedContentRowLayout";
import { createGpuRetainedRowContentSceneWithScrollWindow } from "../retainedContentScene";
import { getGpuRetainedContentSceneSourceInput } from "../retainedContentSceneSourceMetadata";
import type { RetainedTextLikePreviewPageFrameSurface } from "../retainedTextLikePreviewPageManager";
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
  readonly sourceKey: string;
  readonly sourceWidth: number;
  readonly sourceWindowCss: GpuRect;
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
  elementBySourceIdRef,
  renderPreview,
  scene,
  surfaceRef,
}: {
  readonly elementBySourceIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly renderPreview: GpuRetainedTextLikePreviewRenderer | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): {
  readonly retainedTextLikePreviewSourceElement: ReactNode;
} {
  const sources = useMemo(
    () =>
      renderPreview
        ? getGpuRetainedTextLikePreviewSources(scene)
        : EMPTY_TEXT_LIKE_PREVIEW_SOURCES,
    [renderPreview, scene],
  );
  const chromeReproSourceSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isChromeReproActive()) {
      return;
    }
    const state = sources.map(summarizeGpuRetainedTextLikePreviewSource);
    const signature = JSON.stringify(state);
    if (signature === chromeReproSourceSignatureRef.current) {
      return;
    }
    chromeReproSourceSignatureRef.current = signature;
    postChromeReproEvent("gpu-flow-retained-text-like-preview-sources", {
      sources: state,
    });
  }, [sources]);
  const handlePreviewElementChange = useCallback(
    (sourceId: string, element: HTMLElement | null) => {
      if (!element) {
        elementBySourceIdRef.current.delete(sourceId);
        return;
      }
      elementBySourceIdRef.current.set(sourceId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [elementBySourceIdRef, surfaceRef],
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
  };
}

const EMPTY_TEXT_LIKE_PREVIEW_SOURCES: readonly GpuRetainedTextLikePreviewSource[] =
  [];

export function getGpuRetainedTextLikePreviewSources(
  scene: GpuFlowScene | undefined,
): readonly GpuRetainedTextLikePreviewSource[] {
  return getGpuRetainedTextLikePreviewSourcesFromSourceSurfaces(
    getGpuRetainedContentSourceSurfaces(scene?.contentSurfaces),
  );
}

export function getGpuRetainedTextLikePreviewSourcesFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
): readonly GpuRetainedTextLikePreviewSource[] {
  return surfaces.flatMap((surface) =>
    getGpuRetainedTextLikePreviewSourcesForSurface(surface),
  );
}

export function getGpuRetainedTextLikePreviewPageFrameSurfacesFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
): readonly RetainedTextLikePreviewPageFrameSurface[] {
  return getGpuRetainedTextLikePreviewSourcesFromSourceSurfaces(surfaces).map(
    toGpuRetainedTextLikePreviewPageFrameSurface,
  );
}

function getGpuRetainedTextLikePreviewSourcesForSurface(
  surface: GpuRetainedContentSourceSurface,
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
  const source = {
    height: surface.rect.height,
    previews,
    sectionId: surface.ownerSectionId,
    sourceHeight: surface.textureWindow.textureHeight,
    sourceId: getGpuRetainedTextLikePreviewSourceId(surface.id),
    sourceWidth: surface.textureWindow.textureWidth,
    sourceWindowCss: {
      height: surface.textureWindow.cacheViewportRect.height,
      width: surface.textureWindow.cacheViewportRect.width,
      x: surface.textureWindow.cacheScrollOffset.x,
      y: surface.textureWindow.cacheScrollOffset.y,
    },
    surfaceId: surface.id,
    textureSourceRect: surface.textureWindow.sourceRect,
    width: surface.rect.width,
    x: surface.rect.x,
    y: surface.rect.y,
    zIndex: surface.zIndex + 1,
  };
  return [
    {
      ...source,
      sourceKey: createGpuRetainedTextLikePreviewSourceKey(source),
    },
  ];
}

function summarizeGpuRetainedTextLikePreviewSource(
  source: GpuRetainedTextLikePreviewSource,
): {
  readonly previewCount: number;
  readonly previews: readonly {
    readonly code: string;
    readonly defaultValue: string;
    readonly disabled: boolean;
    readonly error: boolean;
    readonly linePolicy: string;
    readonly rect: GpuRect;
    readonly rowId: string;
    readonly wrapLines: boolean;
  }[];
  readonly sectionId: string;
  readonly sourceHeight: number;
  readonly sourceId: string;
  readonly sourceKeyLength: number;
  readonly sourceWidth: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly textureSourceRect: GpuRect;
  readonly zIndex: number;
} {
  return {
    previewCount: source.previews.length,
    previews: source.previews.slice(0, 40).map((preview) => ({
      code: preview.code,
      defaultValue: preview.defaultValue,
      disabled: preview.disabled,
      error: preview.error,
      linePolicy: preview.linePolicy,
      rect: roundGpuRetainedTextLikePreviewRect({
        height: preview.height,
        width: preview.width,
        x: preview.x,
        y: preview.y,
      }),
      rowId: preview.rowId,
      wrapLines: preview.wrapLines,
    })),
    sectionId: source.sectionId,
    sourceHeight: roundChromeReproMs(source.sourceHeight),
    sourceId: source.sourceId,
    sourceKeyLength: source.sourceKey.length,
    sourceWidth: roundChromeReproMs(source.sourceWidth),
    sourceWindowCss: roundGpuRetainedTextLikePreviewRect(
      source.sourceWindowCss,
    ),
    surfaceId: source.surfaceId,
    textureSourceRect: roundGpuRetainedTextLikePreviewRect(
      source.textureSourceRect,
    ),
    zIndex: source.zIndex,
  };
}

function roundGpuRetainedTextLikePreviewRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}

function toGpuRetainedTextLikePreviewPageFrameSurface(
  source: GpuRetainedTextLikePreviewSource,
): RetainedTextLikePreviewPageFrameSurface {
  return {
    contentBoundsCss: {
      height: source.sourceHeight,
      width: source.sourceWidth,
      x: 0,
      y: 0,
    },
    layout: {
      height: source.height,
      surfaceId: source.sourceId,
      textureSourceRect: source.textureSourceRect,
      width: source.width,
      x: source.x,
      y: source.y,
      zIndex: source.zIndex,
    },
    sourceId: source.sourceId,
    sourceKey: source.sourceKey,
    sourceWindowCss: source.sourceWindowCss,
    surfaceId: source.surfaceId,
    visibleSourceRectCss: source.textureSourceRect,
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
  host.dataset.gpuFlowRetainedTextLikePreviewSourceKey = source.sourceKey;
  host.dataset.gpuFlowRetainedSurfaceId = source.surfaceId;
  host.style.height = `${source.sourceHeight}px`;
  host.style.overflow = "hidden";
  host.style.width = `${source.sourceWidth}px`;
}

function createGpuRetainedTextLikePreviewSourceKey(
  source: Omit<GpuRetainedTextLikePreviewSource, "sourceKey">,
): string {
  return JSON.stringify({
    previews: source.previews,
    sourceHeight: source.sourceHeight,
    sourceWidth: source.sourceWidth,
    sourceWindowCss: source.sourceWindowCss,
  });
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
