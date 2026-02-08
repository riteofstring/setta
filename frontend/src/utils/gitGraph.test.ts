import { describe, expect, it } from "vitest";
import { computeGitGraphRows } from "./gitGraph";

function commit(hash: string, parents: string[]) {
  return {
    hash,
    parents,
    authorName: "A",
    authorEmail: "a@example.com",
    authorTimeMs: 0,
    subject: hash,
    decorations: [],
  };
}

describe("computeGitGraphRows", () => {
  it("assigns a single lane for linear history", () => {
    const commits = [commit("C", ["B"]), commit("B", ["A"]), commit("A", [])];
    const rows = computeGitGraphRows(commits);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.laneIndex)).toEqual([0, 0, 0]);
    expect(rows.every((r) => r.laneColorIds.length === 1)).toBe(true);
  });

  it("introduces a lane for merge parents and collapses converged lanes", () => {
    const commits = [
      commit("M", ["B", "D"]),
      commit("D", ["C"]),
      commit("C", ["A"]),
      commit("B", ["A"]),
      commit("A", []),
    ];
    const rows = computeGitGraphRows(commits);
    expect(rows).toHaveLength(5);

    // Merge commit introduces 2 lanes and draws a connector to the second parent lane.
    expect(rows[0]!.laneColorIds.length).toBe(2);
    expect(rows[0]!.mergeToLaneIndices).toEqual([1]);

    // After history converges back to A, lane count should collapse back down.
    expect(rows[rows.length - 1]!.laneColorIds.length).toBe(1);
  });
});
