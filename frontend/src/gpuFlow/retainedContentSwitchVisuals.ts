import {
  getGpuRetainedContentSourceSurfaces,
  type GpuRetainedContentSourceSurface,
} from "./GpuRetainedContentSurfaces";
import type {
  HtmlSurfaceColor,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import { parseGpuRetainedContentNativeVisualColor } from "./retainedContentNativeVisualColor";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDrawCommand,
} from "./retainedContentScene";
import type {
  GpuRetainedContentSwitchAnimationStore,
  GpuRetainedContentSwitchVisualState,
} from "./retainedContentSwitchAnimation";
import {
  getGpuRetainedContentSwitchVisualParts,
  type GpuRetainedContentSwitchVisualParts,
} from "./retainedContentSwitchCanvas";
import type { GpuFlowScene } from "./scene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentSwitchCommand = Extract<
  GpuRetainedContentDrawCommand,
  { kind: "row-control" }
> & {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "switch" }
  >;
};

export function getGpuRetainedContentSwitchAnimationVisuals({
  darkMode,
  nowMs,
  scene,
  switchAnimations,
}: {
  readonly darkMode: boolean;
  readonly nowMs: number;
  readonly scene: GpuFlowScene | undefined;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  if (!scene) {
    return [];
  }
  const palette = getGpuRetainedContentCanvasPalette(darkMode);
  const visuals: HtmlSurfaceSolidRoundedRectVisual[] = [];
  for (const surface of getGpuRetainedContentSourceSurfaces(
    scene.contentSurfaces,
  )) {
    if (!switchAnimations.hasActiveSurface(surface.id, nowMs)) {
      continue;
    }
    visuals.push(
      ...getGpuRetainedContentSurfaceSwitchAnimationVisuals({
        nowMs,
        palette,
        surface,
        switchAnimations,
      }),
    );
  }
  return visuals;
}

function getGpuRetainedContentSurfaceSwitchAnimationVisuals({
  nowMs,
  palette,
  surface,
  switchAnimations,
}: {
  readonly nowMs: number;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  const stateByRowId = new Map(
    surface.retainedScene.rows.map((row) => [row.id, row.state]),
  );
  const visuals: HtmlSurfaceSolidRoundedRectVisual[] = [];
  for (const command of surface.retainedScene.drawCommands) {
    if (!isGpuRetainedContentSwitchCommand(command)) {
      continue;
    }
    const wasActive = switchAnimations.hasActiveSwitch({
      nowMs,
      rowId: command.rowId,
      surfaceId: surface.id,
    });
    const visualState = switchAnimations.resolveVisualState({
      checked: command.control.checked,
      nowMs,
      rowId: command.rowId,
      surfaceId: surface.id,
    });
    if (
      !isGpuRetainedContentSwitchAnimationVisualActive({
        checked: command.control.checked,
        wasActive,
        visualState,
      })
    ) {
      continue;
    }
    const parts = getGpuRetainedContentSwitchVisualParts({
      animationProgress: visualState.progress,
      animationTargetChecked: visualState.targetChecked,
      control: command.control,
      palette,
      rect: command.rect,
      state: stateByRowId.get(command.rowId),
    });
    visuals.push(
      ...createGpuRetainedContentSwitchCommandVisuals({
        parts,
        rowId: command.rowId,
        surface,
      }),
    );
  }
  return visuals;
}

function createGpuRetainedContentSwitchCommandVisuals({
  parts,
  rowId,
  surface,
}: {
  readonly parts: GpuRetainedContentSwitchVisualParts;
  readonly rowId: string;
  readonly surface: GpuRetainedContentSourceSurface;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] {
  return [
    createGpuRetainedContentSwitchVisual({
      color: parseGpuRetainedContentNativeVisualColor(
        parts.trackColor,
        "retained switch track",
      ),
      localRect: parts.trackRect,
      radius: parts.trackRect.height / 2,
      surface,
      visualId: `${surface.id}:switch-animation:${rowId}:track`,
    }),
    createGpuRetainedContentSwitchVisual({
      color: parseGpuRetainedContentNativeVisualColor(
        parts.thumbColor,
        "retained switch thumb",
      ),
      localRect: parts.thumbRect,
      radius: parts.thumbRect.height / 2,
      surface,
      visualId: `${surface.id}:switch-animation:${rowId}:thumb`,
    }),
  ].filter(
    (visual): visual is HtmlSurfaceSolidRoundedRectVisual => visual !== null,
  );
}

function createGpuRetainedContentSwitchVisual({
  color,
  localRect,
  radius,
  surface,
  visualId,
}: {
  readonly color: HtmlSurfaceColor;
  readonly localRect: GpuRect;
  readonly radius: number;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly visualId: string;
}): HtmlSurfaceSolidRoundedRectVisual | null {
  const visibleLocalRect = {
    height: surface.rect.height,
    width: surface.rect.width,
    x: surface.sourceClipOffset.x,
    y: surface.sourceClipOffset.y,
  };
  const clippedLocalRect = intersectGpuRetainedContentRects(
    localRect,
    visibleLocalRect,
  );
  if (clippedLocalRect.width <= 0 || clippedLocalRect.height <= 0) {
    return null;
  }
  return {
    color,
    kind: "solid-rounded-rect",
    radius: Math.min(
      radius,
      clippedLocalRect.width / 2,
      clippedLocalRect.height / 2,
    ),
    rect: {
      height: clippedLocalRect.height,
      width: clippedLocalRect.width,
      x: surface.rect.x - surface.sourceClipOffset.x + clippedLocalRect.x,
      y: surface.rect.y - surface.sourceClipOffset.y + clippedLocalRect.y,
    },
    surfaceId: visualId,
    zIndex: surface.zIndex,
  };
}

function isGpuRetainedContentSwitchAnimationVisualActive({
  checked,
  wasActive,
  visualState,
}: {
  readonly checked: boolean;
  readonly wasActive: boolean;
  readonly visualState: GpuRetainedContentSwitchVisualState;
}): boolean {
  const staticProgress = checked ? 1 : 0;
  return (
    wasActive ||
    visualState.targetChecked !== checked ||
    Math.abs(visualState.progress - staticProgress) > 0.001
  );
}

function isGpuRetainedContentSwitchCommand(
  command: GpuRetainedContentDrawCommand,
): command is GpuRetainedContentSwitchCommand {
  return command.kind === "row-control" && command.control.kind === "switch";
}

function intersectGpuRetainedContentRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return { height, width, x, y };
}
