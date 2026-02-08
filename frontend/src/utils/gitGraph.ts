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

export function computeGitGraphRows(commits: GitCommit[]): GitGraphRow[] {
  const rows: GitGraphRow[] = [];
  const lanes: Lane[] = [];
  let nextColorId = 0;

  for (const commit of commits) {
    const laneStartIndices: number[] = [];
    const matchingLaneIndices: number[] = [];
    for (let idx = 0; idx < lanes.length; idx += 1) {
      if (lanes[idx]!.nextHash === commit.hash) {
        matchingLaneIndices.push(idx);
      }
    }

    const laneIndex =
      matchingLaneIndices.length > 0 ? matchingLaneIndices[0]! : lanes.length;
    const joinFromLaneIndices = matchingLaneIndices.slice(1);

    if (matchingLaneIndices.length === 0) {
      lanes.push({ nextHash: commit.hash, colorId: nextColorId++ });
      laneStartIndices.push(laneIndex);
    }

    const mergeToLaneIndices: number[] = [];
    for (const parent of commit.parents.slice(1)) {
      let parentLaneIndex = lanes.findIndex((lane) => lane.nextHash === parent);
      if (parentLaneIndex === -1) {
        parentLaneIndex = lanes.length;
        lanes.push({ nextHash: parent, colorId: nextColorId++ });
        laneStartIndices.push(parentLaneIndex);
      }
      mergeToLaneIndices.push(parentLaneIndex);
    }

    const laneColorIds = lanes.map((lane) => lane.colorId);
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
    for (let idx = joinFromLaneIndices.length - 1; idx >= 0; idx -= 1) {
      lanes.splice(joinFromLaneIndices[idx]!, 1);
    }

    if (commit.parents.length > 0) {
      lanes[laneIndex] = {
        nextHash: commit.parents[0]!,
        colorId: lanes[laneIndex]!.colorId,
      };
    } else {
      lanes.splice(laneIndex, 1);
    }
  }

  return rows;
}
