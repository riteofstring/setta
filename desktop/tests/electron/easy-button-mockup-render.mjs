/* global console */

// Renders docs/mockups/easy_button_pane_mockup.html in the same Electron binary,
// at the same viewport and device scale factor the Easy Button pane workflow uses,
// with the same animation-pinning probe. That makes its stills directly comparable
// to the pane's, and lets it emit the component delta table the pixel-match report
// is built on.
//
// Standalone while the expanded comparison gate is under construction: it emits
// mockup captures and deltas after the production workflow writes its metrics.
// The completed matrix will orchestrate this renderer from its required gate.
//
//   desktop/node_modules/.bin/electron desktop/tests/electron/easy-button-mockup-render.mjs \
//     --out .recordings/easy-button-phaseC/pixel-match \
//     --production-metrics .recordings/easy-button-phaseC/pixel-match/production-metrics.json

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow } from "electron";

import { writeEasyButtonImageDiffReport } from "./easy-button-pixel-image-report.mjs";
import {
  clipToBounds,
  compareEasyButtonMetrics,
  formatEasyButtonMetricDeltas,
  metricPairs,
  pinTimesMs,
  pixelMatchSpeechCapturePlan,
  synchronizedCaptureFailureText,
  synchronizedCaptureText,
  writePng,
} from "./easy-button-pixel-match-report.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "../..");
const repoRoot = resolve(desktopRoot, "..");
const mockupPath = join(repoRoot, "docs", "mockups", "easy_button_pane_mockup.html");

// Width matches the workflow's desktop viewport, so both rails use the same
// 260px / 340px track. Height is taller only because the mockup is a document
// with prose above and below the pane; nothing in its CSS reads viewport height,
// while the production pane sizes its button well from `min(24vw, 24vh)` and so
// must be measured at exactly 1440x900.
const mockupViewport = { deviceScaleFactor: 1, height: 1240, mobile: false, width: 1440 };

// `pin` only sees the animations and transitions that exist when it runs, so the
// state's own crossfades have to have been created before it is called. A frame
// or two would do; this is slack, not a settle time — pin lands every finite
// animation on its endpoint itself.
const stateSettleMs = 700;

const captureStates = [
  ...pixelMatchSpeechCapturePlan,
  {
    crops: ["actionSlot", "audioToggle", "captionSlot", "control", "stopButton", "swirl"],
    state: "working",
  },
  {
    crops: [
      "artifactCard",
      "audioToggle",
      "captionSlot",
      "control",
      "highlightItem",
      "inputWrap",
      "summaryReplay",
      "swirl",
    ],
    state: "complete",
  },
];

// An Electron main process with no window never exits on its own: nothing closes,
// so `window-all-closed` never fires and the run loop spins forever. Anything that
// can throw or hang therefore has to end in an explicit `app.exit`, or the script
// leaves a headless process behind that a user cannot see or close.
const watchdogMs = 120_000;

app.disableHardwareAcceleration();

process.on("uncaughtException", (error) => exitWithError(error));
process.on("unhandledRejection", (error) => exitWithError(error));

// Not `await app.whenReady()` at module scope: Electron holds the `ready` event
// until an ESM entry point finishes evaluating, so awaiting it there deadlocks.
app.whenReady().then(main);

async function main() {
  const watchdog = setTimeout(() => {
    exitWithError(new Error(`easy-button mockup render exceeded ${watchdogMs}ms`));
  }, watchdogMs);
  try {
    // Parsed here, not at module scope. A module-scope throw happens before this
    // callback is ever registered, so nothing would be left to call `app.exit`.
    const options = parseArgs(process.argv.slice(2));
    const metrics = await renderMockup(options.out);
    await writeJsonFile(join(options.out, "mockup-metrics.json"), metrics);
    if (options.productionMetrics) {
      await writeComparisonReports(options.out, options.productionMetrics, metrics);
    }
    clearTimeout(watchdog);
    console.log(`Easy Button mockup rendered: ${options.out}`);
    app.exit(0);
  } catch (error) {
    clearTimeout(watchdog);
    exitWithError(error);
  }
}

function exitWithError(error) {
  console.error(error instanceof Error ? error.stack : String(error));
  app.exit(1);
}

async function renderMockup(outDir) {
  const window = new BrowserWindow({
    height: mockupViewport.height,
    show: false,
    webPreferences: { backgroundThrottling: false },
    width: mockupViewport.width,
  });
  const { webContents } = window;
  await webContents.loadFile(mockupPath);
  webContents.debugger.attach("1.3");
  await webContents.debugger.sendCommand("Page.enable");
  await webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", mockupViewport);
  await installBrowserScripts(webContents);
  await evaluate(webContents, "__settaEasyButtonMockup.freezeDemoTimers()");

  const states = {};
  for (const step of captureStates) {
    states[step.state] = await captureMockupState(webContents, outDir, step);
  }
  return { states, surface: "mockup", viewport: mockupViewport };
}

