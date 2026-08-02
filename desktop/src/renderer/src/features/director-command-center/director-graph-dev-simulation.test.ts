import { describe, expect, it } from "vitest";

import { packedValueAt } from "../director-graph/packed-graph-vocabulary";
import {
  createDirectorGraphDevScenario,
  createDirectorGraphDevSimulation,
  createDirectorGraphDevTimeline,
  directorGraphDevAnimationTimeAt,
  directorGraphDevFrameStepSeconds,
  directorGraphDevThreadPhaseCount,
  rescheduleDirectorGraphDevTimeline,
} from "./director-graph-dev-simulation";

describe("Director graph simulator clocks", () => {
  it("changes event spacing without scaling animation time", () => {
    const slow = createDirectorGraphDevTimeline(0.25);
    expect(directorGraphDevAnimationTimeAt(slow, 0.4)).toBeCloseTo(1.6);

    const faster = rescheduleDirectorGraphDevTimeline(slow, 0.5, 2, 2);
    expect(directorGraphDevAnimationTimeAt(faster, 0.4)).toBeCloseTo(1.6);
    expect(directorGraphDevAnimationTimeAt(faster, 0.5)).toBeCloseTo(2);
    expect(directorGraphDevAnimationTimeAt(faster, 0.9)).toBeCloseTo(2.2);
  });

  it("preserves past animation ages across a paused interval", () => {
    const initial = createDirectorGraphDevTimeline(0.25);
    const resumed = rescheduleDirectorGraphDevTimeline(initial, 0.5, 5, 2);

    expect(directorGraphDevAnimationTimeAt(resumed, 0.4)).toBeCloseTo(1.6);
    expect(directorGraphDevAnimationTimeAt(resumed, 0.9)).toBeCloseTo(5.2);
  });
});

describe("Director graph simulator progression", () => {
  const viewport = { height: 900, width: 1600 };
  const timeline = createDirectorGraphDevTimeline(1);
  const scenario = createDirectorGraphDevScenario(3, 4, timeline);

  function directorNodeCount(frameIndex: number): number {
    const simulation = createDirectorGraphDevSimulation(
      scenario,
      viewport,
      frameIndex * directorGraphDevFrameStepSeconds,
      (timestampMs) => timestampMs / 1000,
    );
    let count = 0;
    for (let index = 0; index < simulation.snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(simulation.snapshot.nodes.turn, index);
      if (packedValueAt(simulation.snapshot.turns.column, turn) === 0) {
        count += 1;
      }
    }
    return count;
  }

  it("keeps the complete visible Director history while its work progresses", () => {
    expect(directorNodeCount(0)).toBe(1);
    expect(directorNodeCount(directorGraphDevThreadPhaseCount)).toBe(2);
    expect(directorNodeCount(directorGraphDevThreadPhaseCount * 3)).toBe(4);
  });

  it("keeps complete visible side threads in the columns presentation", () => {
    const simulation = createDirectorGraphDevSimulation(
      scenario,
      viewport,
      directorGraphDevThreadPhaseCount * 3 * directorGraphDevFrameStepSeconds,
      (timestampMs) => timestampMs / 1000,
    );
    const counts = new Map<number, number>();
    for (let index = 0; index < simulation.snapshot.nodeCount; index += 1) {
      const turn = packedValueAt(simulation.snapshot.nodes.turn, index);
      const column = packedValueAt(simulation.snapshot.turns.column, turn);
      counts.set(column, (counts.get(column) ?? 0) + 1);
    }

    expect(simulation.presentation).toBe("columns");
    expect([...counts.values()]).toEqual([4, 4, 4, 4]);
  });
});
