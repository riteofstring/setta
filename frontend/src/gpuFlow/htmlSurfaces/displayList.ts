import type {
  FlowRect,
  HtmlSurfaceEffectVisual,
  HtmlSurfaceFlatVisual,
  HtmlSurfaceMeshVisual,
  HtmlSurfaceSolidRoundedRectVisual,
  HtmlSurfaceTiledFlatVisual,
} from "./visualScene";

export const HTML_SURFACE_RENDER_LAYER_ORDER = {
  "canvas-background": 0,
  edge: 10,
  "section-shell": 20,
  "section-body-background": 25,
  "retained-content": 30,
  "retained-overlay": 40,
  "section-overlay": 50,
  "global-overlay": 60,
} as const;

export type HtmlSurfaceRenderLayer =
  keyof typeof HTML_SURFACE_RENDER_LAYER_ORDER;

export type HtmlSurfaceRenderRole =
  | "canvas-grid"
  | "edge"
  | "section-shell"
  | "section-body-background"
  | "retained-content-page"
  | "retained-scrollbar"
  | "dom-island-proxy"
  | "selection-overlay"
  | "resize-overlay"
  | "drag-overlay"
  | "section-overlay";

export type HtmlSurfaceRenderPipelineKind =
  | "effect"
  | "flat"
  | "mesh"
  | "solid-rounded-rect"
  | "tiled-flat";

export type HtmlSurfaceTextureStorageKind = "none" | "single" | "tiled";

type HtmlSurfaceRenderCommandBase = {
  readonly bounds: FlowRect;
  readonly clipRect?: FlowRect | undefined;
  readonly commandId: string;
  readonly ownerSectionId?: string | undefined;
  readonly ownerSurfaceId: string;
  readonly opacity: number;
  readonly pipelineKind: HtmlSurfaceRenderPipelineKind;
  readonly renderLayer: HtmlSurfaceRenderLayer;
  readonly role: HtmlSurfaceRenderRole;
  readonly sourceOrder: number;
  readonly textureStorageKind: HtmlSurfaceTextureStorageKind;
  readonly zIndex: number;
};

export type HtmlSurfaceFlatRenderCommand = HtmlSurfaceRenderCommandBase & {
  readonly kind: "flat";
  readonly pipelineKind: "flat";
  readonly textureSourceRect?: FlowRect | undefined;
  readonly visual: HtmlSurfaceFlatVisual;
};

export type HtmlSurfaceTiledFlatRenderCommand = HtmlSurfaceRenderCommandBase & {
  readonly kind: "tiled-flat";
  readonly pipelineKind: "tiled-flat";
  readonly textureSourceRect?: FlowRect | undefined;
  readonly visual: HtmlSurfaceTiledFlatVisual;
};

export type HtmlSurfaceMeshRenderCommand = HtmlSurfaceRenderCommandBase & {
  readonly kind: "mesh";
  readonly pipelineKind: "mesh";
  readonly visual: HtmlSurfaceMeshVisual;
};

export type HtmlSurfaceEffectRenderCommand = HtmlSurfaceRenderCommandBase & {
  readonly kind: "effect";
  readonly pipelineKind: "effect";
  readonly visual: HtmlSurfaceEffectVisual;
};

export type HtmlSurfaceSolidRoundedRectRenderCommand =
  HtmlSurfaceRenderCommandBase & {
    readonly kind: "solid-rounded-rect";
    readonly pipelineKind: "solid-rounded-rect";
    readonly visual: HtmlSurfaceSolidRoundedRectVisual;
  };

export type HtmlSurfaceRenderCommand =
  | HtmlSurfaceEffectRenderCommand
  | HtmlSurfaceFlatRenderCommand
  | HtmlSurfaceMeshRenderCommand
  | HtmlSurfaceSolidRoundedRectRenderCommand
  | HtmlSurfaceTiledFlatRenderCommand;

export type HtmlSurfaceRenderBatch = {
  readonly commandCount: number;
  readonly firstCommandIndex: number;
  readonly pipelineKind: HtmlSurfaceRenderPipelineKind;
};

export type HtmlSurfaceRenderDisplayList = {
  readonly batches: readonly HtmlSurfaceRenderBatch[];
  readonly commands: readonly HtmlSurfaceRenderCommand[];
};

