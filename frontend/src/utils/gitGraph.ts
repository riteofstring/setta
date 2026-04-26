import type { GitreadCommit as Commit } from "openapi/http";

export type GitGraphRow = {
  commit: Commit;
  laneIndex: number;
  laneColorIds: number[];
  laneStartIndices: number[];
  laneEndIndices: number[];
  joinFromLaneIndices: number[];
  mergeToLaneIndices: number[];
};

type Lane = {
  nextHash: string;
  colorId: number;
};

export type GitGraphRowComputationState = {
  lanes: Array<Lane | null>;
  nextColorId: number;
};

export function createEmptyGitGraphRowComputationState(): GitGraphRowComputationState {
  return {
    lanes: [],
    nextColorId: 0,
  };
}

function cloneGitGraphRowComputationState(
  state: GitGraphRowComputationState,
): GitGraphRowComputationState {
  return {
    lanes: state.lanes.map((lane) => (lane ? { ...lane } : null)),
    nextColorId: state.nextColorId,
  };
}

type CommitLaneAssignments = {
  laneIndex: number;
  laneStartIndices: number[];
  joinFromLaneIndices: number[];
  mergeToLaneIndices: number[];
};

function allocateLane(
  rowComputationState: GitGraphRowComputationState,
  nextHash: string,
): number {
  const { lanes } = rowComputationState;
  const emptySlot = lanes.findIndex((lane) => lane === null);
  const lane = { nextHash, colorId: rowComputationState.nextColorId };
  rowComputationState.nextColorId += 1;
  if (emptySlot !== -1) {
    lanes[emptySlot] = lane;
    return emptySlot;
  }
  lanes.push(lane);
  return lanes.length - 1;
}

function trimTrailingNulls(lanes: Array<Lane | null>) {
  let last = lanes.length - 1;
  while (last >= 0 && lanes[last] === null) {
    last -= 1;
  }
  lanes.length = last + 1;
}

function findMatchingLaneIndices(
  lanes: Array<Lane | null>,
  hash: string,
): number[] {
  const matchingLaneIndices: number[] = [];
  for (let idx = 0; idx < lanes.length; idx += 1) {
    const lane = lanes[idx];
    if (lane?.nextHash === hash) {
      matchingLaneIndices.push(idx);
    }
  }
  return matchingLaneIndices;
}

function findLaneIndex(
  lanes: Array<Lane | null>,
  nextHash: string,
): number | null {
  const laneIndex = lanes.findIndex((lane) => lane?.nextHash === nextHash);
  return laneIndex === -1 ? null : laneIndex;
}

function resolveParentLaneIndices(
  rowComputationState: GitGraphRowComputationState,
  parents: readonly string[],
  laneStartIndices: number[],
): number[] {
  const mergeToLaneIndices: number[] = [];
  for (const parentHash of parents.slice(1)) {
    let parentLaneIndex = findLaneIndex(rowComputationState.lanes, parentHash);
    if (parentLaneIndex === null) {
      parentLaneIndex = allocateLane(rowComputationState, parentHash);
      laneStartIndices.push(parentLaneIndex);
    }
    mergeToLaneIndices.push(parentLaneIndex);
  }
  return mergeToLaneIndices;
}

function resolveCommitLaneAssignments(
  rowComputationState: GitGraphRowComputationState,
  commitHash: string,
  parents: readonly string[],
): CommitLaneAssignments {
  const laneStartIndices: number[] = [];
  const matchingLaneIndices = findMatchingLaneIndices(
    rowComputationState.lanes,
    commitHash,
  );
  const [matchingLaneIndex, ...joinFromLaneIndices] = matchingLaneIndices;
  const laneIndex =
    matchingLaneIndex ?? allocateLane(rowComputationState, commitHash);
  if (matchingLaneIndex === undefined) {
    laneStartIndices.push(laneIndex);
  }

  return {
    laneIndex,
    laneStartIndices,
    joinFromLaneIndices,
    mergeToLaneIndices: resolveParentLaneIndices(
      rowComputationState,
      parents,
      laneStartIndices,
    ),
  };
}

function buildGitGraphRow(
  commit: Commit,
  lanes: Array<Lane | null>,
  {
    laneIndex,
    laneStartIndices,
    joinFromLaneIndices,
    mergeToLaneIndices,
  }: CommitLaneAssignments,
  parents: readonly string[],
): GitGraphRow {
  return {
    commit,
    laneIndex,
    laneColorIds: lanes.map((lane) => (lane ? lane.colorId : -1)),
    laneStartIndices,
    laneEndIndices:
      parents.length === 0
        ? [...joinFromLaneIndices, laneIndex]
        : joinFromLaneIndices,
    joinFromLaneIndices,
    mergeToLaneIndices,
  };
}

function advanceRowComputationState(
  lanes: Array<Lane | null>,
  { laneIndex, joinFromLaneIndices }: CommitLaneAssignments,
  commitHash: string,
  parents: readonly string[],
) {
  for (const fromIdx of joinFromLaneIndices) {
    lanes[fromIdx] = null;
  }

  const [firstParentHash] = parents;
  if (firstParentHash === undefined) {
    lanes[laneIndex] = null;
    trimTrailingNulls(lanes);
    return;
  }

  const lane = lanes[laneIndex];
  if (lane == null) {
    throw new Error(
      `Invariant violated: lane ${laneIndex} missing for commit ${commitHash}`,
    );
  }
  lanes[laneIndex] = {
    nextHash: firstParentHash,
    colorId: lane.colorId,
  };

  trimTrailingNulls(lanes);
}

export function appendGitGraphRows(
  commits: readonly Commit[],
  rowComputationState: GitGraphRowComputationState,
): {
  rows: GitGraphRow[];
  rowComputationState: GitGraphRowComputationState;
} {
  const rows: GitGraphRow[] = [];
  const nextState = cloneGitGraphRowComputationState(rowComputationState);
  // IMPORTANT: lane indices must be stable across rows.
  //
  // If we `splice()` lanes out of the array, every lane to the right shifts
  // left by one. We don't currently draw any "lane shift" connector, so the
  // rendered SVG looks like branch lines are disconnected at row boundaries.
  //
  // To avoid this, keep a fixed-slot lane array and replace removed lanes with
  // `null` holes. When allocating a new lane, reuse the first `null` slot.
  const { lanes } = nextState;

  for (const commit of commits) {
    const parents = commit.parents ?? [];
    const laneAssignments = resolveCommitLaneAssignments(
      nextState,
      commit.hash,
      parents,
    );

    rows.push(buildGitGraphRow(commit, lanes, laneAssignments, parents));

    // Branch splits show up as multiple lanes pointing at the same next commit hash.
    // Keep them distinct until we render this commit, then merge the lanes here.
    advanceRowComputationState(lanes, laneAssignments, commit.hash, parents);
  }

  return {
    rows,
    rowComputationState: nextState,
  };
}

export function computeGitGraphRowsWithState(commits: readonly Commit[]): {
  rows: GitGraphRow[];
  rowComputationState: GitGraphRowComputationState;
} {
  return appendGitGraphRows(commits, createEmptyGitGraphRowComputationState());
}
