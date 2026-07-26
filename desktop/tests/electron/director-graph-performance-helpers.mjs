/**
 * The measurement matrix, as the workflow runs it.
 *
 * Section 3 of `docs/reports/performance/setta-4-target-performance-matrix-20260724.md`
 * defines the tiers and section 4 assigns scenarios to them. This file is that
 * assignment in executable form, plus the pass/fail rules. The thresholds live
 * here rather than in the renderer bundle because they are measurement
 * decisions: the renderer reports numbers, the matrix decides what they have to
 * be.
 */

import { assertSmoothFrameSample, observedFrameBudgetMs } from "./performance-frame-budget.mjs";

/**
 * Tiers in run order. `emulated` tiers go through
 * `Emulation.setDeviceMetricsOverride`; the laptop tier clears the override and
 * measures the real window on the real display, which is why it is the tier the
 * budgets are accepted against.
 */
export const directorGraphTiers = [
  {
    name: "laptop",
    label: "Laptop (primary, real)",
    emulated: false,
    width: 1512,
    height: 982,
    deviceScaleFactor: 2,
    scenarios: [
      "one-active-workstream",
      "director-and-worker-interleaved",
      "branch-merge-and-dead-end",
      "history-compaction-boundary",
      "approval-and-artifact-arrival",
      "cancellation-failure-recovery",
      "navigate-100-workstreams",
      "burst-cursor-replay",
      "restart-durable-replay",
      "occlusion-transitions",
      "sustained-activity",
    ],
  },
  {
    name: "harness-standard",
    label: "Harness standard 1440×900 @1",
    emulated: true,
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    scenarios: ["one-active-workstream", "restart-durable-replay"],
  },
  {
    name: "desktop-4k",
    label: "Desktop 4K 3840×2160 @1",
    emulated: true,
    width: 3840,
    height: 2160,
    deviceScaleFactor: 1,
    scenarios: [
      "director-and-worker-interleaved",
      "navigate-100-workstreams",
      "burst-cursor-replay",
    ],
  },
  {
    name: "desktop-6k",
    label: "Desktop 6K 6016×3384 @1",
    emulated: true,
    width: 6016,
    height: 3384,
    deviceScaleFactor: 1,
    scenarios: ["director-and-worker-interleaved"],
  },
  {
    name: "phone-dpr3",
    label: "Phone 390×844 @3",
    emulated: true,
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    scenarios: ["one-active-workstream"],
  },
  {
    name: "phone-dpr1",
    label: "Phone 390×700 @1",
    emulated: true,
    width: 390,
    height: 700,
    deviceScaleFactor: 1,
    mobile: true,
    scenarios: ["one-active-workstream"],
  },
];

/** The plan's steady-animation budgets. */
export const directorGraphBudgets = {
  cpuFrameP95Ms: 2,
  gpuFrameP95Ms: 4,
  minimumFrames: 30,
  /**
   * A tier step costs a geometry rebuild, so the controller is meant to settle
   * and stay settled. A handful of steps is adaptation; hundreds is a loop
   * between two decisions, which is invisible in frame time until the hardware
   * is slower than this one.
   */
  maximumTierChanges: 8,
};

export function directorGraphTierNames() {
  return directorGraphTiers.map((tier) => tier.name);
}

export async function applyDirectorGraphTier(client, tier) {
  if (!tier.emulated) {
    await client.call("Emulation.clearDeviceMetricsOverride");
    return;
  }
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: tier.deviceScaleFactor,
    height: tier.height,
    mobile: Boolean(tier.mobile),
    width: tier.width,
  });
}

/**
 * Reshapes a harness run into the sample the committed budget harness asserts
 * against, so a graph report and a workflow report mean the same thing by p95.
 *
 * The renderer's own `adaptationBudgetMs` is deliberately not carried across.
 * It comes from the single shortest frame delta ever observed, which on a
 * ProMotion panel lands about a millisecond under the real period because rAF
 * timestamps jitter; using it as the report budget would fail a perfectly
 * on-cadence sample. `performance-frame-budget.mjs` resolves the budget from
 * the delta distribution, which is the committed convention the matrix names.
 */
export function directorGraphFrameSample(run) {
  const { summary } = run;
  return {
    frameCount: summary.frames,
    framesMs: summary.frameDeltasMs,
    longTaskCount: summary.longTasks,
    longTaskTotalMs: summary.longTaskTotalMs,
    maxFrameDeltaMs: summary.frameDeltaMs.maximum,
    p50FrameDeltaMs: summary.frameDeltaMs.p50,
    p95FrameDeltaMs: summary.frameDeltaMs.p95,
    p99FrameDeltaMs: summary.frameDeltaMs.p99,
    slowFramesOver120HzBudget: 0,
    slowFramesOver32Ms: 0,
    slowFramesOver50Ms: summary.framesOverDroppedThreshold,
  };
}

/** The display period this sample ran at, by the committed convention. */
export function directorGraphReportBudgetMs(run) {
  return observedFrameBudgetMs(directorGraphFrameSample(run), {});
}

export function assertDirectorGraphRun(run, tier) {
  const label = `${tier.name}/${run.scenario}`;
  assertFrameCount(run, label);
  assertSmoothFrameSample(directorGraphFrameSample(run), label, {
    minFrameCount: directorGraphBudgets.minimumFrames,
  });
  assertBudgets(run, label);
  assertQualitySettled(run, label);
  assertPixelCheck(run, label);
  assertScenarioDetails(run, label);
}

