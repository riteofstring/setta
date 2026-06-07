import { productSurfaceKinds } from "./types";
import type {
  ColumnWidthSpec,
  WorkspaceColumn,
  WorkspacePane,
  WorkspaceScene,
  PaneLimitPolicy,
  PaneId,
  ProductSurfaceKind,
} from "./types";

const realWorkspaceVisibleColumnCount = 3;
const realWorkspaceStorageVersion = 4;
const defaultRealColumnWidth: ColumnWidthSpec = { unit: "px", value: 520 };
const realWorkspaceRenderOverscanColumns = 2;
const realWorkspaceSurfaceKinds = productSurfaceKinds;
const paneTones = ["cyan", "green", "orange", "pink", "slate"] satisfies Array<
  WorkspacePane["tone"]
>;
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
  storageKey: string;
  workspaceName: string;
}

export interface RealWorkspaceSceneResult {
  focusedPaneId: PaneId;
  layoutRecovery: WorkspaceLayoutRecovery | null;
  scene: WorkspaceScene;
}

interface WorkspaceLayoutRecovery {
  message: string;
  storageKey: string;
}

interface StoredWorkspaceLayout {
  columns: WorkspaceColumn[];
  focusedPaneId: PaneId;
  panes: WorkspacePane[];
  version: typeof realWorkspaceStorageVersion;
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
  storageKey,
  workspaceName,
}: RealWorkspaceSceneOptions): RealWorkspaceSceneResult {
  const stored = readStoredWorkspaceLayout(storageKey);
  if (stored.layout) {
    const scene = sceneFromPanesAndColumns(storageKey, stored.layout.panes, stored.layout.columns);
    return {
      focusedPaneId: focusedPaneIdForScene(scene, stored.layout.focusedPaneId),
      layoutRecovery: stored.recovery,
      scene,
    };
  }
  const scene = createDefaultRealWorkspaceScene(storageKey, workspaceName);
  return {
    focusedPaneId: focusedPaneIdForScene(scene),
    layoutRecovery: stored.recovery,
    scene,
  };
}

export function persistRealWorkspaceScene(
  storageKey: string,
  scene: WorkspaceScene,
  focusedPaneId: PaneId,
): void {
  const storage = browserLocalStorage();
  if (!storage) {
    return;
  }
  const layout: StoredWorkspaceLayout = {
    columns: scene.columns.map((column, index) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      index,
      paneIds: [...column.paneIds],
      slotIndex: normalizedStoredSlotIndex(column.slotIndex, index),
      widthSpec: { ...column.widthSpec },
    })),
    focusedPaneId,
    panes: scene.panes.map((pane) => ({ ...pane })),
    version: realWorkspaceStorageVersion,
  };
  storage.setItem(storageKey, JSON.stringify(layout));
}

function createDefaultRealWorkspaceScene(
  storageKey: string,
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
    storageKey,
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

function readStoredWorkspaceLayout(storageKey: string): {
  layout: StoredWorkspaceLayout | null;
  recovery: WorkspaceLayoutRecovery | null;
} {
  const storage = browserLocalStorage();
  if (!storage) {
    return { layout: null, recovery: null };
  }
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return { layout: null, recovery: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return resetStoredWorkspaceLayout(storage, storageKey, "Saved workspace layout was not JSON.");
  }
  if (!isStoredWorkspaceLayout(parsed)) {
    return resetStoredWorkspaceLayout(
      storage,
      storageKey,
      "Saved workspace layout did not match the current product layout contract.",
    );
  }
  return { layout: parsed, recovery: null };
}

function resetStoredWorkspaceLayout(
  storage: Storage,
  storageKey: string,
  reason: string,
): {
  layout: StoredWorkspaceLayout | null;
  recovery: WorkspaceLayoutRecovery | null;
} {
  storage.removeItem(storageKey);
  return {
    layout: null,
    recovery: {
      message: `${reason} The layout was reset.`,
      storageKey,
    },
  };
}

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function isStoredWorkspaceLayout(value: unknown): value is StoredWorkspaceLayout {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredWorkspaceLayout>;
  return (
    candidate.version === realWorkspaceStorageVersion &&
    typeof candidate.focusedPaneId === "string" &&
    Array.isArray(candidate.columns) &&
    Array.isArray(candidate.panes) &&
    candidate.columns.every(isStoredColumn) &&
    candidate.panes.every(isStoredPane)
  );
}

function isStoredPane(value: unknown): value is WorkspacePane {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<WorkspacePane>;
  return (
    hasStoredPaneIdentity(candidate) &&
    hasStoredPaneContent(candidate) &&
    hasStoredPaneSizing(candidate) &&
    hasStoredTerminalConfig(candidate)
  );
}

function hasStoredPaneIdentity(candidate: Partial<WorkspacePane>): boolean {
  return (
    typeof candidate.columnId === "string" &&
    typeof candidate.paneId === "string" &&
    typeof candidate.surfaceId === "string"
  );
}

function hasStoredPaneContent(candidate: Partial<WorkspacePane>): boolean {
  return (
    typeof candidate.subtitle === "string" &&
    isRealWorkspaceSurfaceKind(candidate.surfaceKind) &&
    typeof candidate.title === "string" &&
    isPaneTone(candidate.tone)
  );
}

function hasStoredPaneSizing(candidate: Partial<WorkspacePane>): boolean {
  return (
    isFiniteNumber(candidate.heat) &&
    isFiniteNumber(candidate.sequence) &&
    isFiniteNumber(candidate.weight)
  );
}

function hasStoredTerminalConfig(candidate: Partial<WorkspacePane>): boolean {
  const config = candidate.terminalConfig;
  if (config === undefined) {
    return true;
  }
  if (!config || typeof config !== "object") {
    return false;
  }
  return (
    typeof config.profileId === "string" &&
    isOptionalString(config.cwdOverride) &&
    isOptionalString(config.titleOverride)
  );
}

function isStoredColumn(value: unknown): value is WorkspaceColumn {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<WorkspaceColumn>;
  return (
    typeof candidate.columnId === "string" &&
    isColumnWidthSpec(candidate.idealWidthSpec) &&
    typeof candidate.index === "number" &&
    Array.isArray(candidate.paneIds) &&
    typeof candidate.planeIndex === "number" &&
    isOptionalFiniteNumber(candidate.slotIndex) &&
    isColumnWidthSpec(candidate.widthSpec)
  );
}

function isColumnWidthSpec(value: unknown): value is ColumnWidthSpec {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ColumnWidthSpec>;
  return (
    (candidate.unit === "proportion" || candidate.unit === "px") &&
    typeof candidate.value === "number" &&
    Number.isFinite(candidate.value) &&
    candidate.value > 0
  );
}

function isRealWorkspaceSurfaceKind(value: unknown): value is ProductSurfaceKind {
  return (
    typeof value === "string" && realWorkspaceSurfaceKinds.includes(value as ProductSurfaceKind)
  );
}

function isPaneTone(value: unknown): value is WorkspacePane["tone"] {
  return typeof value === "string" && paneTones.includes(value as WorkspacePane["tone"]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function normalizedStoredSlotIndex(slotIndex: number | undefined, fallbackIndex: number): number {
  if (!isFiniteNumber(slotIndex)) {
    return Math.max(0, Math.floor(fallbackIndex));
  }
  return Math.max(0, Math.floor(slotIndex));
}
