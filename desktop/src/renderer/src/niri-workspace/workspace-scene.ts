import type { NiriColumn, NiriPane, NiriWorkspaceScene, PaneId, SurfaceKind } from "./types";

const realWorkspaceVisibleColumnCount = 3;
const realWorkspaceStorageVersion = 1;

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
      index,
      paneIds: [...column.paneIds],
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
      columnId: "workspace_column_0",
      sequence: 1,
      subtitle: "workspace command surface",
      surfaceKind: "terminal",
      title: "Terminal",
      tone: "green",
    }),
    createPane({
      columnId: "workspace_column_1",
      sequence: 2,
      subtitle: "focused native browser proxy",
      surfaceKind: "browser",
      title: "Browser",
      tone: "orange",
    }),
    createPane({
      columnId: "workspace_column_1",
      sequence: 3,
      subtitle: "workspace settings",
      surfaceKind: "settings-dom",
      title: "Settings",
      tone: "slate",
    }),
    createPane({
      columnId: "workspace_column_2",
      sequence: 4,
      subtitle: "repository graph placeholder",
      surfaceKind: "git-graph",
      title: "Git Graph",
      tone: "pink",
    }),
    createPane({
      columnId: "workspace_column_2",
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
      index: 0,
      paneIds: ["workspace_pane_0", "workspace_pane_1"],
      widthWeight: 1.2,
    },
    {
      columnId: "workspace_column_1",
      index: 1,
      paneIds: ["workspace_pane_2", "workspace_pane_3"],
      widthWeight: 1,
    },
    {
      columnId: "workspace_column_2",
      index: 2,
      paneIds: ["workspace_pane_4", "workspace_pane_5"],
      widthWeight: 1,
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
    .map((column, index) => ({ ...column, index, paneIds: [...column.paneIds] }));
  const normalizedPanes = panes.map((pane) => ({ ...pane }));
  return {
    columnGap: 8,
    columns: normalizedColumns,
    id,
    paneById: new Map(normalizedPanes.map((pane) => [pane.paneId, pane])),
    panes: normalizedPanes,
    panesPerColumn: Math.max(1, ...normalizedColumns.map((column) => column.paneIds.length)),
    padding: 10,
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
    Array.isArray(candidate.panes)
  );
}
