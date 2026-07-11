// Phase C of docs/plans/easy-button-pixel-match-20260709.md: deterministic frames
// and measured component geometry for the Easy Button pane.
//
// Per-frame equality with the mockup is neither achievable nor meaningful, but
// every animation parameter other than the current time is static. Pinning the
// time turns the comparison into two stills, and the component metrics turn "does
// it look right" into a diff a reviewer can read.
//
// The mockup is a fixed 1180x660 card and the real pane fills a workspace column,
// so a whole-pane diff would be noise. Both rails clamp to the same 300px / 380px
// tracks at this viewport, which is what makes the per-component crops comparable.

import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createElectronFixture,
  launchElectronCdpContext,
  stopElectronCdpContext,
  waitForSelector,
  waitForState,
  writeJson,
} from "./electron-cdp-harness.mjs";
import {
  clickEasyButtonStop,
  desktopViewport,
  easyButtonStateExpression,
  easyButtonStateSettled,
  ensureWorkspaceOpen,
  openEasyButtonFromShortcut,
  submitEasyButtonRequest,
  workflowTimeoutMs,
} from "./easy-button-pane-actions.mjs";
import { clipToBounds, pinTimesMs, writePng } from "./easy-button-pixel-match-report.mjs";
import { opacityMatches } from "./easy-button-pane-visual-assertions.mjs";

const swirlWorkingOpacity = 0.85;
const swirlCompleteOpacity = 0.2;

const capturePlan = [
  { crops: ["control", "inputWrap"], state: "idle" },
  { crops: ["swirl", "control", "captionSlot"], state: "working" },
  { crops: ["captionSlot", "highlightItem"], state: "stopped" },
  { crops: ["artifactCard", "inputWrap"], state: "completedArtifacts" },
  { crops: ["highlightItem", "captionSlot"], state: "completedHighlights" },
  { crops: ["artifactCard", "control"], state: "failed" },
];

export async function runEasyButtonPixelMatchCaptures({ artifactDir, visible }) {
  const fixture = await createElectronFixture("easy-button-pixel-match");
  let context = null;
  try {
    context = await launchElectronCdpContext({
      artifactDir,
      extraEnv: { SETTA_E2E_CHAT_HARNESS: "scripted-workflow" },
      fixture,
      visible,
    });
    await context.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    await context.client.installDriver();
    await ensureWorkspaceOpen(context.client);
    await openEasyButtonFromShortcut(context.client);

    const states = await captureProductionStates(context.client, artifactDir);
    const metrics = { states, surface: "production", viewport: desktopViewport };
    await writeJson(join(artifactDir, "production-metrics.json"), metrics);
    return metrics;
  } finally {
    await stopElectronCdpContext(context);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }
}

async function captureProductionStates(client, artifactDir) {
  const states = {};
  for (const step of capturePlan) {
    await advanceToState(client, step.state);
    await waitForRestingPaneRect(client);
    states[step.state] = await captureState(client, artifactDir, step);
  }
  return states;
}

// Opening the pane slides its workspace column into place, and that animation
// belongs to the layout rather than to the pane, so pinning the pane's subtree
// cannot freeze it. Capturing part-way through puts every crop a few pixels off
// from the run before. Three identical reads mean the column has landed.
async function waitForRestingPaneRect(client) {
  let previous = "";
  let identicalReads = 0;
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => {
      const rect = JSON.stringify(state.rect);
      identicalReads = rect === previous ? identicalReads + 1 : 0;
      previous = rect;
      return identicalReads >= 2;
    },
    workflowTimeoutMs,
  );
}

async function advanceToState(client, state) {
  switch (state) {
    case "idle":
      return waitForIdle(client);
    case "working":
      await submitEasyButtonRequest(client, "easy run working narrator cadence");
      return waitForWorking(client, "easy run working narrator cadence", 2);
    case "stopped":
      await clickEasyButtonStop(client);
      return waitForTerminal(client, { highlights: 2, statusTone: "stopped" });
    case "completedArtifacts":
      await submitEasyButtonRequest(client, "easy run phase3 artifacts workflow");
      return waitForTerminal(client, { artifacts: 4, statusTone: "completed" });
    case "completedHighlights":
      await submitEasyButtonRequest(client, "easy run phase4 narrator workflow");
      return waitForTerminal(client, { highlights: 2, statusTone: "completed" });
    case "failed":
      await submitEasyButtonRequest(client, "easy run phase5 artifact cap workflow");
      return waitForTerminal(client, { artifacts: 20, statusTone: "failed" });
  }
  throw new Error(`unknown easy-button pixel-match state: ${state}`);
}

// Metrics are read after the first pin, so they describe the frame that was
// captured rather than whatever the pane happened to be interpolating toward: a
// pre-pin read catches the swirl mid-crossfade and the newest artifact card
// mid-arrival. `getComputedStyle` still reports the CSS `animation-play-state`,
// not the Web Animations one, so the idle pause survives the freeze.
async function captureState(client, artifactDir, { crops, state }) {
  const frames = [];
  let metrics = null;
  for (const timeMs of pinTimesMs) {
    const pinned = await client.driver("easyButtonPinAnimations", timeMs);
    metrics ??= await client.driver("easyButtonPixelMatchMetrics");
    const prefix = `production-${state}-t${timeMs}`;
    await captureClip(client, join(artifactDir, `${prefix}.png`), metrics.root);
    for (const crop of crops) {
      await captureComponentClip(client, join(artifactDir, `${prefix}-${crop}.png`), metrics, crop);
    }
    frames.push({
      finishedAnimations: pinned.finishedAnimations,
      pinnedAnimations: pinned.pinned.length,
      settledTransitions: pinned.settledTransitions,
      timeMs,
    });
  }
  return { crops, frames, metrics };
}

async function captureComponentClip(client, path, metrics, key) {
  const component = metrics.components[key];
  if (!component?.exists) {
    throw new Error(`easy-button pixel-match crop is missing its component: ${key}`);
  }
  await captureClip(client, path, clipToBounds(component.rect, metrics.root));
}

async function captureClip(client, path, rect) {
  const result = await client.call("Page.captureScreenshot", {
    clip: { ...rect, scale: 1 },
    format: "png",
  });
  await writePng(path, result.data);
}

async function waitForIdle(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => easyButtonStateSettled(state, "idle") && state.buttonVisible,
    workflowTimeoutMs,
  );
}

// The swirl crossfades over 1600ms, so a read taken the instant a view state
// lands reports an interpolated opacity that equals neither endpoint. Gate on the
// settled field, or the captured frame is a function of when the poll happened.
async function waitForWorking(client, requestText, highlights) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "working") &&
      state.runRequestText === requestText &&
      state.highlights.length === highlights &&
      opacityMatches(state.swirl.opacity, swirlWorkingOpacity),
    workflowTimeoutMs,
  );
}

async function waitForTerminal(client, { artifacts = 0, highlights = 0, statusTone }) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.statusTone === statusTone &&
      state.artifacts.length === artifacts &&
      state.highlights.length === highlights &&
      opacityMatches(state.swirl.opacity, swirlCompleteOpacity),
    workflowTimeoutMs,
  );
}
