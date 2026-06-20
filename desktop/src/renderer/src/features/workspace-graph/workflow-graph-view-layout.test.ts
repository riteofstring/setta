import { describe, expect, test } from "vitest";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import {
  workflowGraphViewLayoutTargetForProjection,
  workflowRendererGraphWithViewLayoutPositions,
  workflowViewLayoutPositionsForGraph,
} from "./workflow-graph-view-layout";
import { rendererGraphFromWorkflowProjection } from "./workflow-graph-projection";
import { testWorkflowGraphProjection } from "./workflow-graph-view-layout.testdata";

describe("workflow graph view layout", () => {
  test("builds explicit view-layout targets for non-editable version and run projections", () => {
    expect(
      workflowGraphViewLayoutTargetForProjection({
        ...testWorkflowGraphProjection(),
        editable: false,
        executionId: "",
        viewMode: "version",
      }),
    ).toEqual({
      definitionVersion: {
        definitionId: "definition_review",
        versionId: "version_review",
      },
      kind: "definition_version",
      workflowExecution: null,
    });

    expect(workflowGraphViewLayoutTargetForProjection(testWorkflowGraphProjection())).toEqual({
      definitionVersion: null,
      kind: "workflow_execution",
      workflowExecution: {
        definitionId: "definition_review",
        executionId: "execution_review",
        versionId: "version_review",
      },
    });
  });

  test("does not build a view-layout target for editable draft projections", () => {
    expect(
      workflowGraphViewLayoutTargetForProjection({
        ...testWorkflowGraphProjection(),
        definitionVersionId: "",
        editable: true,
        executionId: "",
        viewMode: "draft",
      }),
    ).toBeNull();
  });

  test("composes view-layout positions only onto workflow view-layout nodes", () => {
    const graph = graphWithSemanticNode(
      rendererGraphFromWorkflowProjection(testWorkflowGraphProjection()),
    );

    const composed = workflowRendererGraphWithViewLayoutPositions(graph, [
      { nodeId: "work", x: 120, y: 240 },
      { nodeId: "semantic:committed", x: 999, y: 999 },
    ]);

    expect(composed?.nodes.map((node) => [node.id, node.x, node.y])).toEqual([
      ["start", -270, 0],
      ["work", 120, 240],
      ["end", 270, 0],
      ["semantic:committed", 800, 0],
    ]);
  });

  test("extracts pending view-layout positions only for moved view-layout nodes", () => {
    const graph = graphWithSemanticNode(
      rendererGraphFromWorkflowProjection(testWorkflowGraphProjection()),
    );

    expect(
      workflowViewLayoutPositionsForGraph({
        graph,
        positions: [
          { moved: false, nodeId: "start", x: -300, y: 0 },
          { moved: true, nodeId: "work", x: 120.4, y: 240.6 },
          { moved: true, nodeId: "semantic:committed", x: 900, y: 0 },
        ],
        saveSequence: 7,
      }),
    ).toEqual([{ moved: true, nodeId: "work", saveSequence: 7, x: 120, y: 241 }]);
  });
});

function graphWithSemanticNode(graph: WorkflowGraphGraph): WorkflowGraphGraph {
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        color: 0xffa500,
        connectable: false,
        height: 68,
        id: "semantic:committed",
        layer: "semantic",
        label: "Committed",
        movementOwner: { kind: "semantic_layout" },
        width: 68,
        x: 800,
        y: 0,
      },
    ],
  };
}
