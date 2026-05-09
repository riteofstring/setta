import type {
  GpuRetainedContentDrawCommand,
  GpuRetainedContentRow,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowState,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import {
  getGpuRetainedContentSceneSourceInput,
  setGpuRetainedContentSceneSourceInput,
  type GpuRetainedContentSceneSourceInput,
} from "./retainedContentSceneSourceMetadata";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

export type GpuRetainedContentRowHoverTarget = {
  readonly rowId: string;
  readonly surfaceId: string;
};

type GpuRetainedContentSurfaceWithScene = GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
};

export type GpuRetainedContentRowHoverSceneUpdate = {
  readonly changedRowIdsBySurfaceId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly scene: GpuFlowScene;
  readonly surfaces: readonly GpuRetainedContentSurfaceWithScene[];
};

export function applyGpuRetainedContentRowHoverStateToScene({
  scene,
  surfaceIds,
  target,
}: {
  readonly scene: GpuFlowScene;
  readonly surfaceIds?: ReadonlySet<string> | undefined;
  readonly target: GpuRetainedContentRowHoverTarget | null;
}): GpuRetainedContentRowHoverSceneUpdate | null {
  let nextSurfaces: GpuContentSurface[] | null = null;
  const changedSurfaces: GpuRetainedContentSurfaceWithScene[] = [];
  const changedRowIdsBySurfaceId = new Map<string, Set<string>>();

  scene.contentSurfaces.forEach((surface, index) => {
    if (surfaceIds && !surfaceIds.has(surface.id)) {
      return;
    }
    if (!isGpuRetainedContentSurfaceWithScene(surface)) {
      return;
    }
    const update = applyGpuRetainedContentRowHoverStateToSurface({
      surface,
      targetRowId: target?.surfaceId === surface.id ? target.rowId : null,
    });
    if (!update) {
      return;
    }
    nextSurfaces ??= [...scene.contentSurfaces];
    nextSurfaces[index] = update.surface;
    changedSurfaces.push(update.surface);
    changedRowIdsBySurfaceId.set(surface.id, update.changedRowIds);
  });

  if (!nextSurfaces) {
    return null;
  }
  return {
    changedRowIdsBySurfaceId,
    scene: {
      ...scene,
      contentSurfaces: nextSurfaces,
    },
    surfaces: changedSurfaces,
  };
}

export function areGpuRetainedContentRowHoverTargetsEqual(
  left: GpuRetainedContentRowHoverTarget | null,
  right: GpuRetainedContentRowHoverTarget | null,
): boolean {
  return left?.rowId === right?.rowId && left?.surfaceId === right?.surfaceId;
}

function applyGpuRetainedContentRowHoverStateToSurface({
  surface,
  targetRowId,
}: {
  readonly surface: GpuRetainedContentSurfaceWithScene;
  readonly targetRowId: string | null;
}): {
  readonly changedRowIds: Set<string>;
  readonly surface: GpuRetainedContentSurfaceWithScene;
} | null {
  const sourceInput = getGpuRetainedContentSceneSourceInput(
    surface.retainedScene,
  );
  if (!sourceInput) {
    return null;
  }
  const sourceUpdate = applyGpuRetainedContentRowHoverStateToSourceInput({
    sourceInput,
    targetRowId,
  });
  if (!sourceUpdate) {
    return null;
  }
  const nextScene = applyGpuRetainedContentRowHoverStateToRetainedScene({
    changedRowIds: sourceUpdate.changedRowIds,
    retainedScene: surface.retainedScene,
    targetRowId,
  });
  setGpuRetainedContentSceneSourceInput(nextScene, sourceUpdate.sourceInput);
  return {
    changedRowIds: sourceUpdate.changedRowIds,
    surface: {
      ...surface,
      retainedScene: nextScene,
    },
  };
}

