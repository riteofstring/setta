import {
  appPaneLayoutSchemaVersion,
  workspaceUILayoutSchemaVersion,
  type AppPane,
  type AppPaneColumn,
  type AppPaneColumnWidthSpec,
  type AppPaneLayout,
  type AppPaneTone,
  type WorkspaceUIColumn,
} from "@generated/backend";

import type { ColumnWidthSpec, WorkspaceColumn, WorkspacePane, WorkspaceScene } from "./types";
import type { RealWorkspaceStoredLayout } from "./workspace-scene";

const appMasterPaneId = "app_pane_master";
const appMasterSurfaceId = "app_surface_master";
const appMasterColumnId = "app_column_master";
const appMasterColumnWidth: AppPaneColumnWidthSpec = { unit: "px", value: 520 };

interface AppPaneLayoutToWorkspaceLayoutInput {
  layout: AppPaneLayout | null;
  workspaceId: string;
  workspaceRootPath: string | null;
}

interface AppPaneLayoutToWorkspaceLayoutResult {
  layout: RealWorkspaceStoredLayout | null;
  maximizedPaneId: string | null;
}

interface CurrentWorkspaceLayout {
  columns: WorkspaceUIColumn[];
  focusedPaneId: string;
  maximizedPaneId: string | null;
  panes: WorkspacePane[];
}

interface WorkspaceSceneToAppPaneLayoutInput {
  focusedPaneId: string;
  maximizedPaneId: string | null;
  scene: WorkspaceScene;
  workspaceRootPath: string | null;
}

export function appPaneLayoutToWorkspaceUILayout({
  layout,
  workspaceId,
  workspaceRootPath,
}: AppPaneLayoutToWorkspaceLayoutInput): AppPaneLayoutToWorkspaceLayoutResult {
  if (!layout) {
    return { layout: null, maximizedPaneId: null };
  }
  const currentLayout = currentWorkspaceLayoutFromAppLayout(layout, workspaceRootPath);
  if (!currentLayout) {
    return { layout: null, maximizedPaneId: null };
  }
  return {
    layout: {
      columns: currentLayout.columns,
      focusedPaneId: currentLayout.focusedPaneId,
      panes: currentLayout.panes,
      schemaVersion: workspaceUILayoutSchemaVersion,
      workspaceId,
    },
    maximizedPaneId: currentLayout.maximizedPaneId,
  };
}

function currentWorkspaceLayoutFromAppLayout(
  layout: AppPaneLayout,
  workspaceRootPath: string | null,
): CurrentWorkspaceLayout | null {
  const panes = layout.panes.flatMap((pane) => workspacePaneFromAppPane(pane, workspaceRootPath));
  const paneIds = new Set(panes.map((pane) => pane.paneId));
  const columns = workspaceColumnsFromAppPaneColumns(layout.columns, paneIds);
  if (panes.length === 0 || columns.length === 0) {
    return null;
  }
  return {
    columns,
    focusedPaneId: currentWorkspaceFocusedPaneId(layout.focusedPaneId, paneIds, columns, panes),
    maximizedPaneId: currentWorkspaceMaximizedPaneId(layout.maximizedPaneId, paneIds),
    panes,
  };
}

function currentWorkspaceFocusedPaneId(
  appFocusedPaneId: string,
  paneIds: ReadonlySet<string>,
  columns: readonly WorkspaceUIColumn[],
  panes: readonly WorkspacePane[],
): string {
  if (paneIds.has(appFocusedPaneId)) {
    return appFocusedPaneId;
  }
  return columns[0]?.paneIds[0] ?? panes[0]?.paneId ?? appFocusedPaneId;
}

function currentWorkspaceMaximizedPaneId(
  appMaximizedPaneId: string | null,
  paneIds: ReadonlySet<string>,
): string | null {
  if (!appMaximizedPaneId) {
    return null;
  }
  return paneIds.has(appMaximizedPaneId) ? appMaximizedPaneId : null;
}

