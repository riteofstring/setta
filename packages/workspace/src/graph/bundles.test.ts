import { describe, expect, it } from "vitest";
import {
  getWorkspaceGraphBundledPath,
  getWorkspaceGraphBundles,
} from "./bundles.js";
import { getWorkspaceGraphBezier } from "./geometry.js";
import type { WorkspaceGraphEdge } from "./types.js";

const ports = new Map([
  ["out", { point: { x: 0, y: 100 }, side: "right" as const }],
  ["up", { point: { x: 400, y: 0 }, side: "left" as const }],
  ["down", { point: { x: 400, y: 300 }, side: "left" as const }],
  ["solo", { point: { x: 0, y: 500 }, side: "right" as const }],
  ["far", { point: { x: 300, y: 500 }, side: "left" as const }],
  ["near", { point: { x: 40, y: 110 }, side: "left" as const }],
]);

function edge(id: string, source: string, target: string, hidden = false) {
  return {
    family: "notes",
    hidden,
    id,
    source: { portId: source, sectionId: source },
    target: { portId: target, sectionId: target },
  } as WorkspaceGraphEdge;
}

describe("Workspace graph cable bundles", () => {
  it("ties cables leaving one port into ordered parallel lanes", () => {
    const bundles = getWorkspaceGraphBundles(
      [
        edge("b", "out", "down"),
        edge("a", "out", "up"),
        edge("c", "solo", "far"),
      ],
      ports,
    );
    expect(bundles.edges.get("a")?.source?.offset).toBe(-2);
    expect(bundles.edges.get("b")?.source?.offset).toBe(2);
    expect(bundles.edges.get("a")?.target).toBeUndefined();
    expect(bundles.edges.has("c")).toBe(false);
    expect(bundles.ties).toHaveLength(2);
    for (const tie of bundles.ties) {
      expect(tie.x).toBeGreaterThan(10);
      expect(tie.top).toBeLessThan(98);
      expect(tie.bottom).toBeGreaterThan(102);
      expect(tie.direction).toBe(1);
    }
  });

  it("leaves hidden and short cables out of a bundle", () => {
    const bundles = getWorkspaceGraphBundles(
      [
        edge("a", "out", "up"),
        edge("b", "out", "down", true),
        edge("c", "out", "near"),
      ],
      ports,
    );
    expect(bundles.edges.size).toBe(0);
    expect(bundles.ties).toHaveLength(0);
  });

  it("starts a bundled cable at its port and runs it along its lane", () => {
    const source = ports.get("out")!;
    const target = ports.get("up")!;
    const bundled = getWorkspaceGraphBundledPath(source, target, {
      source: { offset: -2, run: 60 },
    });
    expect(bundled.path.startsWith("M0,100 L10,98 L60,98 C")).toBe(true);
    const plain = getWorkspaceGraphBundledPath(source, target, undefined);
    expect(plain).toEqual(
      getWorkspaceGraphBezier(source.point, "right", target.point, "left"),
    );
  });

  it("gathers cables arriving at one port into its lanes", () => {
    const bundles = getWorkspaceGraphBundles(
      [edge("a", "out", "far"), edge("b", "solo", "far")],
      ports,
    );
    const lane = bundles.edges.get("a")?.target;
    expect(lane?.offset).toBe(-2);
    const path = getWorkspaceGraphBundledPath(
      ports.get("out")!,
      ports.get("far")!,
      bundles.edges.get("a"),
    ).path;
    expect(path.endsWith(`L290,498 L300,500`)).toBe(true);
    expect(bundles.ties.every((tie) => tie.direction === -1)).toBe(true);
  });
});
