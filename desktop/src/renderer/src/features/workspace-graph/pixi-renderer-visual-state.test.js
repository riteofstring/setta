import { describe, expect, test } from "vitest";

import {
  highestPriorityVisualState,
  resolveWorkflowEdgeVisualState,
  resolveWorkflowNodeVisualState,
  resolveWorkspaceActivityMarkerVisualState,
  visualStatePriorityRank,
  workflowEdgeRuntimeVisualState,
  workflowNodeRuntimeVisualState,
  workflowVisualStatePriority,
  workspaceActivityRuntimeVisualState,
} from "./pixi-renderer-visual-state";

describe("workflow graph visual state resolver", () => {
  test("defines the runtime priority order explicitly", () => {
    expect(workflowVisualStatePriority).toEqual([
      "failed",
      "cancelled",
      "waiting_approval",
      "running",
      "completed",
      "pending",
      "idle",
    ]);
    expect(visualStatePriorityRank("failed")).toBeLessThan(
      visualStatePriorityRank("waiting_approval"),
    );
    expect(
      highestPriorityVisualState(["completed", "running", "waiting_approval", "pending"]),
    ).toBe("waiting_approval");
  });

  test("maps workflow node statuses to resolved runtime states", () => {
    expect(workflowNodeRuntimeVisualState("failed")).toBe("failed");
    expect(workflowNodeRuntimeVisualState("recovery_required")).toBe("failed");
    expect(workflowNodeRuntimeVisualState("cancelled")).toBe("cancelled");
    expect(workflowNodeRuntimeVisualState("waiting_approval")).toBe("waiting_approval");
    expect(workflowNodeRuntimeVisualState("running")).toBe("running");
    expect(workflowNodeRuntimeVisualState("succeeded")).toBe("completed");
    expect(workflowNodeRuntimeVisualState("ready")).toBe("pending");
    expect(workflowNodeRuntimeVisualState("pending")).toBe("pending");
    expect(workflowNodeRuntimeVisualState("not_started")).toBe("idle");
  });

  test("maps workflow edge statuses to resolved runtime states", () => {
    expect(workflowEdgeRuntimeVisualState("active")).toBe("running");
    expect(workflowEdgeRuntimeVisualState("completed")).toBe("completed");
    expect(workflowEdgeRuntimeVisualState("cancelled")).toBe("cancelled");
    expect(workflowEdgeRuntimeVisualState("inactive")).toBe("idle");
  });

  test("maps activity marker statuses to resolved runtime states", () => {
    expect(workspaceActivityRuntimeVisualState("failed")).toBe("failed");
    expect(workspaceActivityRuntimeVisualState("denied")).toBe("failed");
    expect(workspaceActivityRuntimeVisualState("cancelled")).toBe("cancelled");
    expect(workspaceActivityRuntimeVisualState("waiting_approval")).toBe("waiting_approval");
    expect(workspaceActivityRuntimeVisualState("running")).toBe("running");
    expect(workspaceActivityRuntimeVisualState("approved")).toBe("completed");
    expect(workspaceActivityRuntimeVisualState("answered")).toBe("completed");
    expect(workspaceActivityRuntimeVisualState("completed")).toBe("completed");
    expect(workspaceActivityRuntimeVisualState("pending")).toBe("pending");
    expect(workspaceActivityRuntimeVisualState("unknown")).toBe("idle");
  });

  test("returns stable visual channel tokens for nodes, edges, and markers", () => {
    const nodeVisual = resolveWorkflowNodeVisualState({
      color: 0x14b8a6,
      height: 82,
      id: "work",
      label: "Work",
      status: "waiting_approval",
      width: 168,
      x: 0,
      y: 0,
    });
    const edgeVisual = resolveWorkflowEdgeVisualState({
      id: "work_end",
      sourceNodeId: "work",
      sourcePortId: "output",
      status: "active",
      targetNodeId: "end",
      targetPortId: "input",
    });
    const markerVisual = resolveWorkspaceActivityMarkerVisualState({
      activityId: "approval",
      active: true,
      anchorKind: "workflow_node",
      id: "marker",
      kind: "approval",
      label: "Approval waiting_approval",
      laneIndex: -1,
      nodeId: "work",
      revision: 1,
      slotIndex: 0,
      status: "waiting_approval",
      updatedAt: "2026-06-22T12:00:00Z",
    });

    expect(nodeVisual).toMatchObject({
      channels: {
        bodyFill: 0x14b8a6,
        bodyStroke: 0xfbbf24,
        statusAccent: 0xf59e0b,
      },
      sourceStatus: "waiting_approval",
      state: "waiting_approval",
    });
    expect(edgeVisual).toMatchObject({
      channels: {
        stroke: 0x67e8f9,
      },
      sourceStatus: "active",
      state: "running",
    });
    expect(markerVisual).toMatchObject({
      channels: {
        fill: 0xf59e0b,
        kindShape: "approval",
        stroke: 0xf59e0b,
      },
      sourceStatus: "waiting_approval",
      state: "waiting_approval",
    });
  });
});
