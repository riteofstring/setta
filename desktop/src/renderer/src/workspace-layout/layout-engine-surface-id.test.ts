import { expect, test } from "vitest";

import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import type { WorkspaceScene } from "./types";

test("keeps generated surface ids unique after a configured layout is restored", () => {
  const configured = new WorkspaceLikeLayoutEngine(sparseGeneratedPaneScene());
  configured.configurePane("workspace_pane_0", {
    surfaceKind: "browser",
    title: "Configured browser",
  });
  expect(configured.toScene().paneById.get("workspace_pane_0")?.surfaceId).toBe(
    "workspace_surface_9",
  );

  const restored = new WorkspaceLikeLayoutEngine(configured.toScene());
  const openedPaneId = restored.openPane({
    surfaceKind: "browser",
    title: "Another browser",
  });
  const scene = restored.toScene();

  expect(openedPaneId).toBe("workspace_pane_9");
  expect(scene.paneById.get(openedPaneId)?.surfaceId).toBe("workspace_surface_10");
  expect(new Set(scene.panes.map((pane) => pane.surfaceId)).size).toBe(scene.totalPanes);
});

function sparseGeneratedPaneScene(): WorkspaceScene {
  const panes = [
    {
      columnId: "workspace_column_0",
      heat: 0,
      paneId: "workspace_pane_0",
      sequence: 0,
      subtitle: "Repo",
      surfaceId: "workspace_surface_0",
      surfaceKind: "empty-frame",
      title: "Frame",
      tone: "cyan",
      weight: 1,
    },
    {
      columnId: "workspace_column_8",
      heat: 0,
      paneId: "workspace_pane_8",
      sequence: 8,
      subtitle: "Old",
      surfaceId: "workspace_surface_8",
      surfaceKind: "browser",
      title: "Browser",
      tone: "cyan",
      weight: 1,
    },
  ] satisfies WorkspaceScene["panes"];
  const columns = [
    {
      columnId: "workspace_column_0",
      idealWidthSpec: { unit: "px", value: 520 },
      index: 0,
      paneIds: ["workspace_pane_0"],
      planeIndex: 0,
      widthSpec: { unit: "px", value: 520 },
    },
    {
      columnId: "workspace_column_8",
      idealWidthSpec: { unit: "px", value: 520 },
      index: 1,
      paneIds: ["workspace_pane_8"],
      planeIndex: 0,
      widthSpec: { unit: "px", value: 520 },
    },
  ] satisfies WorkspaceScene["columns"];
  return {
    columnGap: 8,
    columns,
    defaultColumnWidthSpec: { unit: "px", value: 520 },
    id: "sparse-generated-pane-scene",
    paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
    panes,
    panesPerColumn: 1,
    padding: 10,
    renderOverscanColumns: 2,
    rowGap: 8,
    targetVisiblePanes: panes.length,
    totalPanes: panes.length,
    visibleColumnCount: 2,
  };
}
