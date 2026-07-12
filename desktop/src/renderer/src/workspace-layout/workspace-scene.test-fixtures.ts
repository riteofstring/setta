import type { SurfaceKind, WorkspaceUIPane } from "@generated/backend";

import { createRealWorkspaceScene, type RealWorkspaceSceneOptions } from "./workspace-scene";

const layoutTestSurfaces = [
  { surfaceKind: "empty-frame", title: "Frame", tone: "cyan", weight: 1.6 },
  { surfaceKind: "empty-frame", title: "Frame 2", tone: "green", weight: 1 },
  { surfaceKind: "easy-button", title: "Topic", tone: "cyan", weight: 1 },
  { surfaceKind: "settings-dom", title: "Settings", tone: "slate", weight: 1 },
] as const satisfies readonly {
  surfaceKind: SurfaceKind;
  title: string;
  tone: "cyan" | "green" | "slate";
  weight: number;
}[];

export function createWorkspaceLayoutTestScene(options: RealWorkspaceSceneOptions) {
  return createRealWorkspaceScene({
    ...options,
    storedLayout: {
      columns: layoutTestSurfaces.map((_, index) => ({
        columnId: `workspace_column_${index}`,
        idealWidthSpec: { unit: "px", value: 520 },
        index,
        paneIds: [`workspace_pane_${index}`],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: index,
        widthSpec: { unit: "px", value: 520 },
      })),
      focusedPaneId: "workspace_pane_0",
      panes: layoutTestSurfaces.map(storedTestPane),
      schemaVersion: 1,
      workspaceId: options.workspaceId,
    },
  });
}

function storedTestPane(
  surface: (typeof layoutTestSurfaces)[number],
  index: number,
): WorkspaceUIPane {
  const fields = {
    columnId: `workspace_column_${index}`,
    heat: index * 20,
    paneId: `workspace_pane_${index}`,
    sequence: index,
    subtitle: "layout test surface",
    surfaceId: `workspace_surface_${index}`,
    title: surface.title,
    tone: surface.tone,
    weight: surface.weight,
  };
  if (surface.surfaceKind === "easy-button") {
    return {
      ...fields,
      easyButtonConfig: { conversationId: "conversation_layout_test" },
      surfaceKind: surface.surfaceKind,
    };
  }
  return { ...fields, easyButtonConfig: null, surfaceKind: surface.surfaceKind };
}
