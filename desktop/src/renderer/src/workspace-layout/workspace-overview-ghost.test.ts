import { describe, expect, test } from "vitest";

import {
  overviewGhostTargetFromFrames,
  overviewPaneDropIntentFromGhost,
  type OverviewGhostTarget,
  type OverviewPaneFrame,
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

describe("overview ghost slot geometry", () => {
  // A 2x2 grid of 200x120 panes with an 8px gap. The stage is at the origin so
  // client coordinates equal stage-relative coordinates.
  const grid = (): OverviewPaneFrame[] => [
    paneFrame("a", 0, 0, 0),
    paneFrame("b", 208, 0, 0),
    paneFrame("c", 0, 128, 1),
    paneFrame("d", 208, 128, 1),
  ];

  test("does not place a ghost over the pane below when hovering the inter-row gap", () => {
    // Between pane A (bottom 120) and pane C (top 128); a "below A" / "above C"
    // slot would land on top of a real pane, so no ghost should appear.
    expect(overviewGhostTargetFromFrames(grid(), 100, 124)).toBeNull();
  });

  test("does not place a ghost in the gap between two side-by-side panes", () => {
    // Between pane A (right 200) and pane B (left 208): the column is occupied.
    expect(overviewGhostTargetFromFrames(grid(), 204, 60)).toBeNull();
  });

  test("places a below ghost in the empty space under the bottom row", () => {
    const target = overviewGhostTargetFromFrames(grid(), 100, 260);
    expect(target).toMatchObject({ paneId: "c", placement: "below" });
    expect(target?.top).toBeGreaterThanOrEqual(248);
  });

  test("places a right ghost in the empty space past the last column", () => {
    const target = overviewGhostTargetFromFrames(grid(), 420, 60);
    expect(target).toMatchObject({ paneId: "b", placement: "right" });
    expect(target?.left).toBeGreaterThanOrEqual(408);
  });

  test("sizes the ghost from the current scaled pane frame", () => {
    const scaled = [
      {
        ...paneFrame("a", 0, 0, 0),
        bottom: 60,
        height: 60,
        right: 100,
        width: 100,
      },
    ];

    const target = overviewGhostTargetFromFrames(scaled, 108, 30);

    expect(target).toMatchObject({
      height: 60,
      left: 108,
      placement: "right",
      width: 100,
    });
  });

  test("sizes a ghost to the full row height, not the neighbouring pane", () => {
    // Column B (rightmost) is one plane holding two stacked 120px panes, so the
    // row spans 248px. A right ghost beside either pane should fill that whole
    // row height instead of matching the single pane it was derived from.
    const stackedColumn = (): OverviewPaneFrame[] => [
      paneFrame("a", 0, 0, 0),
      paneFrame("b-top", 208, 0, 0),
      paneFrame("b-bottom", 208, 128, 0),
    ];

    const besideTopPane = overviewGhostTargetFromFrames(stackedColumn(), 420, 60);
    expect(besideTopPane).toMatchObject({ paneId: "b-top", placement: "right" });
    expect(besideTopPane?.top).toBe(0);
    expect(besideTopPane?.height).toBe(248);

    // The affordance is the same full-height row regardless of which stacked pane
    // the pointer happens to be beside.
    const besideBottomPane = overviewGhostTargetFromFrames(stackedColumn(), 420, 180);
    expect(besideBottomPane).toMatchObject({ placement: "right" });
    expect(besideBottomPane?.top).toBe(0);
    expect(besideBottomPane?.height).toBe(248);
  });

  // Column B is one plane holding two stacked 120px panes (row height 248) below
  // an empty band, used to exercise the above/below affordances around a column
  // whose panes are each only half the row.
  const stackedBelowEmptyBand = (): OverviewPaneFrame[] => [
    paneFrame("b-top", 0, 200, 0),
    paneFrame("b-bottom", 0, 328, 0),
  ];

  test("makes the whole row above a stacked column hoverable, at full height", () => {
    // High in the empty band, far above the top pane: the old single-pane hit
    // band ([72, 200]) would miss this; the full row band ([-56, 200]) catches it
    // and the box fills the whole row.
    const target = overviewGhostTargetFromFrames(stackedBelowEmptyBand(), 100, 40);
    expect(target).toMatchObject({ paneId: "b-top", placement: "above" });
    expect(target?.height).toBe(248);
  });

  test("sizes a below-row affordance to the full row height", () => {
    // Just under the column, where the old single-pane band already reached: the
    // box is now the full row height, anchored to the bottom pane.
    const near = overviewGhostTargetFromFrames(stackedBelowEmptyBand(), 100, 500);
    expect(near).toMatchObject({ paneId: "b-bottom", placement: "below" });
    expect(near?.height).toBe(248);

    // Deep in the empty row below, past the old single-pane band ([448, 576]).
    const far = overviewGhostTargetFromFrames(stackedBelowEmptyBand(), 100, 650);
    expect(far).toMatchObject({ paneId: "b-bottom", placement: "below" });
    expect(far?.height).toBe(248);
  });

  test("does not create an in-between row under a short pane inside a taller plane", () => {
    const unevenPlane: OverviewPaneFrame[] = [
      paneFrame("tall", 0, 0, 0, { height: 400 }),
      paneFrame("short", 208, 40, 0),
    ];

    expect(overviewGhostTargetFromFrames(unevenPlane, 300, 170)).toBeNull();

    const target = overviewGhostTargetFromFrames(unevenPlane, 300, 430);
    expect(target).toMatchObject({ paneId: "short", placement: "below" });
    expect(target?.top).toBe(408);
    expect(target?.height).toBe(400);
  });

  test("uses the anchor pane plane when row bands visually overlap", () => {
    const overlappingPlanes: OverviewPaneFrame[] = [
      paneFrame("lower-wide", 0, 100, 1, { height: 200 }),
      paneFrame("upper-mate", 0, 140, 0, { height: 80 }),
      paneFrame("upper-short", 208, 150, 0, { height: 40 }),
    ];

    const target = overviewGhostTargetFromFrames(overlappingPlanes, 420, 170);

    expect(target).toMatchObject({ paneId: "upper-short", placement: "right" });
    expect(target?.top).toBe(140);
    expect(target?.height).toBe(80);
  });
});

function paneFrame(
  paneId: string,
  x: number,
  y: number,
  planeIndex = 0,
  overrides: Partial<Pick<OverviewPaneFrame, "height" | "width">> = {},
): OverviewPaneFrame {
  const width = overrides.width ?? 200;
  const height = overrides.height ?? 120;
  return {
    bottom: y + height,
    height,
    left: x,
    paneId,
    planeIndex,
    relativeLeft: x,
    relativeTop: y,
    right: x + width,
    top: y,
    width,
  };
}

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