function assertQualitySettled(run, label) {
  if (run.summary.tierChanges <= directorGraphBudgets.maximumTierChanges) {
    return;
  }
  throw new Error(
    `${label} kept changing quality tier: ${JSON.stringify({
      tierChanges: run.summary.tierChanges,
      frames: run.summary.frames,
      renderScale: [run.summary.renderScaleMinimum, run.summary.renderScaleMaximum],
      gpuFrameMs: run.summary.gpuFrameMs,
    })}`,
  );
}

function assertFrameCount(run, label) {
  if (run.summary.frames >= directorGraphBudgets.minimumFrames) {
    return;
  }
  throw new Error(
    `${label} drew too few frames to judge: ${JSON.stringify({
      frames: run.summary.frames,
      durationMs: run.durationMs,
    })}`,
  );
}

function assertBudgets(run, label) {
  const { summary } = run;
  if (summary.cpuFrameMs.p95 > directorGraphBudgets.cpuFrameP95Ms) {
    throw new Error(
      `${label} exceeded the main-thread frame budget: ${JSON.stringify({
        budgetMs: directorGraphBudgets.cpuFrameP95Ms,
        cpuFrameMs: summary.cpuFrameMs,
        marks: summary.marks,
      })}`,
    );
  }
  if (summary.gpuFrameMs === null) {
    throw new Error(`${label} reported no GPU timer-query samples`);
  }
  if (summary.gpuFrameMs.p95 > directorGraphBudgets.gpuFrameP95Ms) {
    throw new Error(
      `${label} exceeded the GPU frame budget: ${JSON.stringify({
        budgetMs: directorGraphBudgets.gpuFrameP95Ms,
        gpuFrameMs: summary.gpuFrameMs,
      })}`,
    );
  }
}

function assertPixelCheck(run, label) {
  if (run.pixel.ok) {
    return;
  }
  throw new Error(
    `${label} failed the canvas-pixel check: ${JSON.stringify({
      failures: run.pixel.failures,
      contentCentroidX: run.pixel.contentCentroidX,
      contentCentroidY: run.pixel.contentCentroidY,
      contentSpanX: run.pixel.contentSpanX,
      contentSpanY: run.pixel.contentSpanY,
      frameSpanX: run.pixel.frameSpanX,
      frameSpanY: run.pixel.frameSpanY,
      litCellRatio: run.pixel.litCellRatio,
      peakLuminance: run.pixel.peakLuminance,
      size: [run.pixel.width, run.pixel.height],
    })}`,
  );
}

function assertScenarioDetails(run, label) {
  const details = run.details ?? {};
  switch (run.kind) {
    case "burst":
      assertBurstCoalesced(details, label);
      return;
    case "restart":
      assertReplayMatchedLive(details, label);
      return;
    case "navigate":
      assertNavigationWithinFrame(run, details, label);
      return;
    case "occlusion":
      assertOcclusionSlept(run, details, label);
      return;
    case "replay":
    case "sustained":
      return;
    default:
      throw new Error(`${label} reported an unknown scenario kind: ${run.kind}`);
  }
}

function assertBurstCoalesced(details, label) {
  if (details.framesToApplyBacklog === 1) {
    return;
  }
  throw new Error(
    `${label} did not coalesce the backlog into one frame: ${JSON.stringify(details)}`,
  );
}

function assertReplayMatchedLive(details, label) {
  if (!details.digestsMatch) {
    throw new Error(`${label} cold replay produced different columns: ${JSON.stringify(details)}`);
  }
  if (!details.livePixelOk || !details.replayPixelOk) {
    throw new Error(`${label} replay pixel check failed: ${JSON.stringify(details)}`);
  }
  const centroidDrift = Math.max(
    Math.abs(details.liveCentroidX - details.replayCentroidX),
    Math.abs(details.liveCentroidY - details.replayCentroidY),
  );
  if (centroidDrift > 0.05) {
    throw new Error(`${label} replay drew a different picture: ${JSON.stringify(details)}`);
  }
}

function assertNavigationWithinFrame(run, details, label) {
  if (details.switches < details.workstreams) {
    throw new Error(`${label} did not visit every workstream: ${JSON.stringify(details)}`);
  }
  const budgetMs = directorGraphReportBudgetMs(run);
  const longestFrameMs = run.summary.cpuFrameMs.maximum;
  if (longestFrameMs > budgetMs) {
    throw new Error(
      `${label} spent longer than one frame on a workstream switch: ${JSON.stringify({
        budgetMs,
        longestFrameMs,
        marks: run.summary.marks,
      })}`,
    );
  }
}

function assertOcclusionSlept(run, details, label) {
  if (details.framesWhileHidden !== 0 || details.awakeWhileHidden) {
    throw new Error(`${label} kept drawing while occluded: ${JSON.stringify(details)}`);
  }
  if (details.resumeFrames <= 0) {
    throw new Error(`${label} did not resume after occlusion: ${JSON.stringify(details)}`);
  }
  // Resuming must cost one frame per refresh period, not a catch-up burst for
  // the time spent hidden. The allowance is loose because frame pacing jitters
  // by a millisecond either way; a real catch-up burst would render the whole
  // hidden interval and land many times over this.
  const framesAvailable =
    Math.ceil((details.resumeMs / directorGraphReportBudgetMs(run)) * 1.25) + 4;
  if (details.resumeFrames > framesAvailable) {
    throw new Error(
      `${label} resumed with a catch-up burst: ${JSON.stringify({ details, framesAvailable })}`,
    );
  }
}
