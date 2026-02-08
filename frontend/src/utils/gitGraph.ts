import type { GitCommit } from "./generatedTypes";

export type GitGraphRow = {
  commit: GitCommit;
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

export function appendGitGraphRows(
  commits: readonly GitCommit[],
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
  const lanes = nextState.lanes;

  const allocateLane = (nextHash: string): number => {
    const emptySlot = lanes.findIndex((lane) => lane === null);
    const lane = { nextHash, colorId: nextState.nextColorId };
    nextState.nextColorId += 1;
    if (emptySlot !== -1) {
      lanes[emptySlot] = lane;
      return emptySlot;
    }
    lanes.push(lane);
    return lanes.length - 1;
  };

  const trimTrailingNulls = () => {
    let last = lanes.length - 1;
    while (last >= 0 && lanes[last] === null) {
      last -= 1;
    }
    lanes.length = last + 1;
  };

  for (const commit of commits) {
    const laneStartIndices: number[] = [];
    const matchingLaneIndices: number[] = [];
    for (let idx = 0; idx < lanes.length; idx += 1) {
      const lane = lanes[idx];
      if (lane && lane.nextHash === commit.hash) {
        matchingLaneIndices.push(idx);
      }
    }

    const joinFromLaneIndices: number[] = [];
    const laneIndex =
      matchingLaneIndices.length > 0
        ? matchingLaneIndices[0]!
        : allocateLane(commit.hash);
    if (matchingLaneIndices.length > 0) {
      joinFromLaneIndices.push(...matchingLaneIndices.slice(1));
    } else {
      laneStartIndices.push(laneIndex);
    }

    const mergeToLaneIndices: number[] = [];
    for (const parent of commit.parents.slice(1)) {
      let parentLaneIndex = lanes.findIndex(
        (lane) => lane?.nextHash === parent,
      );
      if (parentLaneIndex === -1) {
        parentLaneIndex = allocateLane(parent);
        laneStartIndices.push(parentLaneIndex);
      }
      mergeToLaneIndices.push(parentLaneIndex);
    }

    const laneColorIds = lanes.map((lane) => (lane ? lane.colorId : -1));
    const laneEndIndices =
      commit.parents.length === 0
        ? [...joinFromLaneIndices, laneIndex]
        : joinFromLaneIndices;

    rows.push({
      commit,
      laneIndex,
      laneColorIds,
      laneStartIndices,
      laneEndIndices,
      joinFromLaneIndices,
      mergeToLaneIndices,
    });

    // Branch splits show up as multiple lanes pointing at the same next commit hash.
    // Keep them distinct until we render this commit, then merge the lanes here.
    for (const fromIdx of joinFromLaneIndices) {
      lanes[fromIdx] = null;
    }

    if (commit.parents.length > 0) {
      const lane = lanes[laneIndex];
      if (!lane) {
        throw new Error(
          `Invariant violated: lane ${laneIndex} missing for commit ${commit.hash}`,
        );
      }
      lanes[laneIndex] = {
        nextHash: commit.parents[0]!,
        colorId: lane.colorId,
      };
    } else {
      lanes[laneIndex] = null;
    }

    trimTrailingNulls();
  }

  return {
    rows,
    rowComputationState: nextState,
  };
}

export function computeGitGraphRowsWithState(commits: readonly GitCommit[]): {
  rows: GitGraphRow[];
  rowComputationState: GitGraphRowComputationState;
} {
  return appendGitGraphRows(commits, createEmptyGitGraphRowComputationState());
}

export function computeGitGraphRows(commits: GitCommit[]): GitGraphRow[] {
  return computeGitGraphRowsWithState(commits).rows;
}