export type HtmlSurfaceDisplayListVisualGroup = {
  readonly effectSurfaces?: readonly HtmlSurfaceEffectVisual[] | undefined;
  readonly flatSurfaces?: readonly HtmlSurfaceFlatVisual[] | undefined;
  readonly meshSurfaces?: readonly HtmlSurfaceMeshVisual[] | undefined;
  readonly ownerSectionId?: string | undefined;
  readonly renderLayer: HtmlSurfaceRenderLayer;
  readonly role: HtmlSurfaceRenderRole;
  readonly solidRoundedRectSurfaces?:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly tiledFlatSurfaces?:
    | readonly HtmlSurfaceTiledFlatVisual[]
    | undefined;
};

export type HtmlSurfaceOcclusionRiskDiagnostic = {
  readonly coveringBounds: FlowRect;
  readonly coveringCommandId: string;
  readonly coveringOwnerSurfaceId: string;
  readonly coveringRenderLayer: HtmlSurfaceRenderLayer;
  readonly coveringRole: HtmlSurfaceRenderRole;
  readonly coveringSourceOrder: number;
  readonly coveringZIndex: number;
  readonly retainedBounds: FlowRect;
  readonly retainedCommandId: string;
  readonly retainedOwnerSurfaceId: string;
};

const DEFAULT_OPACITY = 1;

const ALLOWED_RETAINED_COVER_ROLES: ReadonlySet<HtmlSurfaceRenderRole> =
  new Set([
    "dom-island-proxy",
    "drag-overlay",
    "resize-overlay",
    "retained-scrollbar",
    "section-overlay",
    "selection-overlay",
  ]);

export function createHtmlSurfaceDisplayList(
  groups: readonly HtmlSurfaceDisplayListVisualGroup[],
): HtmlSurfaceRenderDisplayList {
  const commands: HtmlSurfaceRenderCommand[] = [];
  let sourceOrder = 0;

  for (const group of groups) {
    sourceOrder = appendDisplayListGroupCommands({
      commands,
      group,
      sourceOrder,
    });
  }

  const sortedCommands = [...commands].sort(compareHtmlSurfaceRenderCommands);
  return {
    batches: createHtmlSurfaceRenderBatches(sortedCommands),
    commands: sortedCommands,
  };
}

export function createHtmlSurfaceRetainedOcclusionDiagnostics(
  displayList: HtmlSurfaceRenderDisplayList,
): readonly HtmlSurfaceOcclusionRiskDiagnostic[] {
  const diagnostics: HtmlSurfaceOcclusionRiskDiagnostic[] = [];
  const commands = displayList.commands;
  for (let index = 0; index < commands.length; index += 1) {
    const retainedCommand = commands[index];
    if (retainedCommand?.role !== "retained-content-page") {
      continue;
    }
    for (
      let coverIndex = index + 1;
      coverIndex < commands.length;
      coverIndex += 1
    ) {
      const coveringCommand = commands[coverIndex];
      if (
        !coveringCommand ||
        ALLOWED_RETAINED_COVER_ROLES.has(coveringCommand.role) ||
        !rectsIntersect(retainedCommand.bounds, coveringCommand.bounds)
      ) {
        continue;
      }
      diagnostics.push({
        coveringBounds: coveringCommand.bounds,
        coveringCommandId: coveringCommand.commandId,
        coveringOwnerSurfaceId: coveringCommand.ownerSurfaceId,
        coveringRenderLayer: coveringCommand.renderLayer,
        coveringRole: coveringCommand.role,
        coveringSourceOrder: coveringCommand.sourceOrder,
        coveringZIndex: coveringCommand.zIndex,
        retainedBounds: retainedCommand.bounds,
        retainedCommandId: retainedCommand.commandId,
        retainedOwnerSurfaceId: retainedCommand.ownerSurfaceId,
      });
    }
  }
  return diagnostics;
}

export function countHtmlSurfaceRenderCommandsByLayer(
  displayList: HtmlSurfaceRenderDisplayList,
): Record<HtmlSurfaceRenderLayer, number> {
  return countCommands(displayList, (command) => command.renderLayer);
}

