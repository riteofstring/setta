/**
 * Deterministic scenes for the packed-snapshot fixture harness.
 *
 * These scenes are the renderer's test input, not a product data path. They
 * exist so the graph canvas can be built, measured, and profiled against a
 * fixed, reproducible graph shape before any Director endpoint delivers
 * production state. Timestamps here stand in for committed-event times: the
 * renderer never invents them, and nothing in the product advances a scene on
 * a clock of its own.
 *
 * Between them the scenes exercise every value in the packed visual
 * vocabulary, so a value added to the vocabulary without a fixture that draws
 * it fails the coverage test rather than shipping unseen.
 */

import type {
  PackedGraphDetail,
  PackedGraphEmphasis,
  PackedGraphGlyph,
  PackedGraphMode,
  PackedGraphOutcome,
} from "./packed-graph-vocabulary";

export interface FixtureStep {
  readonly text: string;
  readonly mode: PackedGraphMode;
  readonly glyph: PackedGraphGlyph;
  readonly emphasis?: PackedGraphEmphasis;
  readonly detail?: PackedGraphDetail;
}

export interface FixtureLane {
  readonly steps: readonly FixtureStep[];
  /** The lane stops instead of reaching the merge. */
  readonly terminated?: boolean;
}

export type FixtureItem =
  | { readonly kind: "step"; readonly step: FixtureStep }
  | { readonly kind: "deadEnd"; readonly step: FixtureStep }
  | {
      readonly kind: "fan";
      readonly lanes: readonly FixtureLane[];
      readonly merge: FixtureStep;
    };

export interface FixtureTurn {
  readonly question: string;
  readonly items: readonly FixtureItem[];
  readonly outcome: PackedGraphOutcome;
  /** The outcome node's text. Absent while the turn is still running. */
  readonly answer?: string;
  readonly detail?: PackedGraphDetail;
}

export interface FixtureScene {
  readonly workstreamId: string;
  /** Older turns exist outside the window, so the renderer draws a boundary. */
  readonly hasEarlier: boolean;
  readonly turns: readonly FixtureTurn[];
}

export const packedGraphFixtureNames = [
  "single-active-turn",
  "director-and-worker-interleaved",
  "branch-merge-and-dead-end",
  "failure-recovery-and-cancellation",
  "approval-and-artifact-arrival",
  "compacted-history-boundary",
] as const;
export type PackedGraphFixtureName = (typeof packedGraphFixtureNames)[number];

const step = (
  text: string,
  mode: PackedGraphMode,
  glyph: PackedGraphGlyph,
  extra?: Pick<FixtureStep, "emphasis" | "detail">,
): FixtureItem => ({ kind: "step", step: { text, mode, glyph, ...extra } });

const deadEnd = (text: string, mode: PackedGraphMode, glyph: PackedGraphGlyph): FixtureItem => ({
  kind: "deadEnd",
  step: { text, mode, glyph },
});

const scenes: Readonly<Record<PackedGraphFixtureName, FixtureScene>> = {
  "single-active-turn": {
    workstreamId: "fixture-single-active-turn",
    hasEarlier: false,
    turns: [
      {
        question: "Why does workstream navigation drop frames?",
        outcome: "running",
        items: [
          step("read the navigation trace", "think", "read"),
          step("open the frame sampler", "do", "terminal"),
          step("compare p95 against the budget", "do", "measure"),
        ],
      },
    ],
  },
  "director-and-worker-interleaved": {
    workstreamId: "fixture-director-and-worker",
    hasEarlier: false,
    turns: [
      {
        question: "Split the approval queue by workstream.",
        outcome: "succeeded",
        answer: "Approvals are grouped per workstream.",
        items: [
          step("route to the approvals workstream", "think", "dot", {
            emphasis: "declared",
          }),
          step("locate the approval reducer", "do", "search"),
          step("rewrite the grouping", "do", "edit"),
          step("this reads as a safe change", "think", "dot", {
            emphasis: "interpreted",
          }),
        ],
      },
      {
        question: "Show the counts in the rail.",
        outcome: "succeeded",
        answer: "The rail shows unresolved counts per workstream.",
        items: [
          step("write the rail projection", "do", "document"),
          step("re-measure the rail render", "do", "measure"),
        ],
      },
    ],
  },
  "branch-merge-and-dead-end": {
    workstreamId: "fixture-branch-merge",
    hasEarlier: false,
    turns: [
      {
        question: "Find what stalls the first paint.",
        outcome: "succeeded",
        answer: "The first paint waits on shader compilation.",
        items: [
          step("read the startup trace", "think", "read"),
          deadEnd("grep the speech module", "do", "search"),
          {
            kind: "fan",
            lanes: [
              {
                steps: [
                  { text: "profile shader compilation", mode: "do", glyph: "measure" },
                  { text: "record the compile cost", mode: "think", glyph: "dot" },
                ],
              },
              {
                steps: [{ text: "inspect buffer uploads", mode: "do", glyph: "terminal" }],
              },
              {
                steps: [{ text: "measure the overview ghost", mode: "do", glyph: "measure" }],
                terminated: true,
              },
            ],
            merge: {
              text: "synthesize the startup findings",
              mode: "merge",
              glyph: "synthesis",
            },
          },
          step("prewarm the shader set", "do", "edit"),
        ],
      },
    ],
  },
  "failure-recovery-and-cancellation": {
    workstreamId: "fixture-failure-recovery",
    hasEarlier: false,
    turns: [
      {
        question: "Rebuild the packed columns on every event.",
        outcome: "cancelled",
        answer: "Cancelled before the rebuild landed.",
        items: [step("start the column rebuild", "do", "edit")],
      },
      {
        question: "Upload the whole buffer each frame.",
        outcome: "failed",
        answer: "The upload blew the frame budget.",
        items: [
          step("upload the full buffer", "do", "terminal"),
          step("frame time exceeded the budget", "risk", "warning"),
        ],
      },
      {
        question: "Upload only the changed range.",
        outcome: "succeeded",
        answer: "Changed-range uploads hold the budget.",
        items: [
          step("retry with a changed range", "risk", "dot"),
          step("apply the range upload", "do", "edit"),
          step("re-measure the frame", "do", "measure"),
        ],
      },
    ],
  },
  "approval-and-artifact-arrival": {
    workstreamId: "fixture-approval-and-artifact",
    hasEarlier: false,
    turns: [
      {
        question: "Move the layout persistence file.",
        outcome: "succeeded",
        answer: "The layout file moved and the report is attached.",
        items: [
          step("read the persistence module", "think", "read"),
          step("waiting on approval to write", "risk", "warning"),
          step("apply the approved move", "do", "edit"),
          step("attach the migration report", "do", "document"),
        ],
      },
    ],
  },
  "compacted-history-boundary": {
    workstreamId: "fixture-compacted-history",
    hasEarlier: true,
    turns: [
      {
        question: "Bound the label budget.",
        outcome: "succeeded",
        answer: "Labels are bounded and the full text stays in the DOM.",
        detail: "compacted",
        items: [
          step("bound the label text", "do", "edit", { detail: "compacted" }),
          step("check the label budget", "do", "measure", {
            detail: "compacted",
          }),
        ],
      },
      {
        question: "Keep the compaction boundary visible.",
        outcome: "succeeded",
        answer: "The window shows where older history begins.",
        items: [
          step("read the window bounds", "think", "read"),
          step("mark the earlier boundary", "do", "document"),
        ],
      },
    ],
  },
};

export function packedGraphScene(name: PackedGraphFixtureName): FixtureScene {
  return scenes[name];
}
