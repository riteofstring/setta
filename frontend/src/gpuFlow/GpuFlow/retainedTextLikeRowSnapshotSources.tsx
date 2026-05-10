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
  isChromeReproVerboseGpuFlowActive,
  nowChromeReproPerformanceMs,
  postMeasuredChromeReproEvent,
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
import type { GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";

export type GpuRetainedTextLikeRowSnapshotSource = {
  readonly code: string;
  readonly commitPolicy: "native-island";
  readonly defaultValue: string;
  readonly disabled: boolean;
  readonly editorKind: "code" | "text" | "textarea";
  readonly error: boolean;
  readonly language: string | null;
  readonly linePolicy: "multiline-auto" | "multiline-fixed" | "single-line";
  readonly maxVisibleLines: number;
  readonly minVisibleLines: number;
  readonly rendererFamily: string;
  readonly rowId: string;
  readonly sectionId: string;
  readonly sourceHeight: number;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourceWidth: number;
  readonly surfaceId: string;
  readonly targetRectCss: GpuRect;
  readonly wrapLines: boolean;
};

export type GpuRetainedTextLikeRowSnapshotRenderer = (
  source: GpuRetainedTextLikeRowSnapshotSource,
) => ReactNode;

const GPU_RETAINED_TEXT_LIKE_ROW_SNAPSHOT_SOURCE_CLASS_NAME =
  "setta-gpu-flow__retained-text-like-row-snapshot-source";

export function useGpuFlowRetainedTextLikeRowSnapshotSources({
  elementBySourceIdRef,
  renderSnapshot,
  scene,
  surfaceRef,
}: {
  readonly elementBySourceIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly renderSnapshot: GpuRetainedTextLikeRowSnapshotRenderer | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): {
  readonly retainedTextLikeRowSnapshotSourceElement: ReactNode;
} {
  const sources = useMemo(
    () =>
      renderSnapshot
        ? getGpuRetainedTextLikeRowSnapshotSources(scene)
        : EMPTY_TEXT_LIKE_ROW_SNAPSHOT_SOURCES,
    [renderSnapshot, scene],
  );
  const paintSourceSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!renderSnapshot || sources.length === 0) {
      paintSourceSignatureRef.current = null;
      return;
    }
    const signature =
      createGpuRetainedTextLikeRowSnapshotPaintSignature(sources);
    if (signature === paintSourceSignatureRef.current) {
      return;
    }
    paintSourceSignatureRef.current = signature;
    surfaceRef.current?.requestPaint();
    surfaceRef.current?.requestFrame("manual");
  }, [renderSnapshot, sources, surfaceRef]);
  const chromeReproSourceSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isChromeReproActive()) {
      return;
    }
    const buildStartedAtMs = nowChromeReproPerformanceMs();
    const verbose = isChromeReproVerboseGpuFlowActive();
    const state = sources.map((source) =>
      summarizeGpuRetainedTextLikeRowSnapshotSource(source, { verbose }),
    );
    const signature = JSON.stringify(state);
    if (signature === chromeReproSourceSignatureRef.current) {
      return;
    }
    chromeReproSourceSignatureRef.current = signature;
    postMeasuredChromeReproEvent(
      "gpu-flow-retained-text-like-row-snapshot-sources",
      {
        sourceCount: sources.length,
        sources: state,
      },
      {
        buildDurationMs: nowChromeReproPerformanceMs() - buildStartedAtMs,
      },
    );
  }, [sources]);
  const handleSnapshotElementChange = useCallback(
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
    retainedTextLikeRowSnapshotSourceElement:
      renderSnapshot && sources.length > 0 ? (
        <GpuRetainedTextLikeRowSnapshotSourceLayer
          onSnapshotElementChange={handleSnapshotElementChange}
          renderSnapshot={renderSnapshot}
          sources={sources}
        />
      ) : null,
  };
}

const EMPTY_TEXT_LIKE_ROW_SNAPSHOT_SOURCES: readonly GpuRetainedTextLikeRowSnapshotSource[] =
  [];

export function getGpuRetainedTextLikeRowSnapshotSources(
  scene: GpuFlowScene | undefined,
): readonly GpuRetainedTextLikeRowSnapshotSource[] {
  return getGpuRetainedTextLikeRowSnapshotSourcesFromSourceSurfaces(
    getGpuRetainedContentSourceSurfaces(scene?.contentSurfaces),
  );
}

export function getGpuRetainedTextLikeRowSnapshotSourcesFromSourceSurfaces(
  surfaces: readonly GpuRetainedContentSourceSurface[],
): readonly GpuRetainedTextLikeRowSnapshotSource[] {
  return surfaces.flatMap((surface) =>
    getGpuRetainedTextLikeRowSnapshotSourcesForSurface(surface),
  );
}

function getGpuRetainedTextLikeRowSnapshotSourcesForSurface(
  surface: GpuRetainedContentSourceSurface,
): readonly GpuRetainedTextLikeRowSnapshotSource[] {
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
  return rasterScene.rows.flatMap((row) => {
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
    const visibleControlRect = intersectGpuRetainedTextLikeRowSnapshotRects(
      controlRect,
      textureBounds,
    );
    if (visibleControlRect.width <= 0 || visibleControlRect.height <= 0) {
      return [];
    }
    const source = {
      code: row.control.displayValue,
      commitPolicy: row.control.commitPolicy,
      defaultValue: row.control.defaultDisplayValue,
      disabled: row.state.disabled,
      editorKind: row.control.editorKind,
      error: row.state.error,
      language: row.control.policy.language,
      linePolicy: row.control.policy.linePolicy,
      maxVisibleLines: row.control.policy.maxVisibleLines,
      minVisibleLines: row.control.policy.minVisibleLines,
      rendererFamily: row.control.rendererFamily,
      rowId: row.id,
      sectionId: surface.ownerSectionId,
      sourceHeight: controlRect.height,
      sourceId: getGpuRetainedTextLikeRowSnapshotSourceId({
        rowId: row.id,
        surfaceId: surface.id,
      }),
      sourceWidth: controlRect.width,
      surfaceId: surface.id,
      targetRectCss: controlRect,
      wrapLines: row.control.policy.wrapLines,
    };
    return [
      {
        ...source,
        sourceKey: createGpuRetainedTextLikeRowSnapshotSourceKey(source),
      },
    ];
  });
}