export function appPaneLayoutFromWorkspaceScene({
  focusedPaneId,
  maximizedPaneId,
  scene,
  workspaceRootPath,
}: WorkspaceSceneToAppPaneLayoutInput): AppPaneLayout {
  const paneIds = new Set(scene.panes.map((pane) => pane.paneId));
  const masterPanes = scene.panes.filter((pane) => pane.surfaceKind === "master");
  if (masterPanes.length > 1) {
    throw new Error(
      `app layout scene must contain exactly one master pane, got ${masterPanes.length}`,
    );
  }
  if (masterPanes.length === 1) {
    return {
      columns: scene.columns.map((column) => appPaneColumnFromWorkspaceColumn(column)),
      focusedPaneId,
      maximizedPaneId: maximizedPaneId && paneIds.has(maximizedPaneId) ? maximizedPaneId : null,
      panes: scene.panes.map((pane) => appPaneFromWorkspacePane(pane, workspaceRootPath)),
      schemaVersion: appPaneLayoutSchemaVersion,
    };
  }
  const surfaceIds = new Set(scene.panes.map((pane) => pane.surfaceId));
  const columnIds = new Set(scene.columns.map((column) => column.columnId));
  const masterPaneId = uniqueAppLayoutId(appMasterPaneId, paneIds);
  const masterSurfaceId = uniqueAppLayoutId(appMasterSurfaceId, surfaceIds);
  const masterColumnId = uniqueAppLayoutId(appMasterColumnId, columnIds);
  return {
    columns: [
      appPaneMasterColumn(masterColumnId, masterPaneId),
      ...scene.columns.map((column) => appPaneColumnFromWorkspaceColumn(column, 1)),
    ],
    focusedPaneId,
    maximizedPaneId: maximizedPaneId && paneIds.has(maximizedPaneId) ? maximizedPaneId : null,
    panes: [
      appPaneMaster(masterColumnId, masterPaneId, masterSurfaceId),
      ...scene.panes.map((pane) => appPaneFromWorkspacePane(pane, workspaceRootPath)),
    ],
    schemaVersion: appPaneLayoutSchemaVersion,
  };
}

function workspacePaneFromAppPane(
  pane: AppPane,
  workspaceRootPath: string | null,
): WorkspacePane[] {
  const fields = workspacePaneFieldsFromAppPane(pane);
  switch (pane.surfaceKind) {
    case "conversation":
      if (!conversationPaneBelongsToWorkspace(pane, workspaceRootPath)) {
        return [];
      }
      return [
        {
          ...fields,
          conversationConfig: { conversationId: pane.conversationConfig.conversationId },
          surfaceKind: "conversation",
        },
      ];
    case "browser":
    case "empty-frame":
      return [{ ...fields, surfaceKind: pane.surfaceKind }];
    case "master":
      return [{ ...fields, surfaceKind: pane.surfaceKind }];
    default:
      return assertNever(pane);
  }
}

function appPaneFromWorkspacePane(pane: WorkspacePane, workspaceRootPath: string | null): AppPane {
  const fields = appPaneFieldsFromWorkspacePane(pane);
  switch (pane.surfaceKind) {
    case "conversation":
      return {
        ...fields,
        conversationConfig: {
          conversationId: pane.conversationConfig.conversationId,
          presentationIdentity: {
            subtitle: pane.subtitle,
            title: pane.title,
            tone: appPaneTone(pane.tone),
          },
          resourceBindings: workspaceRootPath
            ? [{ folder: { rootPath: workspaceRootPath }, kind: "folder" }]
            : [],
        },
        masterConfig: null,
        surfaceKind: "conversation",
      };
    case "master":
      return {
        ...fields,
        conversationConfig: null,
        masterConfig: {},
        surfaceKind: pane.surfaceKind,
      };
    case "browser":
    case "empty-frame":
      return {
        ...fields,
        conversationConfig: null,
        masterConfig: null,
        surfaceKind: pane.surfaceKind,
      };
    default:
      throw new Error(`workspace pane cannot be stored in app layout: ${pane.surfaceKind}`);
  }
}

function workspacePaneFieldsFromAppPane(pane: AppPane) {
  return {
    columnId: pane.columnId,
    heat: pane.heat,
    paneId: pane.paneId,
    sequence: pane.sequence,
    subtitle: pane.subtitle,
    surfaceId: pane.surfaceId,
    title: pane.title,
    tone: pane.tone,
    weight: pane.weight,
  };
}

