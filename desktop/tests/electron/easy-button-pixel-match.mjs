// Deterministic frames and measured component geometry for the Easy Button pane.
//
// docs/plans/easy-button-speech-20260709.md supersedes the earlier decision not
// to image-diff these frames. Pinning time turns each comparison into two stable
// stills; the component metrics and captures here are the inputs to that gate.
//
// The mockup is a fixed 1180x660 card and the real pane fills a workspace column,
// so a whole-pane diff would be noise. Both rails use the same 260px / 340px
// track at this viewport, which is what makes the per-component crops comparable.

import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import {
  createElectronFixture,
  clickEnabledButtonByAria,
  desktopRoot,
  dispatchKeyEvent,
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
import {
  clipToBounds,
  pinTimesMs,
  pixelMatchCapturePlan,
  synchronizedCaptureFailureText,
  synchronizedCaptureText,
  writePng,
} from "./easy-button-pixel-match-report.mjs";
import { opacityMatches } from "./easy-button-pane-visual-assertions.mjs";
import { startSpeechProviderFixture } from "./speech-provider-fixture.mjs";

const swirlWorkingOpacity = 0.85;
const swirlCompleteOpacity = 0.2;
const browserFixturePath = new URL("./speech-capture-browser-fixture.js", import.meta.url);
const mockupRendererPath = new URL("./easy-button-mockup-render.mjs", import.meta.url);

export async function runEasyButtonPixelMatchCaptures({ artifactDir, visible }) {
  const fixture = await createElectronFixture("easy-button-pixel-match");
  let speechProvider = null;
  let context = null;
  let metrics;
  try {
    speechProvider = await startSpeechProviderFixture();
    context = await launchElectronCdpContext({
      artifactDir,
      electronArgs: ["--use-fake-device-for-media-stream"],
      extraEnv: {
        OPENAI_API_KEY: speechProvider.apiKey,
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
        SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      },
      fixture,
      visible,
    });
    await installBrowserFixture(context.client);
    await context.client.call("Page.reload", { ignoreCache: true });
    await context.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    await context.client.installDriver();
    await ensureWorkspaceOpen(context.client);
    await openEasyButtonFromShortcut(context.client);

    const states = await captureProductionStates(context.client, artifactDir);
    metrics = { states, surface: "production", viewport: desktopViewport };
    await writeJson(join(artifactDir, "production-metrics.json"), metrics);
    speechProvider.assertHealthy();
    if (
      speechProvider.requests.length !== 1 ||
      speechProvider.requests[0]?.path !== "/v1/realtime/client_secrets"
    ) {
      throw new Error(
        `easy-button pixel-match made unexpected OpenAI calls: ${JSON.stringify(speechProvider.requests)}`,
      );
    }
  } finally {
    try {
      await stopElectronCdpContext(context);
    } finally {
      try {
        await speechProvider?.close();
      } finally {
        await rm(fixture.tempRoot, { force: true, recursive: true });
      }
    }
  }
  await runMockupComparison(artifactDir);
  return metrics;
}

async function runMockupComparison(artifactDir) {
  const electron = process.platform === "win32" ? "electron.cmd" : "electron";
  const child = spawn(
    join(desktopRoot, "node_modules", ".bin", electron),
    [
      fileURLToPath(mockupRendererPath),
      "--out",
      artifactDir,
      "--production-metrics",
      join(artifactDir, "production-metrics.json"),
    ],
    { cwd: desktopRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const output = [];
  child.stdout.on("data", (data) => output.push(data.toString()));
  child.stderr.on("data", (data) => output.push(data.toString()));
  const { code, signal } = await new Promise((resolvePromise) => {
    child.once("exit", (exitCode, exitSignal) =>
      resolvePromise({ code: exitCode, signal: exitSignal }),
    );
  });
  if (signal || code !== 0) {
    throw new Error(`easy-button mockup comparison failed (${signal ?? code}): ${output.join("")}`);
  }
}

async function captureProductionStates(client, artifactDir) {
  const states = {};
  for (const step of pixelMatchCapturePlan) {
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
  const advance = stateAdvancers[state];
  if (!advance) {
    throw new Error(`unknown easy-button pixel-match state: ${state}`);
  }
  return advance(client);
}

const stateAdvancers = {
  captureFailure: advanceToCaptureFailure,
  committing: advanceToCommitting,
  completedArtifacts: advanceToCompletedArtifacts,
  completedHighlights: advanceToCompletedHighlights,
  connecting: advanceToConnecting,
  failed: advanceToFailed,
  idle: waitForIdle,
  listening: advanceToListening,
  requestingPermission: advanceToRequestingPermission,
  stopped: advanceToStopped,
  working: advanceToWorking,
};

async function advanceToRequestingPermission(client) {
  await clickEnabledButtonByAria(client, "Start voice request");
  return waitForCaptureState(client, "requesting-permission");
}

async function advanceToConnecting(client) {
  await callBrowserFixture(client, "allowMicrophone");
  return waitForCaptureState(client, "connecting");
}

async function advanceToListening(client) {
  await callBrowserFixture(client, "openProviderSession");
  return waitForCaptureState(client, "listening");
}

async function advanceToCommitting(client) {
  await clickEnabledButtonByAria(client, "Finish voice request");
  await waitForCaptureState(client, "committing");
  await callBrowserFixture(client, "emitDelta", synchronizedCaptureText);
  return waitForCaptureState(client, "committing", synchronizedCaptureText);
}

async function advanceToCaptureFailure(client) {
  await callBrowserFixture(client, "disconnect");
  return waitForCaptureState(client, "failed", "", synchronizedCaptureFailureText);
}

async function advanceToWorking(client) {
  await restoreIdleCapture(client);
  await submitEasyButtonRequest(client, "easy run working narrator cadence");
  return waitForWorking(client, "easy run working narrator cadence", 2);
}

async function advanceToStopped(client) {
  await clickEasyButtonStop(client);
  return waitForTerminal(client, { highlights: 2, statusTone: "stopped" });
}

async function advanceToCompletedArtifacts(client) {
  await submitEasyButtonRequest(client, "easy run phase3 artifacts workflow");
  return waitForTerminal(client, { artifacts: 4, statusTone: "completed" });
}

async function advanceToCompletedHighlights(client) {
  await submitEasyButtonRequest(client, "easy run phase4 narrator workflow");
  return waitForTerminal(client, { highlights: 2, statusTone: "completed" });
}

async function advanceToFailed(client) {
  await submitEasyButtonRequest(client, "easy run phase5 artifact cap workflow");
  return waitForTerminal(client, { artifacts: 20, statusTone: "failed" });
}

async function installBrowserFixture(client) {
  const source = await readFile(browserFixturePath, "utf8");
  await client.call("Page.addScriptToEvaluateOnNewDocument", { source });
}

async function callBrowserFixture(client, method, ...args) {
  return client.evaluate(
    `globalThis.__settaSpeechCaptureFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function waitForCaptureState(client, capture, captureText = "", captureError = "") {
  return waitForState(
    client,
    "globalThis.__settaSpeechCaptureFixture.state()",
    (state) =>
      state.capture === capture &&
      state.captureLine === captureText &&
      state.captureError === captureError,
    workflowTimeoutMs,
  );
}

async function restoreIdleCapture(client) {
  await callBrowserFixture(client, "holdMicrophone");
  await clickEnabledButtonByAria(client, "Retry voice request");
  await waitForCaptureState(client, "requesting-permission");
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape" });
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape", type: "keyUp" });
  return waitForIdle(client);
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
    (state) =>
      easyButtonStateSettled(state, "idle") &&
      state.buttonVisible &&
      state.speechStatus === "configured",
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