function applyGpuRetainedContentRowHoverStateToSourceInput({
  sourceInput,
  targetRowId,
}: {
  readonly sourceInput: GpuRetainedContentSceneSourceInput;
  readonly targetRowId: string | null;
}): {
  readonly changedRowIds: Set<string>;
  readonly sourceInput: GpuRetainedContentSceneSourceInput;
} | null {
  const changedRowIds = new Set<string>();
  const nextRows = sourceInput.rows.map((row) => {
    const hovered = targetRowId === row.id;
    if (Boolean(row.state?.hovered) === hovered) {
      return row;
    }
    changedRowIds.add(row.id);
    return applyGpuRetainedContentRowInputHoverState(row, hovered);
  });
  if (changedRowIds.size === 0) {
    return null;
  }
  const nextRowById = new Map(nextRows.map((row) => [row.id, row]));
  const nextRowMetrics = sourceInput.layout.rowMetrics.map((metric) => {
    if (!changedRowIds.has(metric.input.id)) {
      return metric;
    }
    const input = nextRowById.get(metric.input.id);
    if (!input) {
      throw new Error(`Missing retained row input ${metric.input.id}.`);
    }
    return {
      ...metric,
      input,
    };
  });
  return {
    changedRowIds,
    sourceInput: {
      ...sourceInput,
      layout: {
        ...sourceInput.layout,
        rowMetrics: nextRowMetrics,
      },
      rows: nextRows,
    },
  };
}

function applyGpuRetainedContentRowHoverStateToRetainedScene({
  changedRowIds,
  retainedScene,
  targetRowId,
}: {
  readonly changedRowIds: ReadonlySet<string>;
  readonly retainedScene: GpuRetainedContentScene;
  readonly targetRowId: string | null;
}): GpuRetainedContentScene {
  return {
    ...retainedScene,
    drawCommands: retainedScene.drawCommands.map((command) =>
      applyGpuRetainedContentRowHoverStateToDrawCommand({
        changedRowIds,
        command,
        targetRowId,
      }),
    ),
    rows: retainedScene.rows.map((row) =>
      applyGpuRetainedContentRowHoverStateToRow({
        changedRowIds,
        row,
        targetRowId,
      }),
    ),
  };
}

function applyGpuRetainedContentRowHoverStateToRow({
  changedRowIds,
  row,
  targetRowId,
}: {
  readonly changedRowIds: ReadonlySet<string>;
  readonly row: GpuRetainedContentRow;
  readonly targetRowId: string | null;
}): GpuRetainedContentRow {
  if (!changedRowIds.has(row.id)) {
    return row;
  }
  return {
    ...row,
    state: {
      ...row.state,
      hovered: targetRowId === row.id,
    },
  };
}

function applyGpuRetainedContentRowHoverStateToDrawCommand({
  changedRowIds,
  command,
  targetRowId,
}: {
  readonly changedRowIds: ReadonlySet<string>;
  readonly command: GpuRetainedContentDrawCommand;
  readonly targetRowId: string | null;
}): GpuRetainedContentDrawCommand {
  if (command.kind !== "row-background" || !changedRowIds.has(command.rowId)) {
    return command;
  }
  return {
    ...command,
    state: {
      ...command.state,
      hovered: targetRowId === command.rowId,
    },
  };
}

function applyGpuRetainedContentRowInputHoverState(
  row: GpuRetainedContentRowInput,
  hovered: boolean,
): GpuRetainedContentRowInput {
  return {
    ...row,
    state: applyGpuRetainedContentPartialRowStateHover(row.state, hovered),
  };
}

function applyGpuRetainedContentPartialRowStateHover(
  state: Partial<GpuRetainedContentRowState> | undefined,
  hovered: boolean,
): Partial<GpuRetainedContentRowState> {
  return {
    ...state,
    hovered,
  };
}

function isGpuRetainedContentSurfaceWithScene(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurfaceWithScene {
  return (
    surface.renderer.kind === "canvas-content" && Boolean(surface.retainedScene)
  );
}
