import {
  resolveGpuRetainedContentRowReveal,
  type GpuRetainedContentKeyboardNavigationResult,
} from "gpuFlow/retainedContentKeyboard";
import type { GpuRetainedContentScrollOffsetMap } from "gpuFlow/retainedContentScroll";
import type { GpuContentSurface, GpuFlowScene } from "gpuFlow/scene";
import { setCenter } from "gpuFlow/viewportActions";
import type { GpuPoint } from "gpuFlow/viewportMath";
import _ from "lodash";
import { useEffect, useRef } from "react";
import { useLocalStorage, useProjectSearch } from "state/definitions";
import type { ProjectGpuLayoutAdapter } from "./projectGpuLayoutAdapter";

type ProjectGpuSearchTarget = {
  readonly paramInfoId: string;
  readonly sectionId: string;
};

type ProjectGpuRetainedParamSearchRevealSurface = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export type ProjectGpuRetainedParamSearchRevealResult = {
  readonly changed: boolean;
  readonly rowCenter: GpuPoint;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surfaceId: string;
  readonly target: NonNullable<
    GpuRetainedContentKeyboardNavigationResult["target"]
  >;
};

export function useProjectGpuSearchReveal({
  layoutAdapter,
  readyToRender,
  settings,
}: {
  readonly layoutAdapter: ProjectGpuLayoutAdapter;
  readonly readyToRender: boolean;
  readonly settings: { readonly defaultZoomLevel: number };
}) {
  const focusedSearchTarget = useProjectSearch(
    (state) => state.focused,
    _.isEqual,
  );
  const lastCenteredSearchRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusedSearchTarget) {
      lastCenteredSearchRowRef.current = null;
      return;
    }
    if (!readyToRender) {
      return;
    }
    const reveal = resolveProjectGpuRetainedParamSearchReveal({
      scene: layoutAdapter.scene,
      scrollOffsets: layoutAdapter.getContentScrollOffsets(),
      target: focusedSearchTarget,
    });
    if (!reveal) {
      return;
    }
    const sectionReveal = layoutAdapter.revealSceneSection(
      focusedSearchTarget.sectionId,
      {
        align: "nearest",
        marginPx: 12,
      },
    );
    if (reveal.changed) {
      layoutAdapter.setContentScrollOffsets(reveal.scrollOffsets);
    }
    const centerKey = getProjectGpuSearchRevealCenterKey({
      rowCenter: reveal.rowCenter,
      sectionScrollChanged: sectionReveal.changed,
      target: focusedSearchTarget,
    });
    if (lastCenteredSearchRowRef.current === centerKey) {
      return;
    }
    lastCenteredSearchRowRef.current = centerKey;
    setCenter(reveal.rowCenter.x, reveal.rowCenter.y, {
      overviewWidth: useLocalStorage.getState().overviewTrueWidth,
      zoom: settings.defaultZoomLevel,
    });
  }, [
    focusedSearchTarget,
    layoutAdapter,
    readyToRender,
    settings.defaultZoomLevel,
  ]);
}

export function resolveProjectGpuRetainedParamSearchReveal({
  marginPx,
  scene,
  scrollOffsets,
  target,
}: {
  readonly marginPx?: number | undefined;
  readonly scene: GpuFlowScene;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly target: ProjectGpuSearchTarget;
}): ProjectGpuRetainedParamSearchRevealResult | null {
  const surface = getProjectGpuRetainedParamSearchRevealSurface({
    scene,
    target,
  });
  if (!surface) {
    return null;
  }
  const revealResult = resolveGpuRetainedContentRowReveal({
    ...(marginPx === undefined ? {} : { marginPx }),
    rowId: target.paramInfoId,
    scene,
    scrollOffsets,
    surfaceId: surface.id,
  });
  if (!revealResult.target) {
    return null;
  }
  return {
    changed: revealResult.changed,
    rowCenter: resolveProjectGpuRetainedParamSearchRowCenter({
      rowIndex: revealResult.target.rowIndex,
      scrollOffsets: revealResult.scrollOffsets,
      surface,
    }),
    scrollOffsets: revealResult.scrollOffsets,
    surfaceId: surface.id,
    target: revealResult.target,
  };
}

function getProjectGpuSearchRevealCenterKey({
  rowCenter,
  sectionScrollChanged,
  target,
}: {
  readonly rowCenter: { readonly x: number; readonly y: number };
  readonly sectionScrollChanged: boolean;
  readonly target: { readonly paramInfoId: string; readonly sectionId: string };
}): string {
  return [
    target.sectionId,
    target.paramInfoId,
    Math.round(rowCenter.x * 100),
    Math.round(rowCenter.y * 100),
    sectionScrollChanged ? "section-scroll" : "section-visible",
  ].join(":");
}

function getProjectGpuRetainedParamSearchRevealSurface({
  scene,
  target,
}: {
  readonly scene: GpuFlowScene;
  readonly target: ProjectGpuSearchTarget;
}): ProjectGpuRetainedParamSearchRevealSurface | null {
  for (const surface of scene.contentSurfaces) {
    if (
      surface.ownerSectionId !== target.sectionId ||
      surface.renderer.kind !== "canvas-content" ||
      !surface.retainedScene ||
      !surface.retainedScene.rowOrder.includes(target.paramInfoId)
    ) {
      continue;
    }
    return surface as ProjectGpuRetainedParamSearchRevealSurface;
  }
  return null;
}

function resolveProjectGpuRetainedParamSearchRowCenter({
  rowIndex,
  scrollOffsets,
  surface,
}: {
  readonly rowIndex: number;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surface: ProjectGpuRetainedParamSearchRevealSurface;
}): GpuPoint {
  const retainedScene = surface.retainedScene;
  const scrollOffset =
    scrollOffsets.get(surface.id) ?? retainedScene.scrollOffset;
  return {
    x:
      surface.rect.x +
      retainedScene.viewportRect.x +
      retainedScene.viewportRect.width / 2,
    y:
      surface.rect.y +
      retainedScene.viewportRect.y +
      rowIndex * retainedScene.rowHeight +
      retainedScene.rowHeight / 2 -
      scrollOffset.y,
  };
}
