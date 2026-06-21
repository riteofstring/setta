import { Container } from "pixi.js";
import { describe, expect, test } from "vitest";

import {
  syncWorkspaceActivityMarkerGraphicPositions,
  updateWorkspaceActivityMarkerGraphics,
} from "./pixi-renderer-activity-markers";

describe("workflow graph activity marker graphics", () => {
  test("materializes activity marker graphics in place with stable counts", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 10, 20)];

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("command", "running")],
        nodes,
      }),
    ).toEqual({ created: 1, removed: 0, retained: 0, updated: 0 });
    const firstGraphic = markerGraphics.get("marker_command").graphics;
    expect(markerLayer.children).toHaveLength(1);
    expect(firstGraphic.x).toBe(24);
    expect(firstGraphic.y).toBe(7);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("command", "completed")],
        nodes,
      }),
    ).toEqual({ created: 0, removed: 0, retained: 0, updated: 1 });
    expect(markerGraphics.get("marker_command").graphics).toBe(firstGraphic);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("command", "completed"), marker("approval", "waiting_approval", 1)],
        nodes,
      }),
    ).toEqual({ created: 1, removed: 0, retained: 1, updated: 0 });
    expect(markerLayer.children).toHaveLength(2);

    expect(
      updateWorkspaceActivityMarkerGraphics({
        markerGraphics,
        markerLayer,
        markers: [marker("approval", "waiting_approval", 1)],
        nodes,
      }),
    ).toEqual({ created: 0, removed: 1, retained: 1, updated: 0 });
    expect(markerLayer.children).toHaveLength(1);
  });

  test("keeps node-anchored markers positioned when graph nodes move", () => {
    const markerLayer = new Container();
    const markerGraphics = new Map();
    const nodes = [node("work", 10, 20)];
    updateWorkspaceActivityMarkerGraphics({
      markerGraphics,
      markerLayer,
      markers: [marker("command", "running")],
      nodes,
    });
    const graphics = markerGraphics.get("marker_command").graphics;

    nodes[0].x = 42;
    nodes[0].y = 64;
    syncWorkspaceActivityMarkerGraphicPositions({ markerGraphics, nodes });

    expect(graphics.x).toBe(56);
    expect(graphics.y).toBe(51);
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

function marker(kind, status, slotIndex = 0) {
  return {
    activityId: `activity_${kind}`,
    active: status === "running" || status === "waiting_approval",
    anchorKind: "workflow_node",
    id: `marker_${kind}`,
    kind,
    label: `${kind} ${status}`,
    laneIndex: -1,
    nodeId: "work",
    revision: status === "running" ? 1 : 2,
    slotIndex,
    status,
    updatedAt: "2026-06-21T12:00:00Z",
  };
}
