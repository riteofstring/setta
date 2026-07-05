import type {
  ColumnWidthSpec as PersistedColumnWidthSpec,
  PaneTone as PersistedPaneTone,
  SurfaceKind as PersistedSurfaceKind,
  TerminalPaneConfig as PersistedTerminalPaneConfig,
  WorkflowNodeDetailsPaneConfig,
  WorkspaceUIColumn,
  WorkspaceUILayout,
  WorkspaceUIPane,
} from "@generated/backend";

import { productSurfaceKinds } from "./types";
import type {
  ColumnWidthSpec,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  PaneLimitPolicy,
  PaneId,
  ProductSurfaceKind,
  TerminalPaneConfig,
} from "./types";

const realWorkspaceVisibleColumnCount = 3;
const realWorkspaceLayoutSchemaVersion = 3;
const defaultRealColumnWidth: ColumnWidthSpec = { unit: "px", value: 520 };
const realWorkspaceRenderOverscanColumns = 2;
const realWorkspaceSurfaceKinds = productSurfaceKinds;
export const defaultRealWorkspacePaneLimits = {
  "chat-dom": 10,
  "workflow-graph": 10,
  "settings-dom": 1,
  "semantic-node-details": 1,
  terminal: 10,
  "workflow-node-details": 1,
  "workflow-settings": 1,
} satisfies PaneLimitPolicy;

export interface RealWorkspaceSceneOptions {
  storedLayout: WorkspaceUILayout | null;
  workspaceId: string;
  workspaceName: string;
}

export interface RealWorkspaceSceneResult {
  focusedPaneId: PaneId;
  layoutRevision: number;
  layoutRecovery: WorkspaceLayoutRecovery | null;
  scene: WorkspaceScene;
}

interface WorkspaceLayoutRecovery {
  message: string;
  workspaceId: string;
}

interface CreatePaneInput {
  columnId: string;
  sequence: number;
  subtitle: string;
  surfaceKind: ProductSurfaceKind;
  title: string;
  tone: WorkspacePane["tone"];
  weight?: number;
}

export function createRealWorkspaceScene({
  storedLayout,
  workspaceId,
  workspaceName,
}: RealWorkspaceSceneOptions): RealWorkspaceSceneResult {
  if (storedLayout) {
    const scene = sceneFromPanesAndColumns(
      workspaceId,
      storedLayout.panes.map(workspacePaneFromPersisted),
      storedLayout.columns.map(workspaceColumnFromPersisted),
    );
    return {
      focusedPaneId: focusedPaneIdForScene(scene, storedLayout.focusedPaneId),
      layoutRevision: storedLayout.revision,
      layoutRecovery: null,
      scene,
    };
  }
  const scene = createDefaultRealWorkspaceScene(workspaceId, workspaceName);
  return {
    focusedPaneId: focusedPaneIdForScene(scene),
    layoutRevision: 0,
    layoutRecovery: null,
    scene,
  };
}

export function workspaceUILayoutFromScene(
  workspaceId: string,
  scene: WorkspaceScene,
  focusedPaneId: PaneId,
  revision: number,
): WorkspaceUILayout {
  return {
    columns: scene.columns.map((column, index) => ({
      columnId: column.columnId,
      idealWidthSpec: persistedColumnWidthSpec(column.idealWidthSpec),
      index,
      paneIds: [...column.paneIds],
      planeIndex: column.planeIndex,
      previousProportionWidth: isFiniteNumber(column.previousProportionWidth)
        ? column.previousProportionWidth
        : null,
      slotIndex: normalizedStoredSlotIndex(column.slotIndex, index),
      widthSpec: persistedColumnWidthSpec(column.widthSpec),
    })),
    focusedPaneId,
    panes: scene.panes.map(workspacePaneToPersisted),
    revision: persistedLayoutRevision(revision),
    schemaVersion: realWorkspaceLayoutSchemaVersion,
    workspaceId,
  };
}