function summarizeGpuRetainedTextLikeRowSnapshotSource(
  source: GpuRetainedTextLikeRowSnapshotSource,
  { verbose }: { readonly verbose: boolean },
): {
  readonly code?: string | undefined;
  readonly codeLength: number;
  readonly commitPolicy: string;
  readonly defaultValue?: string | undefined;
  readonly defaultValueLength: number;
  readonly disabled: boolean;
  readonly editorKind: string;
  readonly error: boolean;
  readonly linePolicy: string;
  readonly maxVisibleLines: number;
  readonly minVisibleLines: number;
  readonly rendererFamily: string;
  readonly rowId: string;
  readonly sectionId: string;
  readonly sourceHeight: number;
  readonly sourceId: string;
  readonly sourceKeyLength: number;
  readonly sourceWidth: number;
  readonly surfaceId: string;
  readonly targetRectCss: GpuRect;
  readonly wrapLines: boolean;
} {
  return {
    ...(verbose ? { code: source.code } : {}),
    codeLength: source.code.length,
    commitPolicy: source.commitPolicy,
    ...(verbose ? { defaultValue: source.defaultValue } : {}),
    defaultValueLength: source.defaultValue.length,
    disabled: source.disabled,
    editorKind: source.editorKind,
    error: source.error,
    linePolicy: source.linePolicy,
    maxVisibleLines: source.maxVisibleLines,
    minVisibleLines: source.minVisibleLines,
    rendererFamily: source.rendererFamily,
    rowId: source.rowId,
    sectionId: source.sectionId,
    sourceHeight: roundChromeReproMs(source.sourceHeight),
    sourceId: source.sourceId,
    sourceKeyLength: source.sourceKey.length,
    sourceWidth: roundChromeReproMs(source.sourceWidth),
    surfaceId: source.surfaceId,
    targetRectCss: roundGpuRetainedTextLikeRowSnapshotRect(
      source.targetRectCss,
    ),
    wrapLines: source.wrapLines,
  };
}

function roundGpuRetainedTextLikeRowSnapshotRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}

function createGpuRetainedTextLikeRowSnapshotPaintSignature(
  sources: readonly GpuRetainedTextLikeRowSnapshotSource[],
): string {
  return JSON.stringify(
    sources.map((source) => ({
      sourceId: source.sourceId,
      sourceKey: source.sourceKey,
    })),
  );
}

function GpuRetainedTextLikeRowSnapshotSourceLayer({
  onSnapshotElementChange,
  renderSnapshot,
  sources,
}: {
  readonly onSnapshotElementChange:
    | ((sourceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly renderSnapshot: GpuRetainedTextLikeRowSnapshotRenderer;
  readonly sources: readonly GpuRetainedTextLikeRowSnapshotSource[];
}) {
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={
        configureGpuRetainedTextLikeRowSnapshotSourceElement
      }
      getSourceId={getGpuRetainedTextLikeRowSnapshotSourceIdFromSource}
      onSourceElementChange={onSnapshotElementChange}
      renderSource={renderSnapshot}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_TEXT_LIKE_ROW_SNAPSHOT_SOURCE_CLASS_NAME}`}
      sources={sources}
    />
  );
}

function getGpuRetainedTextLikeRowSnapshotSourceIdFromSource(
  source: GpuRetainedTextLikeRowSnapshotSource,
): string {
  return source.sourceId;
}

function getGpuRetainedTextLikeRowSnapshotSourceId({
  rowId,
  surfaceId,
}: {
  readonly rowId: string;
  readonly surfaceId: string;
}): string {
  return `retained-text-like-row-snapshot:${surfaceId}:${rowId}`;
}

function configureGpuRetainedTextLikeRowSnapshotSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedTextLikeRowSnapshotSource>) {
  host.dataset.gpuFlowRetainedTextLikeRowSnapshotSource = "true";
  host.dataset.gpuFlowRetainedTextLikeRowSnapshotSourceKey = source.sourceKey;
  host.dataset.gpuFlowRetainedSurfaceId = source.surfaceId;
  host.dataset.gpuFlowRetainedRowId = source.rowId;
  host.style.height = `${source.sourceHeight}px`;
  host.style.overflow = "hidden";
  host.style.width = `${source.sourceWidth}px`;
}

function createGpuRetainedTextLikeRowSnapshotSourceKey(
  source: Omit<GpuRetainedTextLikeRowSnapshotSource, "sourceKey">,
): string {
  return JSON.stringify({
    code: source.code,
    defaultValue: source.defaultValue,
    disabled: source.disabled,
    error: source.error,
    language: source.language,
    linePolicy: source.linePolicy,
    rowId: source.rowId,
    sourceHeight: source.sourceHeight,
    sourceWidth: source.sourceWidth,
    surfaceId: source.surfaceId,
    wrapLines: source.wrapLines,
  });
}

function intersectGpuRetainedTextLikeRowSnapshotRects(
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
