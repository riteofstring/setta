/**
 * The measurement scenarios, as data.
 *
 * `docs/reports/performance/setta-4-target-performance-matrix-20260724.md`
 * section 4 lists the scenarios Setta 4 must be measured under. This is that
 * list expressed over the committed packed fixtures, so the harness runs the
 * required work rather than a convenient approximation of it, and so a report
 * can name the scenario it ran.
 *
 * A scenario is a plan, not a script: it says which fixture to replay and how
 * its batches arrive, and the runner turns that into pushes on real frames. The
 * replay rate compresses fixture time — a fixture minute is not interesting to
 * watch — but nothing else about the arrival pattern is altered, because the
 * point is to measure the renderer against the cadence a live subscription
 * produces.
 */

import type { PackedGraphFixtureName } from "../packed-graph-scenes";

/** Scene seconds per real second while a fixture replays. */
const defaultReplayRate = 2.5;

export type DirectorGraphScenarioPlan =
  /** Ordinary live cadence: each batch arrives at its own committed time. */
  | { readonly kind: "replay"; readonly fixture: PackedGraphFixtureName; readonly rate: number }
  /** A backlog arrives at once, after the facts in it already happened. */
  | {
      readonly kind: "burst";
      readonly fixture: PackedGraphFixtureName;
      /** Quiet frames before the backlog lands. */
      readonly silentFrames: number;
    }
  /** Selection moves across a set of distinct workstreams. */
  | {
      readonly kind: "navigate";
      readonly workstreams: number;
      readonly switches: number;
      readonly framesPerSwitch: number;
    }
  /** Live replay, then the same stream rebuilt cold from a durable cursor. */
  | { readonly kind: "restart"; readonly fixture: PackedGraphFixtureName; readonly rate: number }
  /** The same replay, looped, long enough to expose GC or thermal drift. */
  | {
      readonly kind: "sustained";
      readonly fixture: PackedGraphFixtureName;
      readonly rate: number;
      readonly durationMs: number;
    }
  /** The graph is occluded mid-replay and then comes back. */
  | {
      readonly kind: "occlusion";
      readonly fixture: PackedGraphFixtureName;
      readonly rate: number;
      readonly hiddenMs: number;
      readonly resumeMs: number;
    };

export const directorGraphScenarioNames = [
  "one-active-workstream",
  "director-and-worker-interleaved",
  "branch-merge-and-dead-end",
  "history-compaction-boundary",
  "approval-and-artifact-arrival",
  "cancellation-failure-recovery",
  "navigate-100-workstreams",
  "burst-cursor-replay",
  "restart-durable-replay",
  "sustained-activity",
  "occlusion-transitions",
] as const;
export type DirectorGraphScenarioName = (typeof directorGraphScenarioNames)[number];

const directorGraphScenarios = {
  "one-active-workstream": {
    kind: "replay",
    fixture: "single-active-turn",
    rate: defaultReplayRate,
  },
  "director-and-worker-interleaved": {
    kind: "replay",
    fixture: "director-and-worker-interleaved",
    rate: defaultReplayRate,
  },
  "branch-merge-and-dead-end": {
    kind: "replay",
    fixture: "branch-merge-and-dead-end",
    rate: defaultReplayRate,
  },
  "history-compaction-boundary": {
    kind: "replay",
    fixture: "compacted-history-boundary",
    rate: defaultReplayRate,
  },
  "approval-and-artifact-arrival": {
    kind: "replay",
    fixture: "approval-and-artifact-arrival",
    rate: defaultReplayRate,
  },
  "cancellation-failure-recovery": {
    kind: "replay",
    fixture: "failure-recovery-and-cancellation",
    rate: defaultReplayRate,
  },
  "navigate-100-workstreams": {
    kind: "navigate",
    workstreams: 100,
    switches: 100,
    framesPerSwitch: 3,
  },
  "burst-cursor-replay": {
    kind: "burst",
    fixture: "director-and-worker-interleaved",
    silentFrames: 8,
  },
  "restart-durable-replay": {
    kind: "restart",
    fixture: "branch-merge-and-dead-end",
    rate: defaultReplayRate * 2,
  },
  "sustained-activity": {
    kind: "sustained",
    fixture: "director-and-worker-interleaved",
    rate: defaultReplayRate * 2,
    durationMs: 60_000,
  },
  "occlusion-transitions": {
    kind: "occlusion",
    fixture: "director-and-worker-interleaved",
    rate: defaultReplayRate,
    hiddenMs: 700,
    resumeMs: 700,
  },
} satisfies Record<DirectorGraphScenarioName, DirectorGraphScenarioPlan>;

export function directorGraphScenarioPlan(
  name: DirectorGraphScenarioName,
): DirectorGraphScenarioPlan {
  return directorGraphScenarios[name];
}
