#!/usr/bin/env node
/* global console */

/**
 * Drives the Setta 4 graph canvas in a real WebGL2 context.
 *
 * This is Phase 2's measurement workflow: it opens the committed harness page
 * in the production Electron renderer, runs the required scenarios at the tiers
 * in the performance matrix, and asserts the frame budgets, the canvas-pixel
 * checks, and the scenario-specific properties (burst coalescing, cold-replay
 * equality, per-frame navigation cost, occlusion sleep).
 *
 * It needs no backend state and no Director endpoint: the graph is fed the
 * committed packed fixtures, which is what makes the numbers comparable between
 * builds.
 */

import { basename, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  startChromiumTrace,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  applyDirectorGraphTier,
  assertDirectorGraphRun,
  directorGraphReportBudgetMs,
  directorGraphTierNames,
  directorGraphTiers,
} from "./director-graph-performance-helpers.mjs";

const workflowName = "director-graph-renderer-performance";
const harnessVersion = "setta-director-graph-harness-v1";
const readyTimeoutMs = 30_000;
const viewportTimeoutMs = 20_000;
const scenarioTimeoutMs = 900_000;
const tracedTier = "desktop-4k";
const tracedScenario = "director-and-worker-interleaved";

const { workflowArgs, harnessArgv } = splitArgs(process.argv.slice(2));
const options = parseElectronHarnessArgs(harnessArgv);

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/${basename(import.meta.url)} [--skip-build] [--visible] [--artifact-dir <dir>] [--tier <name>] [--scenario <name>] [--soak-ms <ms>]

