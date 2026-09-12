import { describe, expect, it } from "vitest";

import { makeBenchProject } from "../testSnapshot";
import { projectBenchGraph, pruneBenchSelectedEdgeIds } from "./benchGraph";

describe("Bench graph projection", () => {
  it("derives read-only case and evaluator relationships from authored ids", () => {
    const project = makeBenchProject();
    const graph = projectBenchGraph(project);

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
    expect(graph.ports.every((port) => port.disabled)).toBe(true);
  });

  it("removes graph chrome outside Build and reconciles edge selection", () => {
    const project = makeBenchProject();
    const graph = projectBenchGraph(project);
    const selected = new Set([graph.edges[0]!.id, "stale-edge"]);

    expect(projectBenchGraph(project, false)).toEqual({ edges: [], ports: [] });
    expect([...pruneBenchSelectedEdgeIds(selected, graph.edges)]).toEqual([
      graph.edges[0]!.id,
    ]);
  });
});
