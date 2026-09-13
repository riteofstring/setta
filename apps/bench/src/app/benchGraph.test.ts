import { describe, expect, it } from "vitest";

import { makeBenchSnapshot } from "../testSnapshot";
import { projectBenchGraph, pruneBenchSelectedEdgeIds } from "./benchGraph";

describe("Bench graph projection", () => {
  it("derives read-only case and evaluator relationships from authored ids", () => {
    const snapshot = makeBenchSnapshot();
    const graph = projectBenchGraph(snapshot);

    expect(graph.ports).toHaveLength(7);
    expect(graph.edges).toHaveLength(4);
    expect(
      graph.edges.map((edge) => [edge.source.sectionId, edge.target.sectionId]),
    ).toEqual([
      ["catalog-images", "contain"],
      ["contain", "thumbnail-quality"],
      ["catalog-images", "cover"],
      ["cover", "thumbnail-quality"],
    ]);
    expect(graph.edges.map((edge) => edge.label)).toEqual([
      "1 input",
      "1 result",
      "1 input",
      "1 result",
    ]);
    expect(graph.ports.every((port) => port.disabled)).toBe(true);
  });

  it("removes graph chrome outside Build and reconciles edge selection", () => {
    const snapshot = makeBenchSnapshot();
    const graph = projectBenchGraph(snapshot);
    const selected = new Set([graph.edges[0]!.id, "stale-edge"]);

    expect(projectBenchGraph(snapshot, false)).toEqual({
      edges: [],
      ports: [],
    });
    expect([...pruneBenchSelectedEdgeIds(selected, graph.edges)]).toEqual([
      graph.edges[0]!.id,
    ]);
  });
});
