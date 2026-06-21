import { describe, expect, test } from "vitest";

import { mergeWorkflowGraphSceneNodeForUpdate } from "./pixi-renderer-scene-graph";

describe("workflow graph scene graph updates", () => {
  test("merge updates visual fields without clobbering preserved local coordinates", () => {
    const existing = node({ id: "work", label: "Work", status: "running", x: 120, y: 80 });
    const next = node({
      diagnostic: { codes: ["workflow.validation"], count: 1, severity: "warning" },
      id: "work",
      label: "Work updated",
      status: "completed",
      x: 0,
      y: 0,
    });

    const result = mergeWorkflowGraphSceneNodeForUpdate(existing, next, {
      preservedNodePositions: new Map([["work", { x: 240, y: 160 }]]),
    });

    expect(result).toBe(existing);
    expect(result).toMatchObject({
      diagnostic: { codes: ["workflow.validation"], count: 1, severity: "warning" },
      label: "Work updated",
      status: "completed",
      x: 240,
      y: 160,
    });
  });

  test("merge uses incoming coordinates when no local position is preserved", () => {
    const existing = node({ id: "work", label: "Work", x: 120, y: 80 });
    const next = node({ id: "work", label: "Work", x: 32, y: -16 });

    mergeWorkflowGraphSceneNodeForUpdate(existing, next);

    expect(existing).toMatchObject({ x: 32, y: -16 });
  });
});

function node(overrides = {}) {
  return {
    color: 0x67e8f9,
    diagnostic: null,
    height: 88,
    id: "node",
    label: "Node",
    layer: "workflow",
    movementOwner: { kind: "workflow_definition_layout" },
    status: "not_started",
    width: 180,
    x: 0,
    y: 0,
    ...overrides,
  };
}
