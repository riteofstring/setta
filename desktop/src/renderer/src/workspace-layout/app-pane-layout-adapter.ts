import {
  appPaneLayoutSchemaVersion,
  workspaceUILayoutSchemaVersion,
  type AppPane,
  type AppPaneColumn,
  type AppPaneColumnWidthSpec,
  type AppPaneLayout,
  type AppPaneTone,
  type WorkspaceUIColumn,
  type WorkspaceUILayout,
  type WorkspaceUIPane,
} from "@generated/backend";

import type { ColumnWidthSpec, WorkspaceColumn, WorkspacePane, WorkspaceScene } from "./types";

const appMasterPaneId = "app_pane_master";
const appMasterSurfaceId = "app_surface_master";
const appMasterColumnId = "app_column_master";
const appMasterColumnWidth: AppPaneColumnWidthSpec = { unit: "px", value: 520 };

interface AppPaneLayoutToWorkspaceLayoutInput {
  layout: AppPaneLayout | null;
  workspaceId: string;
}

interface AppPaneLayoutToWorkspaceLayoutResult {
  layout: WorkspaceUILayout | null;
  maximizedPaneId: string | null;
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
}: AppPaneLayoutToWorkspaceLayoutInput): AppPaneLayoutToWorkspaceLayoutResult {
  if (!layout) {
    return { layout: null, maximizedPaneId: null };
  }
  const panes = layout.panes.flatMap(workspacePaneFromAppPane);
  const paneIds = new Set(panes.map((pane) => pane.paneId));
  const columns = layout.columns.flatMap((column) =>
    workspaceColumnFromAppPaneColumn(column, paneIds),
  );
  if (panes.length === 0 || columns.length === 0) {
    return { layout: null, maximizedPaneId: null };
  }
  return {
    layout: {
      columns,
      focusedPaneId: layout.focusedPaneId,
      panes,
      schemaVersion: workspaceUILayoutSchemaVersion,
      workspaceId,
    },
    maximizedPaneId:
      layout.maximizedPaneId && paneIds.has(layout.maximizedPaneId) ? layout.maximizedPaneId : null,
  };
}

export function appPaneLayoutFromWorkspaceScene({
  focusedPaneId,
  maximizedPaneId,
  scene,
  workspaceRootPath,
}: WorkspaceSceneToAppPaneLayoutInput): AppPaneLayout {
  const paneIds = new Set(scene.panes.map((pane) => pane.paneId));
  const surfaceIds = new Set(scene.panes.map((pane) => pane.surfaceId));
  const columnIds = new Set(scene.columns.map((column) => column.columnId));
  const masterPaneId = uniqueAppLayoutId(appMasterPaneId, paneIds);
  const masterSurfaceId = uniqueAppLayoutId(appMasterSurfaceId, surfaceIds);
  const masterColumnId = uniqueAppLayoutId(appMasterColumnId, columnIds);
  return {
    columns: [
      appPaneMasterColumn(masterColumnId, masterPaneId),
      ...scene.columns.map(appPaneColumnFromWorkspaceColumn),
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

function workspacePaneFromAppPane(pane: AppPane): WorkspaceUIPane[] {
  const fields = workspacePaneFieldsFromAppPane(pane);
  switch (pane.surfaceKind) {
    case "conversation":
      return [
        {
          ...fields,
          easyButtonConfig: { conversationId: pane.conversationConfig.conversationId },
          surfaceKind: "easy-button",
        },
      ];
    case "browser":
    case "empty-frame":
      return [{ ...fields, easyButtonConfig: null, surfaceKind: pane.surfaceKind }];
    case "master":
      return [];
    default:
      return assertNever(pane);
  }
}

function appPaneFromWorkspacePane(pane: WorkspacePane, workspaceRootPath: string | null): AppPane {
  const fields = appPaneFieldsFromWorkspacePane(pane);
  switch (pane.surfaceKind) {
    case "easy-button":
      return {
        ...fields,
        conversationConfig: {
          conversationId: pane.easyButtonConfig.conversationId,
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

function appPaneColumnFromWorkspaceColumn(column: WorkspaceColumn): AppPaneColumn {
  return {
    columnId: column.columnId,
    idealWidthSpec: appPaneColumnWidthSpec(column.idealWidthSpec),
    index: column.index,
    paneIds: [...column.paneIds],
    planeIndex: column.planeIndex,
    previousProportionWidth: column.previousProportionWidth ?? null,
    slotIndex: column.slotIndex ?? column.index,
    widthSpec: appPaneColumnWidthSpec(column.widthSpec),
  };
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
