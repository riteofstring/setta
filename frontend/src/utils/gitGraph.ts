import type { GitCommit } from "./generatedTypes";

export type GitGraphRow = {
  commit: GitCommit;
  laneIndex: number;
  laneColorIds: number[];
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
    let laneIndex = lanes.findIndex((lane) => lane.nextHash === commit.hash);
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push({ nextHash: commit.hash, colorId: nextColorId++ });
    }

    const mergeToLaneIndices: number[] = [];
    for (const parent of commit.parents.slice(1)) {
      let parentLaneIndex = lanes.findIndex((lane) => lane.nextHash === parent);
      if (parentLaneIndex === -1) {
        parentLaneIndex = lanes.length;
        lanes.push({ nextHash: parent, colorId: nextColorId++ });
      }
      mergeToLaneIndices.push(parentLaneIndex);
    }

    const laneColorIds = lanes.map((lane) => lane.colorId);

    rows.push({
      commit,
      laneIndex,
      laneColorIds,
      mergeToLaneIndices,
    });

    if (commit.parents.length > 0) {
      lanes[laneIndex] = {
        nextHash: commit.parents[0]!,
        colorId: lanes[laneIndex]!.colorId,
      };
    } else {
      lanes.splice(laneIndex, 1);
    }

    // Collapse converged lanes so we don't keep duplicate "next" hashes around.
    const seen = new Set<string>();
    const toRemove: number[] = [];
    for (let idx = 0; idx < lanes.length; idx += 1) {
      const nextHash = lanes[idx]!.nextHash;
      if (seen.has(nextHash)) {
        toRemove.push(idx);
        continue;
      }
      seen.add(nextHash);
    }
    for (let idx = toRemove.length - 1; idx >= 0; idx -= 1) {
      const laneIdx = toRemove[idx]!;
      lanes.splice(laneIdx, 1);
    }
  }

  return rows;
}
