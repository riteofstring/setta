import { roundChromeReproMs } from "state/actions/chromeRepro";

import type { GpuRetainedContentDrawCommand } from "../retainedContentScene";
import type { GpuContentSurface } from "../scene";
import type { GpuRect } from "../viewportMath";

type GpuFlowRetainedContentSurfaceVisualCounts = {
  nativeControlActiveTextLikeRowCount: number;
  scrollbarCount: number;
  switchCount: number;
  textLikeRowCount: number;
};

export function createGpuFlowRetainedContentSurfaceVisualState(
  surface: GpuContentSurface,
): {
  readonly contentRect: GpuRect;
  readonly rect: GpuRect;
  readonly scrollbars: readonly {
    readonly axis: string;
    readonly state: unknown;
    readonly thumbRect: GpuRect;
    readonly trackRect: GpuRect;
  }[];
  readonly scrollOffset: { readonly x: number; readonly y: number };
  readonly surfaceId: string;
  readonly switches: readonly {
    readonly checked: boolean;
    readonly displayValue: string;
    readonly rect: GpuRect;
    readonly rowId: string;
  }[];
  readonly textLikeRows: readonly {
    readonly defaultDisplayValue: string;
    readonly displayValue: string;
    readonly editorKind: string;
    readonly linePolicy: string;
    readonly maxVisibleLines: number;
    readonly minVisibleLines: number;
    readonly nativeControlActive: boolean;
    readonly rect: GpuRect;
    readonly rowId: string;
    readonly rowLabel: string;
    readonly rowRect: GpuRect;
    readonly wrapLines: boolean;
  }[];
  readonly viewportRect: GpuRect;
  readonly zIndex: number;
} | null {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return null;
  }
  const rowById = new Map(retainedScene.rows.map((row) => [row.id, row]));
  const switches = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentSwitchVisualState)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  const textLikeRows = retainedScene.drawCommands
    .map((command) =>
      createGpuFlowRetainedContentTextLikeVisualState({ command, rowById }),
    )
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  const scrollbars = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentScrollbarVisualState)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null,
    );
  if (
    switches.length === 0 &&
    scrollbars.length === 0 &&
    textLikeRows.length === 0
  ) {
    return null;
  }
  return {
    contentRect: roundGpuFlowChromeReproRect(retainedScene.contentRect),
    rect: roundGpuFlowChromeReproRect(surface.rect),
    scrollbars,
    scrollOffset: {
      x: roundChromeReproMs(retainedScene.scrollOffset.x),
      y: roundChromeReproMs(retainedScene.scrollOffset.y),
    },
    surfaceId: surface.id,
    switches,
    textLikeRows,
    viewportRect: roundGpuFlowChromeReproRect(retainedScene.viewportRect),
    zIndex: surface.zIndex,
  };
}

export function createGpuFlowRetainedContentSurfaceVisualSummary(
  surface: GpuContentSurface,
): {
  readonly contentRect: GpuRect;
  readonly nativeControlActiveTextLikeRowCount: number;
  readonly rect: GpuRect;
  readonly scrollbarCount: number;
  readonly scrollOffset: { readonly x: number; readonly y: number };
  readonly surfaceId: string;
  readonly switchCount: number;
  readonly textLikeRowCount: number;
  readonly viewportRect: GpuRect;
  readonly zIndex: number;
} | null {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return null;
  }
  const {
    nativeControlActiveTextLikeRowCount,
    scrollbarCount,
    switchCount,
    textLikeRowCount,
  } = summarizeGpuFlowRetainedContentSurfaceVisualCounts(retainedScene);
  if (switchCount === 0 && scrollbarCount === 0 && textLikeRowCount === 0) {
    return null;
  }
  return {
    contentRect: roundGpuFlowChromeReproRect(retainedScene.contentRect),
    nativeControlActiveTextLikeRowCount,
    rect: roundGpuFlowChromeReproRect(surface.rect),
    scrollbarCount,
    scrollOffset: {
      x: roundChromeReproMs(retainedScene.scrollOffset.x),
      y: roundChromeReproMs(retainedScene.scrollOffset.y),
    },
    surfaceId: surface.id,
    switchCount,
    textLikeRowCount,
    viewportRect: roundGpuFlowChromeReproRect(retainedScene.viewportRect),
    zIndex: surface.zIndex,
  };
}