async function installBrowserScripts(webContents) {
  for (const name of ["easy-button-pixel-match-probe.js", "easy-button-mockup-driver.js"]) {
    await webContents.executeJavaScript(await readFile(join(scriptDir, name), "utf8"));
  }
}

async function captureMockupState(webContents, outDir, { crops, state }) {
  const paneState = await evaluate(
    webContents,
    `__settaEasyButtonMockup.gotoState(${quote(state)}, ${quote(mockupFixture(state))})`,
  );
  if (paneState.stateKey !== state) {
    throw new Error(`easy-button mockup did not enter ${state}: ${JSON.stringify(paneState)}`);
  }
  await delay(stateSettleMs);
  const frames = [];
  let metrics = null;
  for (const timeMs of pinTimesMs) {
    const pinned = await evaluate(webContents, `__settaEasyButtonMockup.pin(${timeMs})`);
    metrics ??= await evaluate(webContents, "__settaEasyButtonMockup.measure()");
    const prefix = `mockup-${state}-t${timeMs}`;
    await captureClip(webContents, join(outDir, `${prefix}.png`), metrics.root);
    for (const crop of crops) {
      await captureCrop(webContents, join(outDir, `${prefix}-${crop}.png`), metrics, crop);
    }
    frames.push({
      finishedAnimations: pinned.finishedAnimations,
      pinnedAnimations: pinned.pinned.length,
      settledTransitions: pinned.settledTransitions,
      timeMs,
    });
  }
  return { crops, frames, metrics, paneState };
}

function mockupFixture(state) {
  return {
    captureError: state === "captureFailure" ? synchronizedCaptureFailureText : "",
    captureText: state === "committing" ? synchronizedCaptureText : "",
  };
}

async function captureCrop(webContents, path, metrics, key) {
  const component = metrics.components[key];
  if (!component?.exists) {
    throw new Error(`easy-button mockup crop is missing its component: ${key}`);
  }
  await captureClip(webContents, path, clipToBounds(component.rect, metrics.root));
}

async function captureClip(webContents, path, rect) {
  const result = await webContents.debugger.sendCommand("Page.captureScreenshot", {
    captureBeyondViewport: true,
    clip: { ...rect, scale: 1 },
    format: "png",
  });
  await writePng(path, result.data);
}

async function writeComparisonReports(outDir, productionMetricsPath, mockup) {
  const production = JSON.parse(await readFile(productionMetricsPath, "utf8"));
  const pairs = metricPairs.map((pair) => ({
    ...pair,
    rows: compareEasyButtonMetrics(
      requireState(production, pair.production),
      requireState(mockup, pair.mockup),
    ),
  }));
  await writeJsonFile(join(outDir, "delta.json"), { pairs });
  const markdown = pairs
    .map((pair) =>
      formatEasyButtonMetricDeltas(
        `production:${pair.production} vs mockup:${pair.mockup}`,
        pair.rows,
      ),
    )
    .join("\n");
  await writeFile(
    join(outDir, "delta.md"),
    `# Easy Button pixel-match component deltas\n\n${markdown}`,
  );
  console.log(
    `Component deltas: ${pairs.map((pair) => `${pair.production}=${pair.rows.length}`).join(" ")}`,
  );
  const imageReport = await writeEasyButtonImageDiffReport({
    mockup,
    outDir,
    pairs: metricPairs,
    production,
  });
  console.log(
    `Image deltas: ${imageReport.summary.changedCropCount}/${imageReport.summary.comparedCropCount} crops; ${imageReport.summary.dimensionMismatchCount} dimension mismatches`,
  );
}

function requireState(metrics, state) {
  const captured = metrics.states[state];
  if (!captured) {
    throw new Error(`easy-button ${metrics.surface} metrics have no ${state} state`);
  }
  return captured.metrics;
}

async function evaluate(webContents, expression) {
  return webContents.executeJavaScript(expression);
}

function quote(value) {
  return JSON.stringify(value);
}

async function writeJsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = { out: "", productionMetrics: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out") {
      index += 1;
      parsed.out = resolve(argv[index] ?? "");
    } else if (argv[index] === "--production-metrics") {
      index += 1;
      parsed.productionMetrics = resolve(argv[index] ?? "");
    }
  }
  if (!parsed.out) {
    throw new Error("easy-button mockup render requires --out <dir>");
  }
  return parsed;
}
