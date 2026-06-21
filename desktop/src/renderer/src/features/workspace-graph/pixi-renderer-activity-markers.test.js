import { Container } from "pixi.js";
import { describe, expect, test } from "vitest";

import {
  syncWorkspaceActivityMarkerGraphicPositions,
  updateWorkspaceActivityMarkerGraphics,
  workspaceActivityChipDebugSnapshot,
  workspaceActivityChipLayout,
  workspaceActivityChipVisualStatesById,
  workspaceActivityMarkerVisualStatesById,
} from "./pixi-renderer-activity-markers";

describe("workflow graph activity marker chips", () => {
  test("materializes readable activity chip views in place with stable counts", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 10, 20)];
    const viewport = fakeViewport(1);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("command", "running")],
        nodes,
        viewport,
      }),
    ).toEqual({ created: 1, removed: 0, retained: 0, updated: 0 });
    const firstView = markerGraphics.get("marker_command").container;
    expect(markerLayer.children).toHaveLength(1);
    expect(firstView.x).toBe(190);
    expect(firstView.y).toBe(27);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("command", "completed")],
        nodes,
        viewport,
      }),
    ).toEqual({ created: 0, removed: 0, retained: 0, updated: 1 });
    expect(markerGraphics.get("marker_command").container).toBe(firstView);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("command", "completed"), marker("approval", "waiting_approval", 1)],
        nodes,
        viewport,
      }),
    ).toEqual({ created: 1, removed: 0, retained: 0, updated: 1 });
    expect(markerLayer.children).toHaveLength(2);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("approval", "waiting_approval", 1)],
        nodes,
        viewport,
      }),
    ).toEqual({ created: 0, removed: 1, retained: 1, updated: 0 });
    expect(markerLayer.children).toHaveLength(1);
  });

  test("exposes resolved visual states for markers and rendered chips", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 10, 20)];
    const viewport = fakeViewport(1);
    const markers = [marker("approval", "waiting_approval"), marker("command", "completed", 1)];
    updateWorkspaceActivityMarkerGraphics({
      markerGraphics,
      markerLayer,
      markers,
      nodes,
      viewport,
    });

    expect(workspaceActivityMarkerVisualStatesById(markers)).toMatchObject({
      marker_approval: {
        channels: {
          fill: 0xf59e0b,
          kindShape: "approval",
          stroke: 0xf59e0b,
        },
        sourceStatus: "waiting_approval",
        state: "waiting_approval",
      },
      marker_command: {
        channels: {
          fill: 0x38bdf8,
          kindShape: "command",
          stroke: 0x86efac,
        },
        sourceStatus: "completed",
        state: "completed",
      },
    });
    expect(workspaceActivityChipVisualStatesById(markerGraphics)).toMatchObject({
      marker_approval: {
        channels: {
          kindShape: "approval",
        },
        state: "waiting_approval",
      },
      marker_command: {
        channels: {
          kindShape: "command",
        },
        state: "completed",
      },
    });
  });

  test("keeps node-anchored chips positioned when graph nodes move", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 10, 20)];
    const viewport = fakeViewport(1);
    updateWorkspaceActivityMarkerGraphics({
      markerGraphics,
      markerLayer,
      markers: [marker("command", "running")],
      nodes,
      viewport,
    });
    const view = markerGraphics.get("marker_command").container;

    nodes[0].x = 42;
    nodes[0].y = 64;
    syncWorkspaceActivityMarkerGraphicPositions({
      markerGraphics,
      markerLayer,
      markers: [marker("command", "running")],
      nodes,
      viewport,
    });

    expect(view.x).toBe(222);
    expect(view.y).toBe(71);
  });

  test("caps readable chips per node and collapses overflow into a count chip", () => {
    const nodes = [node("work", 10, 20)];
    const viewport = fakeViewport(1);
    const layout = workspaceActivityChipLayout({
      markers: [
        marker("command", "completed", 0, "old"),
        marker("file_change", "completed", 1),
        marker("workflow_status", "running", 2),
        marker("approval", "waiting_approval", 3),
        marker("command", "running", 4, "new"),
        marker("workflow_status", "failed", 5, "failed"),
      ],
      nodes,
      viewport,
    });

    expect(layout.layoutMode).toBe("readable");
    expect(layout.items.map((item) => [item.type, item.label, item.rank])).toEqual([
      ["marker", "workflow_status failed", 0],
      ["marker", "approval waiting_appr...", 1],
      ["marker", "command running", 2],
      ["marker", "file_change completed", 3],
      ["collapsed", "+2", 4],
    ]);
    expect(layout.items.at(-1)).toMatchObject({
      hiddenCount: 2,
      id: "workspace-activity:collapsed:work",
      nodeId: "work",
    });
  });

  test("uses compact chip representation below the readable text zoom threshold", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 10, 20)];
    const viewport = fakeViewport(0.5);
    updateWorkspaceActivityMarkerGraphics({
      markerGraphics,
      markerLayer,
      markers: [marker("command", "running")],
      nodes,
      viewport,
    });

    expect(workspaceActivityChipDebugSnapshot(markerGraphics, viewport)).toMatchObject([
      {
        id: "marker_command",
        label: "command running",
        layoutMode: "compact",
        textVisible: false,
        width: 28,
      },
    ]);
  });

  test("flips chips left when right placement would clip the viewport", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 260, 20)];
    const viewport = fakeViewport(1, { screenHeight: 240, screenWidth: 520 });
    updateWorkspaceActivityMarkerGraphics({
      markerGraphics,
      markerLayer,
      markers: [marker("command", "running")],
      nodes,
      viewport,
    });

    const [chip] = workspaceActivityChipDebugSnapshot(markerGraphics, viewport);
    expect(chip).toMatchObject({
      placement: "left",
      screenBounds: {
        bottom: 49,
        left: 92,
        right: 248,
        top: 27,
      },
      screenLeft: 92,
      screenRight: 248,
    });
    expect(markerGraphics.get("marker_command").container.x).toBe(92);
  });

  test("reports missing anchors and global cap overflow without creating unbounded chip views", () => {
    const nodes = [node("work", 10, 20)];
    const viewport = fakeViewport(1);
    const layout = workspaceActivityChipLayout({
      config: {
        chipGap: 5,
        chipHeight: 22,
        chipWidth: 156,
        collapsedChipWidth: 58,
        compactChipWidth: 28,
        compactCollapsedChipWidth: 58,
        fontSize: 10,
        labelMaxLength: 24,
        maxVisibleChipsPerNode: 4,
        maxVisibleChipViews: 3,
        nodeGap: 12,
        readableTextZoomThreshold: 0.72,
        topInset: 7,
        viewportPadding: 12,
      },
      markers: [
        marker("command", "running", 0, "a"),
        marker("file_change", "completed", 1),
        marker("approval", "waiting_approval", 2),
        marker("workflow_status", "running", 3),
        { ...marker("command", "completed", 4, "missing"), nodeId: "missing" },
      ],
      nodes,
      viewport,
    });

    expect(layout.items).toHaveLength(3);
    expect(layout.globalOverflowCount).toBe(2);
    expect(layout.missingAnchorCount).toBe(1);
    expect(layout.items.at(-1)).toMatchObject({
      hiddenCount: 2,
      id: "workspace-activity:collapsed:global:work",
      label: "+2",
      type: "collapsed",
    });
  });
});

function node(id, x, y) {
  return {
    height: 82,
    id,
    width: 168,
    x,
    y,
  };
}

function marker(kind, status, slotIndex = 0, idSuffix = kind) {
  return {
    activityId: `activity_${idSuffix}`,
    active: status === "running" || status === "waiting_approval",
    anchorKind: "workflow_node",
    id: `marker_${idSuffix}`,
    kind,
    label: `${kind} ${status}`,
    laneIndex: -1,
    nodeId: "work",
    revision: status === "running" ? 3 + slotIndex : 2 + slotIndex,
    slotIndex,
    status,
    updatedAt: `2026-06-21T12:0${slotIndex}:00Z`,
  };
}

function fakeViewport(zoom, { screenHeight = undefined, screenWidth = undefined } = {}) {
  return {
    screenHeight,
    screenWidth,
    scaled: zoom,
    toScreen: (x, y) => ({ x: x * zoom, y: y * zoom }),
  };
}
