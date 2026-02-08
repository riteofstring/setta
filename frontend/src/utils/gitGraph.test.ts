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
    expect(rows[0]!.laneStartIndices).toEqual([0]);
    expect(rows[1]!.laneStartIndices).toEqual([]);
    expect(rows[2]!.laneStartIndices).toEqual([]);
    expect(rows[0]!.laneEndIndices).toEqual([]);
    expect(rows[1]!.laneEndIndices).toEqual([]);
    expect(rows[2]!.laneEndIndices).toEqual([0]);
    expect(rows.every((r) => r.joinFromLaneIndices.length === 0)).toBe(true);
    expect(rows.every((r) => r.mergeToLaneIndices.length === 0)).toBe(true);
  });

  it("introduces a lane for merge parents and records joins when history reconverges", () => {
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
    expect(rows[0]!.laneStartIndices.sort()).toEqual([0, 1]);
    expect(rows[0]!.mergeToLaneIndices).toEqual([1]);

    // When history converges back to A, the converging lane should be recorded.
    const aRow = rows.find((r) => r.commit.hash === "A");
    expect(aRow).not.toBeNull();
    expect(aRow!.laneColorIds.length).toBe(2);
    expect(aRow!.joinFromLaneIndices).toEqual([1]);
    expect(aRow!.laneEndIndices.sort()).toEqual([0, 1]);
  });

  it("records lane joins when multiple lanes converge on a shared parent commit", () => {
    const commits = [
      commit("C2", ["B"]),
      commit("C1", ["B"]),
      commit("B", ["A"]),
      commit("A", []),
    ];
    const rows = computeGitGraphRows(commits);
    expect(rows).toHaveLength(4);

    const bRow = rows.find((r) => r.commit.hash === "B");
    expect(bRow).not.toBeNull();
    expect(bRow!.laneColorIds.length).toBe(2);
    expect(bRow!.joinFromLaneIndices).toEqual([1]);
    expect(bRow!.laneEndIndices).toEqual([1]);
  });
});