function createDefaultRealWorkspaceScene(
  workspaceId: string,
  workspaceName: string,
): WorkspaceScene {
  const panes = [
    createPane({
      columnId: "workspace_column_0",
      sequence: 0,
      subtitle: workspaceName,
      surfaceKind: "chat-dom",
      title: "Chat",
      tone: "cyan",
      weight: 1.6,
    }),
    createPane({
      columnId: "workspace_column_1",
      sequence: 1,
      subtitle: "workspace command surface",
      surfaceKind: "terminal",
      title: "Terminal",
      tone: "green",
    }),
    createPane({
      columnId: "workspace_column_2",
      sequence: 2,
      subtitle: "workflow graph",
      surfaceKind: "workflow-graph",
      title: "Workflow Graph",
      tone: "cyan",
    }),
    createPane({
      columnId: "workspace_column_3",
      sequence: 3,
      subtitle: "workspace settings",
      surfaceKind: "settings-dom",
      title: "Settings",
      tone: "slate",
    }),
  ];
  return sceneFromPanesAndColumns(
    workspaceId,
    panes,
    panes.map((pane, index) => ({
      columnId: pane.columnId,
      idealWidthSpec: defaultRealColumnWidth,
      index,
      paneIds: [pane.paneId],
      planeIndex: 0,
      slotIndex: index,
      widthSpec: defaultRealColumnWidth,
    })),
  );
}

function createPane({
  columnId,
  sequence,
  subtitle,
  surfaceKind,
  title,
  tone,
  weight = 1,
}: CreatePaneInput): WorkspacePane {
  return {
    columnId,
    heat: (sequence * 37) % 100,
    paneId: `workspace_pane_${sequence}`,
    sequence,
    subtitle,
    surfaceId: `workspace_surface_${sequence}`,
    surfaceKind,
    title,
    tone,
    weight,
  };
}

function workspaceColumnFromPersisted(column: WorkspaceUIColumn): WorkspaceColumn {
  return {
    columnId: column.columnId,
    idealWidthSpec: workspaceColumnWidthSpec(column.idealWidthSpec),
    index: column.index,
    paneIds: [...column.paneIds],
    planeIndex: column.planeIndex,
    previousProportionWidth: column.previousProportionWidth ?? undefined,
    slotIndex: column.slotIndex,
    widthSpec: workspaceColumnWidthSpec(column.widthSpec),
  };
}

function workspacePaneFromPersisted(pane: WorkspaceUIPane): WorkspacePane {
  return {
    columnId: pane.columnId,
    heat: pane.heat,
    ...(pane.heightPx === null ? {} : { heightPx: pane.heightPx }),
    paneId: pane.paneId,
    sequence: pane.sequence,
    subtitle: pane.subtitle,
    surfaceId: pane.surfaceId,
    surfaceKind: pane.surfaceKind,
    terminalConfig: pane.terminalConfig
      ? terminalConfigFromPersisted(pane.terminalConfig)
      : undefined,
    title: pane.title,
    tone: pane.tone,
    weight: pane.weight,
    workflowNodeDetailsConfig: workflowNodeDetailsConfigFromPersisted(
      pane.workflowNodeDetailsConfig,
    ),
  };
}

function workflowNodeDetailsConfigFromPersisted(
  config: WorkflowNodeDetailsPaneConfig | null,
): WorkflowNodeDetailsPaneConfig | undefined {
  return config ?? undefined;
}

function terminalConfigFromPersisted(config: PersistedTerminalPaneConfig): TerminalPaneConfig {
  const terminalConfig: TerminalPaneConfig = {
    profileId: config.profileId,
  };
  if (config.cwdOverride !== "") {
    terminalConfig.cwdOverride = config.cwdOverride;
  }
  if (config.titleOverride !== "") {
    terminalConfig.titleOverride = config.titleOverride;
  }
  return terminalConfig;
}

function workspacePaneToPersisted(pane: WorkspacePane): WorkspaceUIPane {
  return {
    columnId: pane.columnId,
    heat: pane.heat,
    heightPx: pane.heightPx ?? null,
    paneId: pane.paneId,
    sequence: pane.sequence,
    subtitle: pane.subtitle,
    surfaceId: pane.surfaceId,
    surfaceKind: persistedSurfaceKind(pane.surfaceKind),
    terminalConfig: pane.terminalConfig ? terminalConfigToPersisted(pane.terminalConfig) : null,
    title: pane.title,
    tone: persistedPaneTone(pane.tone),
    weight: pane.weight,
    workflowNodeDetailsConfig: pane.workflowNodeDetailsConfig ?? null,
  };
}

function terminalConfigToPersisted(
  config: WorkspacePane["terminalConfig"],
): PersistedTerminalPaneConfig {
  if (!config) {
    throw new Error("terminal config is required");
  }
  return {
    cwdOverride: config.cwdOverride ?? "",
    profileId: config.profileId,
    titleOverride: config.titleOverride ?? "",
  };
}

function workspaceColumnWidthSpec(spec: PersistedColumnWidthSpec): ColumnWidthSpec {
  return {
    unit: spec.unit,
    value: spec.value,
  };
}

function persistedColumnWidthSpec(spec: ColumnWidthSpec): PersistedColumnWidthSpec {
  return {
    unit: spec.unit,
    value: spec.value,
  };
}

