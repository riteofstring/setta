import { describe, expect, test } from "vitest";

import {
  overviewPaneDropIntentFromGhost,
  type OverviewGhostTarget,
} from "./workspace-overview-ghost";
import type { WorkspaceColumn, WorkspacePane, WorkspaceScene } from "./types";

describe("overview ghost pane drop intents", () => {
  test("maps above and below ghosts to row drops", () => {
    const scene = ghostIntentScene();

    expect(overviewPaneDropIntentFromGhost(ghostTarget("above"), scene)).toEqual({
      kind: "row",
      placement: "before",
      targetPaneId: "target_pane",
    });
    expect(overviewPaneDropIntentFromGhost(ghostTarget("below"), scene)).toEqual({
      kind: "row",
      placement: "after",
      targetPaneId: "target_pane",
    });
  });

  test("maps right ghosts to destination column drops", () => {
    expect(overviewPaneDropIntentFromGhost(ghostTarget("right"), ghostIntentScene())).toEqual({
      kind: "column",
      planeIndex: 3,
      slotPlacement: "after",
      targetColumnId: "target_column",
    });
  });

  test("returns null when the ghost target is not in the scene", () => {
    expect(
      overviewPaneDropIntentFromGhost(
        { ...ghostTarget("right"), paneId: "missing" },
        ghostIntentScene(),
      ),
    ).toBeNull();
  });
});

function ghostTarget(placement: OverviewGhostTarget["placement"]): OverviewGhostTarget {
  return {
    height: 120,
    left: 10,
    paneId: "target_pane",
    placement,
    top: 10,
    width: 200,
  };
}

function ghostIntentScene(): WorkspaceScene {
  const panes: WorkspacePane[] = [
    {
      columnId: "target_column",
      heat: 0,
      paneId: "target_pane",
      sequence: 0,
      subtitle: "workspace surface",
      surfaceId: "target_surface",
      surfaceKind: "empty-frame",
      title: "Target",
      tone: "slate",
      weight: 1,
    },
  ];
  const columns: WorkspaceColumn[] = [
    {
      columnId: "target_column",
      idealWidthSpec: { unit: "px", value: 520 },
      index: 0,
      paneIds: ["target_pane"],
      planeIndex: 3,
      slotIndex: 2,
      widthSpec: { unit: "px", value: 520 },
    },
  ];
  return {
    columnGap: 8,
    columns,
    defaultColumnWidthSpec: { unit: "px", value: 520 },
    id: "overview-ghost-intent",
    padding: 10,
    paneById: new Map(panes.map((pane) => [pane.paneId, pane])),
    panes,
    panesPerColumn: 1,
    renderOverscanColumns: 2,
    rowGap: 8,
    targetVisiblePanes: 1,
    totalPanes: 1,
    visibleColumnCount: 1,
  };
}