export function countHtmlSurfaceRenderCommandsByPipeline(
  displayList: HtmlSurfaceRenderDisplayList,
): Record<HtmlSurfaceRenderPipelineKind, number> {
  return countCommands(displayList, (command) => command.pipelineKind);
}

export function countHtmlSurfaceRenderCommandsByRole(
  displayList: HtmlSurfaceRenderDisplayList,
): Record<HtmlSurfaceRenderRole, number> {
  return countCommands(displayList, (command) => command.role);
}

function createFlatCommand({
  group,
  sourceOrder,
  surface,
}: {
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
  readonly surface: HtmlSurfaceFlatVisual;
}): HtmlSurfaceFlatRenderCommand {
  return {
    ...createCommandBase({
      bounds: surface,
      group,
      kind: "flat",
      pipelineKind: "flat",
      sourceOrder,
      storageKind: surface.texture.textureLayout.kind,
      surfaceId: surface.surfaceId,
      zIndex: surface.zIndex,
    }),
    kind: "flat",
    pipelineKind: "flat",
    visual: surface,
  };
}

function createTiledFlatCommand({
  group,
  sourceOrder,
  surface,
}: {
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
  readonly surface: HtmlSurfaceTiledFlatVisual;
}): HtmlSurfaceTiledFlatRenderCommand {
  return {
    ...createCommandBase({
      bounds: surface.rect,
      group,
      kind: "tiled-flat",
      pipelineKind: "tiled-flat",
      sourceOrder,
      storageKind: "tiled",
      surfaceId: surface.surfaceId,
      zIndex: surface.zIndex,
    }),
    kind: "tiled-flat",
    pipelineKind: "tiled-flat",
    ...(surface.textureSourceRect
      ? { textureSourceRect: surface.textureSourceRect }
      : {}),
    visual: surface,
  };
}

function createMeshCommand({
  group,
  sourceOrder,
  surface,
}: {
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
  readonly surface: HtmlSurfaceMeshVisual;
}): HtmlSurfaceMeshRenderCommand {
  return {
    ...createCommandBase({
      bounds: surface.bounds,
      group,
      kind: "mesh",
      pipelineKind: "mesh",
      sourceOrder,
      storageKind: surface.texture.textureLayout.kind,
      surfaceId: surface.surfaceId,
      zIndex: surface.zIndex,
    }),
    kind: "mesh",
    pipelineKind: "mesh",
    visual: surface,
  };
}

function createEffectCommand({
  group,
  sourceOrder,
  surface,
}: {
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
  readonly surface: HtmlSurfaceEffectVisual;
}): HtmlSurfaceEffectRenderCommand {
  return {
    ...createCommandBase({
      bounds: surface.bounds,
      group,
      kind: "effect",
      pipelineKind: "effect",
      sourceOrder,
      storageKind: surface.texture.textureLayout.kind,
      surfaceId: surface.surfaceId,
      zIndex: surface.zIndex,
    }),
    kind: "effect",
    pipelineKind: "effect",
    visual: surface,
  };
}

function createSolidRoundedRectCommand({
  group,
  sourceOrder,
  surface,
}: {
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
  readonly surface: HtmlSurfaceSolidRoundedRectVisual;
}): HtmlSurfaceSolidRoundedRectRenderCommand {
  return {
    ...createCommandBase({
      bounds: surface.rect,
      group,
      kind: "solid-rounded-rect",
      pipelineKind: "solid-rounded-rect",
      sourceOrder,
      storageKind: "none",
      surfaceId: surface.surfaceId,
      zIndex: surface.zIndex,
    }),
    kind: "solid-rounded-rect",
    pipelineKind: "solid-rounded-rect",
    visual: surface,
  };
}

function createCommandBase({
  bounds,
  group,
  kind,
  pipelineKind,
  sourceOrder,
  storageKind,
  surfaceId,
  zIndex,
}: {
  readonly bounds: FlowRect;
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly kind: string;
  readonly pipelineKind: HtmlSurfaceRenderPipelineKind;
  readonly sourceOrder: number;
  readonly storageKind: HtmlSurfaceTextureStorageKind;
  readonly surfaceId: string;
  readonly zIndex: number;
}): HtmlSurfaceRenderCommandBase {
  return {
    bounds: { ...bounds },
    commandId: `${sourceOrder}:${kind}:${surfaceId}`,
    ...(group.ownerSectionId ? { ownerSectionId: group.ownerSectionId } : {}),
    ownerSurfaceId: surfaceId,
    opacity: DEFAULT_OPACITY,
    pipelineKind,
    renderLayer: group.renderLayer,
    role: group.role,
    sourceOrder,
    textureStorageKind: storageKind,
    zIndex,
  };
}

