import { describe, expect, it } from "vitest";
import {
  appendGitGraphRows,
  computeGitGraphRowsWithState,
  createEmptyGitGraphRowComputationState,
} from "./gitGraph";

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

function computeRows(commits: ReturnType<typeof commit>[]) {
  return computeGitGraphRowsWithState(commits).rows;
}

describe("computeGitGraphRows", () => {
  it("assigns a single lane for linear history", () => {
    const commits = [commit("C", ["B"]), commit("B", ["A"]), commit("A", [])];
    const rows = computeRows(commits);
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
    const rows = computeRows(commits);
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
    const rows = computeRows(commits);
    expect(rows).toHaveLength(4);

    const bRow = rows.find((r) => r.commit.hash === "B");
    expect(bRow).not.toBeNull();
    expect(bRow!.laneColorIds.length).toBe(2);
    expect(bRow!.joinFromLaneIndices).toEqual([1]);
    expect(bRow!.laneEndIndices).toEqual([1]);
  });

  it("keeps stable lane indices when lanes converge (no shifting of later lanes)", () => {
    const commits = [
      commit("graph-test C2", ["graph-test B"]),
      commit("graph-test C1", ["graph-test B"]),
      commit("graph-test D1", ["graph-test A"]),
      commit("graph-test B", ["graph-test A"]),
      commit("graph-test A", []),
    ];
    const rows = computeRows(commits);
    expect(rows).toHaveLength(5);

    const bRow = rows.find((r) => r.commit.subject === "graph-test B");
    expect(bRow).not.toBeNull();
    expect(bRow!.laneColorIds.length).toBe(3);
    const rightmostColorId = bRow!.laneColorIds[2]!;
    expect(rightmostColorId).toBeGreaterThanOrEqual(0);

    const aRow = rows.find((r) => r.commit.subject === "graph-test A");
    expect(aRow).not.toBeNull();
    // The middle lane (C1/C2) should end at B; the rightmost lane (D1->A)
    // should not shift left when that middle lane is removed.
    expect(aRow!.laneColorIds.length).toBe(3);
    expect(aRow!.laneColorIds[1]).toBe(-1);
    expect(aRow!.laneColorIds[2]).toBe(rightmostColorId);
  });

  it("supports append-only row computation across paginated commit batches", () => {
    const commits = [
      commit("M", ["B", "D"]),
      commit("D", ["C"]),
      commit("C", ["A"]),
      commit("B", ["A"]),
      commit("A", []),
    ];
    const firstBatch = commits.slice(0, 2);
    const secondBatch = commits.slice(2);

    const firstResult = computeGitGraphRowsWithState(firstBatch);
    const secondResult = appendGitGraphRows(
      secondBatch,
      firstResult.rowComputationState,
    );

    const paginatedRows = firstResult.rows.concat(secondResult.rows);
    const fullRows = computeRows(commits);
    expect(paginatedRows).toEqual(fullRows);
  });

  it("does not mutate the input row-computation state when appending rows", () => {
    const initialState = createEmptyGitGraphRowComputationState();
    const commits = [commit("B", ["A"]), commit("A", [])];

    const result = appendGitGraphRows(commits, initialState);

    expect(initialState).toEqual({
      lanes: [],
      nextColorId: 0,
    });
    expect(result.rowComputationState.nextColorId).toBeGreaterThan(0);
  });
});