Tiers: ${directorGraphTierNames().join(", ")}`,
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const selectedTiers = selectTiers(workflowArgs.tiers);
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      // The laptop tier is measured on the real window at the real device pixel
      // ratio, so the window is opened at that size rather than emulated into it.
      SETTA_E2E_WINDOW_HEIGHT: String(laptopTier().height),
      SETTA_E2E_WINDOW_WIDTH: String(laptopTier().width),
    },
    fixture,
    visible: options.visible,
  });
  const { client } = context;
  await openHarnessPage(client);
  const environment = await waitForHarnessReady(client);
  if (!environment.webgl2) {
    throw new Error(`harness page has no WebGL2 context: ${JSON.stringify(environment)}`);
  }
  if (!environment.gpuTimerQuery) {
    throw new Error(`GPU timer queries are unavailable: ${JSON.stringify(environment)}`);
  }

  const runs = [];
  for (const tier of selectedTiers) {
    const scenarios = selectScenarios(tier, workflowArgs.scenarios);
    if (scenarios.length === 0) {
      continue;
    }
    await applyDirectorGraphTier(client, tier);
    const tierEnvironment = await waitForTierViewport(client, tier);
    for (const scenario of scenarios) {
      const run = await runScenario(client, scenario, workflowArgs.soakMs);
      assertDirectorGraphRun(run, tier);
      runs.push({ tier: tier.name, tierLabel: tier.label, ...run });
      console.log(formatRun(tier, run));
    }
    await captureScreenshot(client, join(artifactDir, `tier-${tier.name}.png`));
    await writeJson(join(artifactDir, `tier-${tier.name}-environment.json`), tierEnvironment);
  }

  if (runs.length === 0) {
    throw new Error("no director graph scenarios matched the requested filters");
  }

  await writeJson(join(artifactDir, "graph-performance.json"), {
    environment,
    runs,
    workflow: workflowName,
  });
  await writeJson(join(artifactDir, "graph-performance-summary.json"), runs.map(compactRun));
  await captureProfile(client, selectedTiers, workflowArgs.scenarios);
  await assertRendererStayedQuiet(artifactDir);
  console.log(`${workflowName} passed ${runs.length} scenario runs`);
} catch (error) {
  process.exitCode = 1;
  console.error(`${workflowName} failed: ${error instanceof Error ? error.stack : String(error)}`);
  if (context) {
    console.error(context.electron.logs.join("").slice(-4000));
  }
} finally {
  await stopElectronCdpContext(context);
}

function splitArgs(argv) {
  const workflowArgs = { scenarios: [], soakMs: 0, tiers: [] };
  const harnessArgv = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tier" || arg === "--scenario" || arg === "--soak-ms") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      if (arg === "--tier") {
        workflowArgs.tiers.push(value);
      } else if (arg === "--scenario") {
        workflowArgs.scenarios.push(value);
      } else {
        workflowArgs.soakMs = Number(value);
        if (!Number.isFinite(workflowArgs.soakMs) || workflowArgs.soakMs <= 0) {
          throw new Error(`--soak-ms must be a positive number of milliseconds: ${value}`);
        }
      }
      continue;
    }
    harnessArgv.push(arg);
  }
  return { workflowArgs, harnessArgv };
}

function laptopTier() {
  const tier = directorGraphTiers.find((candidate) => candidate.name === "laptop");
  if (!tier) {
    throw new Error("the laptop tier is missing from the performance matrix");
  }
  return tier;
}

function selectTiers(requested) {
  if (requested.length === 0) {
    return directorGraphTiers;
  }
  return requested.map((name) => {
    const tier = directorGraphTiers.find((candidate) => candidate.name === name);
    if (!tier) {
      throw new Error(`unknown tier ${name}; known tiers: ${directorGraphTierNames().join(", ")}`);
    }
    return tier;
  });
}

function selectScenarios(tier, requested) {
  if (requested.length === 0) {
    return tier.scenarios;
  }
  return tier.scenarios.filter((scenario) => requested.includes(scenario));
}

async function openHarnessPage(client) {
  const url = await client.evaluate(
    `(() => new URL("director-graph.html", window.location.href).toString())()`,
  );
  await client.call("Page.navigate", { url });
}

async function waitForHarnessReady(client) {
  const environment = await waitForState(
    client,
    `(() => window.__settaDirectorGraphHarness?.environment() ?? { ready: false })()`,
    (value) => value.ready === true,
    readyTimeoutMs,
  );
  if (environment.version !== harnessVersion) {
    throw new Error(
      `harness page reported version ${environment.version}, want ${harnessVersion}. Rebuild the desktop app.`,
    );
  }
  return environment;
}

async function waitForTierViewport(client, tier) {
  return waitForState(
    client,
    `(() => window.__settaDirectorGraphHarness?.environment() ?? { ready: false })()`,
    (value) => {
      if (value.ready !== true) {
        return false;
      }
      // The graph's own viewport, not the DOM box: the resize observer that
      // feeds it runs a frame later, and a check taken before it lands would
      // letterbox the previous tier's frame.
      const drawing = value.quality?.viewport;
      if (!drawing) {
        return false;
      }
      if (!tier.emulated) {
        return drawing.width > 0 && drawing.height > 0 && value.surface.width === drawing.width;
      }
      return (
        drawing.width === tier.width &&
        drawing.height === tier.height &&
        value.quality.devicePixelRatio === tier.deviceScaleFactor
      );
    },
    viewportTimeoutMs,
  );
}

/**
 * Starts the scenario and collects its result by polling. A soak runs for
 * minutes, and a single awaited evaluation would time the debugging channel out
 * long before it finished.
 */
async function runScenario(client, scenario, soakMs) {
  const overrides = soakMs > 0 ? { sustainedMs: soakMs } : {};
  const started = await client.evaluate(
    `window.__settaDirectorGraphHarness.start(${JSON.stringify(scenario)}, ${JSON.stringify(
      overrides,
    )})`,
  );
  if (started.state !== "running") {
    throw new Error(`scenario ${scenario} did not start: ${JSON.stringify(started)}`);
  }
  const status = await waitForState(
    client,
    `(() => {
      const status = window.__settaDirectorGraphHarness.status();
      return status.state === "done"
        ? status
        : { state: status.state, scenario: status.scenario, run: null, error: status.error };
    })()`,
    (value) => value.state === "done" || value.state === "failed",
    scenarioTimeoutMs,
  );
  if (status.state !== "done" || status.run === null) {
    throw new Error(`scenario ${scenario} failed: ${status.error}`);
  }
  return status.run;
}

async function captureProfile(client, tiers, requestedScenarios) {
  const tier = tiers.find((candidate) => candidate.name === tracedTier);
  if (!tier || selectScenarios(tier, requestedScenarios).includes(tracedScenario) === false) {
    console.log(`profile skipped: ${tracedTier}/${tracedScenario} was not in this run`);
    return;
  }
  await applyDirectorGraphTier(client, tier);
  await waitForTierViewport(client, tier);
  const trace = await startChromiumTrace(client, join(artifactDir, "trace-desktop-4k.json"));
  const run = await runScenario(client, tracedScenario, 0);
  const stopped = await trace.stop();
  await writeJson(join(artifactDir, "profile-desktop-4k.json"), {
    scenario: tracedScenario,
    tier: tier.name,
    traceEventCount: stopped.eventCount,
    traceSummary: stopped.summary,
    // Tracing itself costs frame time, so these numbers are the profile's, not
    // the tier's accepted result.
    tracedSummary: run.summary,
  });
  console.log(`profile captured: ${stopped.eventCount} trace events`);
}

/**
 * An exception thrown inside the frame loop kills that frame and nothing else:
 * the scenario still reports frames, still passes its budgets, and still draws
 * whatever the last good frame left. The recorded console is the only place it
 * surfaces, so the workflow reads it rather than trusting the numbers.
 */
async function assertRendererStayedQuiet(directory) {
  const entries = await readJsonLinesOptional(join(directory, "renderer-console.jsonl"));
  const errors = entries.filter((entry) => entry.level >= 3);
  if (errors.length === 0) {
    return;
  }
  const distinct = [...new Set(errors.map((entry) => entry.message))];
  throw new Error(
    `the graph renderer logged ${errors.length} errors: ${JSON.stringify(distinct.slice(0, 5))}`,
  );
}

function formatRun(tier, run) {
  const gpu = run.summary.gpuFrameMs;
  return [
    `  ${tier.name}/${run.scenario}`,
    `frames=${run.summary.frames}`,
    `budget=${round(directorGraphReportBudgetMs(run))}ms`,
    `cpu p50/p95/p99=${round(run.summary.cpuFrameMs.p50)}/${round(
      run.summary.cpuFrameMs.p95,
    )}/${round(run.summary.cpuFrameMs.p99)}ms`,
    `gpu p50/p95/p99=${gpu === null ? "n/a" : `${round(gpu.p50)}/${round(gpu.p95)}/${round(gpu.p99)}`}ms`,
    `delta p95=${round(run.summary.frameDeltaMs.p95)}ms`,
    `scale=${round(run.summary.renderScaleMinimum)}-${round(run.summary.renderScaleMaximum)}`,
    `tier=${run.quality.tier}`,
    `pixels=${run.pixel.ok ? "ok" : run.pixel.failures.join("+")}`,
  ].join(" ");
}

function compactRun(run) {
  return {
    tier: run.tier,
    scenario: run.scenario,
    kind: run.kind,
    frames: run.summary.frames,
    durationMs: Math.round(run.durationMs),
    frameBudgetMs: round(directorGraphReportBudgetMs(run)),
    adaptationBudgetMs: round(run.summary.adaptationBudgetMs),
    cpuFrameMs: roundQuantiles(run.summary.cpuFrameMs),
    gpuFrameMs: run.summary.gpuFrameMs === null ? null : roundQuantiles(run.summary.gpuFrameMs),
    frameDeltaMs: roundQuantiles(run.summary.frameDeltaMs),
    marks: Object.fromEntries(
      Object.entries(run.summary.marks).map(([mark, values]) => [mark, roundQuantiles(values)]),
    ),
    longTasks: run.summary.longTasks,
    longTaskTotalMs: round(run.summary.longTaskTotalMs),
    framesOver50Ms: run.summary.framesOverDroppedThreshold,
    slowFrameRatio: round(slowFrameRatio(run)),
    renderScale: [round(run.summary.renderScaleMinimum), round(run.summary.renderScaleMaximum)],
    qualityTier: run.quality.tier,
    tierChanges: run.summary.tierChanges,
    post: [run.quality.postWidth, run.quality.postHeight],
    scene: [run.quality.sceneWidth, run.quality.sceneHeight],
    viewport: run.viewport,
    heapMb: {
      start: megabytes(run.heap.startBytes),
      peak: megabytes(run.heap.peakBytes),
      end: megabytes(run.heap.endBytes),
    },
    nodes: run.nodeCount,
    edges: run.edgeCount,
    turns: run.turnCount,
    pixel: {
      ok: run.pixel.ok,
      failures: run.pixel.failures,
      size: [run.pixel.width, run.pixel.height],
      peakLuminance: round(run.pixel.peakLuminance),
      litCellRatio: round(run.pixel.litCellRatio),
      contentCentroid: [round(run.pixel.contentCentroidX), round(run.pixel.contentCentroidY)],
      contentSpan: [round(run.pixel.contentSpanX), round(run.pixel.contentSpanY)],
      frameSpan: [round(run.pixel.frameSpanX), round(run.pixel.frameSpanY)],
    },
    details: run.details,
  };
}

/** Frames over 1.25× the resolved display period, the committed slow-frame rule. */
function slowFrameRatio(run) {
  const threshold = directorGraphReportBudgetMs(run) * 1.25;
  const deltas = run.summary.frameDeltasMs;
  if (deltas.length === 0) {
    return 0;
  }
  return deltas.filter((value) => value > threshold).length / deltas.length;
}

function megabytes(bytes) {
  return typeof bytes === "number" ? Math.round((bytes / 1_048_576) * 10) / 10 : null;
}

function roundQuantiles(values) {
  return {
    p50: round(values.p50),
    p95: round(values.p95),
    p99: round(values.p99),
    maximum: round(values.maximum),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