function createHtmlSurfaceRenderBatches(
  commands: readonly HtmlSurfaceRenderCommand[],
): readonly HtmlSurfaceRenderBatch[] {
  const batches: HtmlSurfaceRenderBatch[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    if (!command) {
      continue;
    }
    const previous = batches.at(-1);
    if (previous?.pipelineKind === command.pipelineKind) {
      batches[batches.length - 1] = {
        ...previous,
        commandCount: previous.commandCount + 1,
      };
      continue;
    }
    batches.push({
      commandCount: 1,
      firstCommandIndex: index,
      pipelineKind: command.pipelineKind,
    });
  }
  return batches;
}

function compareHtmlSurfaceRenderCommands(
  left: HtmlSurfaceRenderCommand,
  right: HtmlSurfaceRenderCommand,
): number {
  return (
    HTML_SURFACE_RENDER_LAYER_ORDER[left.renderLayer] -
      HTML_SURFACE_RENDER_LAYER_ORDER[right.renderLayer] ||
    left.zIndex - right.zIndex ||
    left.sourceOrder - right.sourceOrder ||
    left.commandId.localeCompare(right.commandId)
  );
}

function countCommands<Key extends string>(
  displayList: HtmlSurfaceRenderDisplayList,
  getKey: (command: HtmlSurfaceRenderCommand) => Key,
): Record<Key, number> {
  const counts = {} as Record<Key, number>;
  for (const command of displayList.commands) {
    const key = getKey(command);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function appendDisplayListGroupCommands({
  commands,
  group,
  sourceOrder,
}: {
  readonly commands: HtmlSurfaceRenderCommand[];
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
}): number {
  let nextSourceOrder = sourceOrder;
  nextSourceOrder = appendSurfaceCommands({
    commands,
    createCommand: createFlatCommand,
    group,
    sourceOrder: nextSourceOrder,
    surfaces: group.flatSurfaces,
  });
  nextSourceOrder = appendSurfaceCommands({
    commands,
    createCommand: createTiledFlatCommand,
    group,
    sourceOrder: nextSourceOrder,
    surfaces: group.tiledFlatSurfaces,
  });
  nextSourceOrder = appendSurfaceCommands({
    commands,
    createCommand: createMeshCommand,
    group,
    sourceOrder: nextSourceOrder,
    surfaces: group.meshSurfaces,
  });
  nextSourceOrder = appendSurfaceCommands({
    commands,
    createCommand: createEffectCommand,
    group,
    sourceOrder: nextSourceOrder,
    surfaces: group.effectSurfaces,
  });
  return appendSurfaceCommands({
    commands,
    createCommand: createSolidRoundedRectCommand,
    group,
    sourceOrder: nextSourceOrder,
    surfaces: group.solidRoundedRectSurfaces,
  });
}

function appendSurfaceCommands<Surface>({
  commands,
  createCommand,
  group,
  sourceOrder,
  surfaces,
}: {
  readonly commands: HtmlSurfaceRenderCommand[];
  readonly createCommand: (input: {
    readonly group: HtmlSurfaceDisplayListVisualGroup;
    readonly sourceOrder: number;
    readonly surface: Surface;
  }) => HtmlSurfaceRenderCommand;
  readonly group: HtmlSurfaceDisplayListVisualGroup;
  readonly sourceOrder: number;
  readonly surfaces: readonly Surface[] | undefined;
}): number {
  let nextSourceOrder = sourceOrder;
  for (const surface of surfaces ?? []) {
    commands.push(
      createCommand({ group, sourceOrder: nextSourceOrder, surface }),
    );
    nextSourceOrder += 1;
  }
  return nextSourceOrder;
}

function rectsIntersect(left: FlowRect, right: FlowRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
