import { Container, Graphics } from "pixi.js";
import { describe, expect, test } from "vitest";

import { initialEdges, initialNodes } from "./pixi-renderer-fixture";
import { createWorkspaceEdgeLabelManager } from "./pixi-renderer-edge-labels";
import {
  edgeGraphicsInvalidationForGraphUpdate,
  edgeGraphicsRedrawRequired,
  redrawWorkspaceEdges,
} from "./pixi-renderer-edge-rendering";

describe("workflow graph edge rendering", () => {
  test("retains unchanged edge labels when shared edge graphics redraw is skipped", () => {
    const renderer = edgeRenderer();
    const edges = labeledEdges();

    const initial = renderer.redraw({ edges, redrawGraphics: true });
    expect(initial.graphics).toMatchObject({ redrawn: true, rematerialized: 3 });
    expect(initial.labels).toMatchObject({ added: 3, rematerialized: 0 });
    const firstLabel = renderer.edgeLabels.labels().get("source-reason").label;

    const safeUpdate = renderer.redraw({
      edges: edges.map((edge) => ({ ...edge })),
      redrawGraphics: false,
    });

    expect(safeUpdate.graphics).toMatchObject({
      redrawn: false,
      rematerialized: 0,
      skipped: true,
    });
    expect(safeUpdate.labels).toMatchObject({
      added: 0,
      rematerialized: 0,
      removed: 0,
      retained: 3,
      updated: 0,
    });
    expect(renderer.edgeLabels.labels().get("source-reason").label).toBe(firstLabel);
  });

  test("updates edge label text in place without rematerializing the label object", () => {
    const renderer = edgeRenderer();
    const edges = labeledEdges();
    renderer.redraw({ edges, redrawGraphics: true });
    const firstLabel = renderer.edgeLabels.labels().get("reason-output").label;

    const updated = renderer.redraw({
      edges: edges.map((edge) =>
        edge.id === "reason-output" ? { ...edge, label: "updated label" } : { ...edge },
      ),
      redrawGraphics: false,
    });

    expect(updated.labels).toMatchObject({
      added: 0,
      rematerialized: 0,
      removed: 0,
      retained: 2,
      updated: 1,
    });
    expect(renderer.edgeLabels.labels().get("reason-output").label).toBe(firstLabel);
    expect(firstLabel.text).toBe("updated label");
  });

  test("skips shared edge graphics redraw when only node content or edge labels change", () => {
    const previousNodes = workflowNodes();
    const previousEdges = labeledEdges();
    const nextNodes = previousNodes.map((node) =>
      node.id === "reason" ? { ...node, label: "Updated Reason" } : { ...node },
    );
    const nextEdges = previousEdges.map((edge) =>
      edge.id === "reason-output" ? { ...edge, label: "updated label" } : { ...edge },
    );

    const invalidation = edgeGraphicsInvalidationForGraphUpdate(
      previousNodes,
      previousEdges,
      nextNodes,
      nextEdges,
    );

    expect(invalidation).toMatchObject({
      edgeAddCount: 0,
      edgeEndpointUpdateCount: 0,
      edgeOrderUpdateCount: 0,
      edgeRemoveCount: 0,
      edgeRetainCount: 3,
      edgeStyleUpdateCount: 0,
      edgeTopologyUpdateCount: 0,
      edgeUpdateCount: 0,
    });
    expect(edgeGraphicsRedrawRequired(invalidation)).toBe(false);
  });

  test("redraws shared edge graphics when an endpoint moves", () => {
    const previousNodes = workflowNodes();
    const nextNodes = workflowNodes().map((node) =>
      node.id === "reason" ? { ...node, x: node.x + 24 } : node,
    );
    const edges = labeledEdges();

    const invalidation = edgeGraphicsInvalidationForGraphUpdate(
      previousNodes,
      edges,
      nextNodes,
      edges,
    );

    expect(invalidation.edgeEndpointUpdateCount).toBeGreaterThan(0);
    expect(edgeGraphicsRedrawRequired(invalidation)).toBe(true);
  });

  test("redraws shared edge graphics when a typed edge status changes", () => {
    const nodes = workflowNodes();
    const previousEdges = labeledEdges().map((edge) => ({ ...edge, status: "inactive" }));
    const nextEdges = previousEdges.map((edge) =>
      edge.id === "reason-output" ? { ...edge, status: "active" } : { ...edge },
    );

    const invalidation = edgeGraphicsInvalidationForGraphUpdate(
      nodes,
      previousEdges,
      nodes,
      nextEdges,
    );

    expect(invalidation).toMatchObject({
      edgeAddCount: 0,
      edgeEndpointUpdateCount: 0,
      edgeOrderUpdateCount: 0,
      edgeRemoveCount: 0,
      edgeRetainCount: 2,
      edgeStyleUpdateCount: 1,
      edgeTopologyUpdateCount: 0,
      edgeUpdateCount: 1,
    });
    expect(edgeGraphicsRedrawRequired(invalidation)).toBe(true);
  });

  test("redraws shared edge graphics when retained edges change draw order", () => {
    const nodes = workflowNodes();
    const previousEdges = labeledEdges();
    const nextEdges = [previousEdges[1], previousEdges[0], previousEdges[2]].map((edge) => ({
      ...edge,
    }));

    const invalidation = edgeGraphicsInvalidationForGraphUpdate(
      nodes,
      previousEdges,
      nodes,
      nextEdges,
    );

    expect(invalidation).toMatchObject({
      edgeAddCount: 0,
      edgeEndpointUpdateCount: 0,
      edgeOrderUpdateCount: 2,
      edgeRemoveCount: 0,
      edgeRetainCount: 3,
      edgeStyleUpdateCount: 0,
      edgeTopologyUpdateCount: 0,
      edgeUpdateCount: 0,
    });
    expect(edgeGraphicsRedrawRequired(invalidation)).toBe(true);
  });
});

function edgeRenderer() {
  const edgeLabelLayer = new Container();
  const edgeLabels = createWorkspaceEdgeLabelManager({
    edgeLabelLayer,
    fontFamily: "Arial",
    fontSize: 16,
    validateGlyphs: () => {},
  });
  const nodes = workflowNodes();
  return {
    edgeLabels,
    redraw: ({ edges, redrawGraphics }) =>
      redrawWorkspaceEdges({
        edgeGraphics: new Graphics(),
        edgeLabels,
        edges,
        getNode: (nodeId) => nodes.find((node) => node.id === nodeId),
        redrawGraphics,
      }),
  };
}

function workflowNodes() {
  return initialNodes.map((node) => ({ ...node }));
}

function labeledEdges() {
  return initialEdges.map((edge, index) => ({
    ...edge,
    label: `edge ${index + 1}`,
  }));
}
