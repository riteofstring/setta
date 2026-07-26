import {
  evidenceClassValues,
  semanticEdgeKindValues,
  semanticNodeKindValues,
  semanticNodeStatusValues,
} from "@generated/backend";
import { describe, expect, it } from "vitest";

import { projectionGalleryFixtures } from "./projection-gallery-fixtures";
import { packSemanticGraphComposition } from "./semantic-graph-packer";
import { packedValueAt } from "./packed-graph-vocabulary";

function semanticNodes() {
  return projectionGalleryFixtures.flatMap((fixture) =>
    fixture.graphs.flatMap((graph) => graph.nodes),
  );
}

function semanticEdges() {
  return projectionGalleryFixtures.flatMap((fixture) =>
    fixture.graphs.flatMap((graph) => graph.edges),
  );
}

describe("semantic graph gallery fixtures", () => {
  it("are generated from projected workstream graphs", () => {
    expect(projectionGalleryFixtures.length).toBeGreaterThan(0);
    for (const fixture of projectionGalleryFixtures) {
      expect(fixture.graphs.length).toBeGreaterThan(0);
      expect(fixture.graphs.some((graph) => graph.nodes.length > 0)).toBe(true);
    }
  });

  it("cover every generated semantic node, edge, status, and evidence value", () => {
    const nodeKinds = new Set(semanticNodes().map((node) => node.kind));
    const nodeStatuses = new Set(semanticNodes().map((node) => node.status));
    const evidenceClasses = new Set(semanticNodes().map((node) => node.evidenceClass));
    const edgeKinds = new Set(semanticEdges().map((edge) => edge.kind));

    expect(semanticNodeKindValues.filter((value) => !nodeKinds.has(value))).toEqual([]);
    expect(semanticNodeStatusValues.filter((value) => !nodeStatuses.has(value))).toEqual([]);
    expect(evidenceClassValues.filter((value) => !evidenceClasses.has(value))).toEqual([]);
    expect(semanticEdgeKindValues.filter((value) => !edgeKinds.has(value))).toEqual([]);
  });
});

describe("semantic graph packer", () => {
  it.each(projectionGalleryFixtures)("packs $name into a drawable snapshot", (fixture) => {
    const snapshot = packSemanticGraphComposition({
      workstreamId: fixture.name,
      graphs: fixture.graphs,
    });
    const semanticNodeCount = fixture.graphs.reduce(
      (count, graph) => count + graph.nodes.length,
      0,
    );
    const semanticEdgeCount = fixture.graphs.reduce(
      (count, graph) => count + graph.edges.length,
      0,
    );

    expect(snapshot.nodeCount).toBe(semanticNodeCount);
    expect(snapshot.edgeCount).toBe(semanticEdgeCount);
    expect(snapshot.turnCount).toBeGreaterThan(0);
    expect(snapshot.cursorSequence).toBe(snapshot.nodeCount + snapshot.edgeCount);
  });

  it("draws cross-workstream delegation inside the gallery composition", () => {
    const fixture = projectionGalleryFixtures.find((candidate) => candidate.name === "delegation");
    expect(fixture).toBeDefined();
    if (fixture === undefined) {
      return;
    }
    const snapshot = packSemanticGraphComposition({
      workstreamId: fixture.name,
      graphs: fixture.graphs,
    });
    const delegatedEdges = fixture.graphs.flatMap((graph) =>
      graph.edges.filter((edge) => edge.kind === "delegated_to"),
    );
    expect(delegatedEdges.length).toBeGreaterThan(0);
    expect(snapshot.edgeCount).toBeGreaterThanOrEqual(delegatedEdges.length);

    const branchEdges = Array.from({ length: snapshot.edgeCount }, (_unused, index) =>
      packedValueAt(snapshot.edges.channel, index),
    ).filter((channel) => channel === 1);
    expect(branchEdges.length).toBeGreaterThan(0);
  });
});
