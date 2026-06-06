import type {
  ColumnWidthSpec,
  NiriColumn,
  NiriPane,
  NiriWorkspaceScene,
  PaneId,
  SurfaceKind,
} from "./types";

const realWorkspaceVisibleColumnCount = 3;
const realWorkspaceStorageVersion = 3;
const defaultRealColumnWidth: ColumnWidthSpec = { unit: "px", value: 520 };
const realWorkspaceRenderOverscanColumns = 1;

export interface RealWorkspaceSceneOptions {
  storageKey: string;
  workspaceName: string;
}

export interface RealWorkspaceSceneResult {
  focusedPaneId: PaneId;
  scene: NiriWorkspaceScene;
}

interface StoredWorkspaceLayout {
  columns: NiriColumn[];
  focusedPaneId: PaneId;
  panes: NiriPane[];
  version: typeof realWorkspaceStorageVersion;
}

interface CreatePaneInput {
  columnId: string;
  sequence: number;
  subtitle: string;
  surfaceKind: SurfaceKind;
  title: string;
  tone: NiriPane["tone"];
  weight?: number;
}

export function createRealWorkspaceScene({
  storageKey,
  workspaceName,
}: RealWorkspaceSceneOptions): RealWorkspaceSceneResult {
  const stored = readStoredWorkspaceLayout(storageKey);
  if (stored) {
    return {
      focusedPaneId: stored.focusedPaneId,
      scene: sceneFromPanesAndColumns(storageKey, stored.panes, stored.columns),
    };
  }
  const scene = createDefaultRealWorkspaceScene(storageKey, workspaceName);
  return {
    focusedPaneId: scene.columns[0]?.paneIds[0] ?? scene.panes[0]?.paneId ?? "",
    scene,
  };
}

export function persistRealWorkspaceScene(
  storageKey: string,
  scene: NiriWorkspaceScene,
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
): NiriWorkspaceScene {
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
      subtitle: "focused native browser proxy",
      surfaceKind: "browser",
      title: "Browser",
      tone: "orange",
    }),
    createPane({
      columnId: "workspace_column_2",
      sequence: 2,
      subtitle: "workspace command surface",
      surfaceKind: "terminal",
      title: "Terminal",
      tone: "green",
    }),
    createPane({
      columnId: "workspace_column_3",
      sequence: 3,
      subtitle: "workspace settings",
      surfaceKind: "settings-dom",
      title: "Settings",
      tone: "slate",
    }),
    createPane({
      columnId: "workspace_column_4",
      sequence: 4,
      subtitle: "repository graph placeholder",
      surfaceKind: "git-graph",
      title: "Git Graph",
      tone: "pink",
    }),
    createPane({
      columnId: "workspace_column_5",
      sequence: 5,
      subtitle: "interactive canvas placeholder",
      surfaceKind: "pixi-canvas",
      title: "Canvas",
      tone: "cyan",
    }),
  ];
  return sceneFromPanesAndColumns(storageKey, panes, [
    {
      columnId: "workspace_column_0",
      idealWidthSpec: defaultRealColumnWidth,
      index: 0,
      paneIds: ["workspace_pane_0"],
      widthSpec: defaultRealColumnWidth,
    },
    {
      columnId: "workspace_column_1",
      idealWidthSpec: defaultRealColumnWidth,
      index: 1,
      paneIds: ["workspace_pane_1"],
      widthSpec: defaultRealColumnWidth,
    },
    {
      columnId: "workspace_column_2",
      idealWidthSpec: defaultRealColumnWidth,
      index: 2,
      paneIds: ["workspace_pane_2"],
      widthSpec: defaultRealColumnWidth,
    },
    {
      columnId: "workspace_column_3",
      idealWidthSpec: defaultRealColumnWidth,
      index: 3,
      paneIds: ["workspace_pane_3"],
      widthSpec: defaultRealColumnWidth,
    },
    {
      columnId: "workspace_column_4",
      idealWidthSpec: defaultRealColumnWidth,
      index: 4,
      paneIds: ["workspace_pane_4"],
      widthSpec: defaultRealColumnWidth,
    },
    {
      columnId: "workspace_column_5",
      idealWidthSpec: defaultRealColumnWidth,
      index: 5,
      paneIds: ["workspace_pane_5"],
      widthSpec: defaultRealColumnWidth,
    },
  ]);
}

function createPane({
  columnId,
  sequence,
  subtitle,
  surfaceKind,
  title,
  tone,
  weight = 1,
}: CreatePaneInput): NiriPane {
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
  panes: readonly NiriPane[],
  columns: readonly NiriColumn[],
): NiriWorkspaceScene {
  const normalizedColumns = columns
    .filter((column) => column.paneIds.length > 0)
    .map((column, index) => ({
      ...column,
      idealWidthSpec: { ...column.idealWidthSpec },
      index,
      paneIds: [...column.paneIds],
      widthSpec: { ...column.widthSpec },
    }));
  const normalizedPanes = panes.map((pane) => ({ ...pane }));
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

function readStoredWorkspaceLayout(storageKey: string): StoredWorkspaceLayout | null {
  const storage = browserLocalStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!isStoredWorkspaceLayout(parsed)) {
    throw new Error(`invalid niri workspace layout in localStorage key ${storageKey}`);
  }
  return parsed;
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
    candidate.columns.every(isStoredColumn)
  );
}

function isStoredColumn(value: unknown): value is NiriColumn {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<NiriColumn>;
  return (
    typeof candidate.columnId === "string" &&
    isColumnWidthSpec(candidate.idealWidthSpec) &&
    typeof candidate.index === "number" &&
    Array.isArray(candidate.paneIds) &&
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