function summarizeGpuFlowRetainedContentSurfaceVisualCounts(
  retainedScene: NonNullable<GpuContentSurface["retainedScene"]>,
): GpuFlowRetainedContentSurfaceVisualCounts {
  const rowById = new Map(retainedScene.rows.map((row) => [row.id, row]));
  const counts: GpuFlowRetainedContentSurfaceVisualCounts = {
    nativeControlActiveTextLikeRowCount: 0,
    scrollbarCount: 0,
    switchCount: 0,
    textLikeRowCount: 0,
  };
  for (const command of retainedScene.drawCommands) {
    summarizeGpuFlowRetainedContentDrawCommand(counts, command, rowById);
  }
  return counts;
}

function summarizeGpuFlowRetainedContentDrawCommand(
  counts: GpuFlowRetainedContentSurfaceVisualCounts,
  command: GpuRetainedContentDrawCommand,
  rowById: ReadonlyMap<
    string,
    NonNullable<GpuContentSurface["retainedScene"]>["rows"][number]
  >,
) {
  if (command.kind === "scrollbar") {
    counts.scrollbarCount += 1;
    return;
  }
  if (command.kind !== "row-control") {
    return;
  }
  if (command.control.kind === "switch") {
    counts.switchCount += 1;
    return;
  }
  if (command.control.kind !== "text-like") {
    return;
  }
  counts.textLikeRowCount += 1;
  if (rowById.get(command.rowId)?.state.nativeControlActive) {
    counts.nativeControlActiveTextLikeRowCount += 1;
  }
}

function createGpuFlowRetainedContentTextLikeVisualState({
  command,
  rowById,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly rowById: ReadonlyMap<
    string,
    NonNullable<GpuContentSurface["retainedScene"]>["rows"][number]
  >;
}): {
  readonly defaultDisplayValue: string;
  readonly displayValue: string;
  readonly editorKind: string;
  readonly linePolicy: string;
  readonly maxVisibleLines: number;
  readonly minVisibleLines: number;
  readonly nativeControlActive: boolean;
  readonly rect: GpuRect;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly rowRect: GpuRect;
  readonly wrapLines: boolean;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "text-like") {
    return null;
  }
  const row = rowById.get(command.rowId);
  return {
    defaultDisplayValue: command.control.defaultDisplayValue,
    displayValue: command.control.displayValue,
    editorKind: command.control.editorKind,
    linePolicy: command.control.policy.linePolicy,
    maxVisibleLines: command.control.policy.maxVisibleLines,
    minVisibleLines: command.control.policy.minVisibleLines,
    nativeControlActive: row?.state.nativeControlActive ?? false,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
    rowLabel: row?.label ?? "",
    rowRect: row
      ? roundGpuFlowChromeReproRect(row.projectedRect)
      : { height: 0, width: 0, x: 0, y: 0 },
    wrapLines: command.control.policy.wrapLines,
  };
}

function createGpuFlowRetainedContentSwitchVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly checked: boolean;
  readonly displayValue: string;
  readonly rect: GpuRect;
  readonly rowId: string;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "switch") {
    return null;
  }
  return {
    checked: command.control.checked,
    displayValue: command.control.displayValue,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
  };
}

function createGpuFlowRetainedContentScrollbarVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly axis: string;
  readonly state: unknown;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
} | null {
  if (command.kind !== "scrollbar") {
    return null;
  }
  return {
    axis: command.axis,
    state: command.state ?? null,
    thumbRect: roundGpuFlowChromeReproRect(command.thumbRect),
    trackRect: roundGpuFlowChromeReproRect(command.trackRect),
  };
}

function roundGpuFlowChromeReproRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}