function persistedSurfaceKind(surfaceKind: WorkspacePane["surfaceKind"]): PersistedSurfaceKind {
  if (!isRealWorkspaceSurfaceKind(surfaceKind)) {
    throw new Error(`real workspace layout cannot persist diagnostic surface kind: ${surfaceKind}`);
  }
  return surfaceKind;
}

function persistedPaneTone(tone: WorkspacePane["tone"]): PersistedPaneTone {
  return tone;
}

function sceneFromPanesAndColumns(
  id: string,
  panes: readonly WorkspacePane[],
  columns: readonly WorkspaceColumn[],
): WorkspaceScene {
  const storedPanes = panes.map((pane) => ({ ...pane }));
  const storedPaneById = new Map(storedPanes.map((pane) => [pane.paneId, pane]));
  const ownerColumnByPaneId = new Map<PaneId, string>();
  const usedSurfaceIds = new Set<string>();
  const nextSlotIndexByPlane = new Map<number, number>();
  const normalizedColumns = columns
    .map((column) => {
      const paneIds = column.paneIds.filter((paneId) => storedPaneById.has(paneId));
      for (const paneId of paneIds) {
        ownerColumnByPaneId.set(paneId, column.columnId);
      }
      return {
        ...column,
        paneIds,
      };
    })
    .filter((column) => column.paneIds.length > 0)
    .map((column, index) => {
      const fallbackSlotIndex = nextSlotIndexByPlane.get(column.planeIndex) ?? 0;
      const slotIndex = normalizedStoredSlotIndex(column.slotIndex, fallbackSlotIndex);
      nextSlotIndexByPlane.set(column.planeIndex, Math.max(fallbackSlotIndex, slotIndex) + 1);
      return {
        ...column,
        idealWidthSpec: { ...column.idealWidthSpec },
        index,
        paneIds: [...column.paneIds],
        planeIndex: column.planeIndex,
        slotIndex,
        widthSpec: { ...column.widthSpec },
      };
    });
  const normalizedPanes = storedPanes
    .filter((pane) => ownerColumnByPaneId.has(pane.paneId))
    .map((pane) => ({
      ...pane,
      columnId: ownerColumnByPaneId.get(pane.paneId) ?? pane.columnId,
      surfaceId: uniqueSurfaceId(pane, usedSurfaceIds),
    }));
  return {
    columnGap: 8,
    columns: normalizedColumns,
    defaultColumnWidthSpec: defaultRealColumnWidth,
    id,
    paneById: new Map(normalizedPanes.map((pane) => [pane.paneId, pane])),
    panes: normalizedPanes,
    panesPerColumn: Math.max(1, ...normalizedColumns.map((column) => column.paneIds.length)),
    padding: 10,
    renderOverscanColumns: realWorkspaceRenderOverscanColumns,
    rowGap: 8,
    targetVisiblePanes: normalizedPanes.length,
    totalPanes: normalizedPanes.length,
    visibleColumnCount: Math.min(
      realWorkspaceVisibleColumnCount,
      Math.max(1, normalizedColumns.length),
    ),
  };
}

function focusedPaneIdForScene(scene: WorkspaceScene, preferredPaneId?: PaneId): PaneId {
  if (preferredPaneId && scene.paneById.has(preferredPaneId)) {
    return preferredPaneId;
  }
  return scene.columns[0]?.paneIds[0] ?? scene.panes[0]?.paneId ?? "";
}

function uniqueSurfaceId(pane: WorkspacePane, usedSurfaceIds: Set<string>): string {
  if (!usedSurfaceIds.has(pane.surfaceId)) {
    usedSurfaceIds.add(pane.surfaceId);
    return pane.surfaceId;
  }
  const base = `${pane.surfaceId}_${pane.paneId}`;
  let candidate = base;
  let suffix = 1;
  while (usedSurfaceIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedSurfaceIds.add(candidate);
  return candidate;
}

function isRealWorkspaceSurfaceKind(value: unknown): value is ProductSurfaceKind {
  return (
    typeof value === "string" && realWorkspaceSurfaceKinds.includes(value as ProductSurfaceKind)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function persistedLayoutRevision(revision: number): number {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`workspace layout revision must be a non-negative integer: ${revision}`);
  }
  return Math.max(1, revision);
}

function normalizedStoredSlotIndex(slotIndex: number | undefined, fallbackIndex: number): number {
  if (!isFiniteNumber(slotIndex)) {
    return Math.max(0, Math.floor(fallbackIndex));
  }
  return Math.max(0, Math.floor(slotIndex));
}
