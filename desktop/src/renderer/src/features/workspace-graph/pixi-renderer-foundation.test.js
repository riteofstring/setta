import { describe, expect, test } from "vitest";

import { foundationStyleForGraph } from "./pixi-renderer-foundation";
import { workspaceNeonTheme } from "./workspace-neon-theme";

describe("workspace graph foundation style", () => {
  test("does not switch foundation merely because semantic nodes are present", () => {
    const graph = {
      edges: [],
      nodes: [semanticNode("semantic:first"), workflowNode("workflow_idle", "not_started")],
    };

    expect(foundationStyleForGraph(graph)).toBe(workspaceNeonTheme.foundation.workflowOnly);
  });

  test("uses active workflow state as the foundation signal even with semantic nodes", () => {
    const graph = {
      edges: [{ id: "edge_active", layer: "workflow", status: "active" }],
      nodes: [semanticNode("semantic:first"), workflowNode("workflow_running", "running")],
    };

    expect(foundationStyleForGraph(graph)).toBe(workspaceNeonTheme.foundation.workflowActive);
  });
});

function semanticNode(id) {
  return {
    id,
    layer: "semantic",
  };
}

function workflowNode(id, status) {
  return {
    id,
    layer: "workflow",
    status,
  };
}