function appPaneFieldsFromWorkspacePane(pane: WorkspacePane) {
  return {
    columnId: pane.columnId,
    heat: pane.heat,
    paneId: pane.paneId,
    sequence: pane.sequence,
    subtitle: pane.subtitle,
    surfaceId: pane.surfaceId,
    title: pane.title,
    tone: appPaneTone(pane.tone),
    weight: pane.weight,
  };
}

function workspaceColumnFromAppPaneColumn(
  column: AppPaneColumn,
  paneIds: ReadonlySet<string>,
): WorkspaceUIColumn[] {
  const columnPaneIds = column.paneIds.filter((paneId) => paneIds.has(paneId));
  if (columnPaneIds.length === 0) {
    return [];
  }
  return [
    {
      columnId: column.columnId,
      idealWidthSpec: workspaceColumnWidthSpec(column.idealWidthSpec),
      index: column.index,
      paneIds: columnPaneIds,
      planeIndex: column.planeIndex,
      previousProportionWidth: column.previousProportionWidth,
      slotIndex: column.slotIndex,
      widthSpec: workspaceColumnWidthSpec(column.widthSpec),
    },
  ];
}

function appPaneColumnFromWorkspaceColumn(column: WorkspaceColumn, offset = 0): AppPaneColumn {
  return {
    columnId: column.columnId,
    idealWidthSpec: appPaneColumnWidthSpec(column.idealWidthSpec),
    index: column.index + offset,
    paneIds: [...column.paneIds],
    planeIndex: column.planeIndex,
    previousProportionWidth: column.previousProportionWidth ?? null,
    slotIndex: (column.slotIndex ?? column.index) + offset,
    widthSpec: appPaneColumnWidthSpec(column.widthSpec),
  };
}

function conversationPaneBelongsToWorkspace(
  pane: Extract<AppPane, { surfaceKind: "conversation" }>,
  workspaceRootPath: string | null,
): boolean {
  if (!workspaceRootPath) {
    return false;
  }
  return pane.conversationConfig.resourceBindings.some(
    (binding) => binding.kind === "folder" && binding.folder.rootPath === workspaceRootPath,
  );
}

function workspaceColumnsFromAppPaneColumns(
  appColumns: readonly AppPaneColumn[],
  paneIds: ReadonlySet<string>,
): WorkspaceUIColumn[] {
  const filteredColumns = appColumns.flatMap((column) =>
    workspaceColumnFromAppPaneColumn(column, paneIds),
  );
  const slotOffset = Math.min(...filteredColumns.map((column) => column.slotIndex));
  const normalizedSlotOffset = Number.isFinite(slotOffset) ? Math.max(0, slotOffset) : 0;
  return filteredColumns.map((column, index) => ({
    ...column,
    index,
    slotIndex: Math.max(0, column.slotIndex - normalizedSlotOffset),
  }));
}

function appPaneMasterColumn(columnId: string, paneId: string): AppPaneColumn {
  return {
    columnId,
    idealWidthSpec: appMasterColumnWidth,
    index: 0,
    paneIds: [paneId],
    planeIndex: 0,
    previousProportionWidth: null,
    slotIndex: 0,
    widthSpec: appMasterColumnWidth,
  };
}

function appPaneMaster(columnId: string, paneId: string, surfaceId: string): AppPane {
  return {
    columnId,
    conversationConfig: null,
    heat: 0,
    masterConfig: {},
    paneId,
    sequence: 0,
    subtitle: "Global coordinator",
    surfaceId,
    surfaceKind: "master",
    title: "Setta",
    tone: "slate",
    weight: 1,
  };
}

function workspaceColumnWidthSpec(spec: AppPaneColumnWidthSpec): ColumnWidthSpec {
  return {
    unit: spec.unit,
    value: spec.value,
  };
}

function appPaneColumnWidthSpec(spec: ColumnWidthSpec): AppPaneColumnWidthSpec {
  return {
    unit: spec.unit,
    value: spec.value,
  };
}

function appPaneTone(tone: WorkspacePane["tone"]): AppPaneTone {
  return tone;
}

function uniqueAppLayoutId(base: string, usedIds: Set<string>): string {
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }
  let index = 1;
  let candidate = `${base}_${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported app pane layout surface: ${JSON.stringify(value)}`);
}
