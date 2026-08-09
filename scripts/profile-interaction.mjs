/**
 * Repeatable development/production interaction profiler.
 *
 * Drives the public visual-matrix playground route with synthetic pointer
 * gestures (top-level XYFlow drag, nested structural sort drag, same-parent
 * nested freeform drag) at 0.5x, 1x, and 2x workspace zoom, and records
 * activation timings, animation-frame gaps, long tasks, and Chrome
 * style/layout counters. Every gesture is centered in the browser window
 * (measured handle, corrected viewport query), the canvas is scrolled toward
 * the window center before every pass, a pass fails if the page scrolls
 * mid-gesture (window auto-scroll would drag the document under the pointer),
 * and passes after the first restore the canonical fixture arrangement
 * through the page's matrix reset control so commits cannot rearrange later
 * passes. Results append to perf/interaction-profile.md and full traces land
 * in perf/interaction-traces/.
 *
 * Usage: node scripts/profile-interaction.mjs [--label baseline]
 *        [--mode development|production|both] [--passes 3] [--zoom 0.5,1,2]
 *        [--scenario name[,name]] [--cpu-throttle 1] [--skip-build]
 */

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "@playwright/test";

import {
  analyzeGestureSample,
  cdpMetricsDelta,
  PROBE_INIT_SCRIPT,
} from "./lib/interaction-probe.mjs";
import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const VIEWPORT = { height: 1000, width: 1440 };
const MOVE_COUNT = 96;
const MOVE_PAUSE_MS = 7;
const HOVER_SETTLE_MS = 150;
const COMMIT_SETTLE_MS = 250;
const SERVER_READY_TIMEOUT_MS = 180_000;
const DEFAULT_ZOOMS = [0.5, 1, 2];
// Minimum distance from every window edge for the whole gesture, keeping the
// pointer outside dnd-kit's window auto-scroll region.
const WINDOW_EDGE_MARGIN_PX = 250;

/**
 * One stable fixture: the public-API-only visual-matrix route. Focus is a
 * document-space seed near the dragged section; the runner measures the real
 * movement handle and renavigates so the gesture midpoint sits at the canvas
 * center. Vector is the screen-space out-and-back drag extent.
 */
const SCENARIOS = [
  {
    article: "Default chrome",
    focus: { x: 144, y: 108 },
    name: "root-drag",
    owner: "root-layout",
    vector: { x: 150, y: 90 },
    workload: "Top-level XYFlow spatial drag of the root leaf section.",
  },
  {
    article: "Nested leaf",
    focus: { x: 200, y: 560 },
    name: "structural-sort",
    owner: "section-structure",
    vector: { x: 0, y: 120 },
    workload: "dnd-kit nested structural drag inside the vertical ordered group.",
  },
  {
    article: "Freeform note A",
    focus: { x: 1_188, y: 328 },
    name: "nested-freeform",
    owner: "section-structure",
    vector: { x: 26, y: 20 },
    workload: "Same-parent nested freeform drag inside the freeform container.",
  },
];

const MODE_PORTS = { development: 4_173, production: 4_174 };

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} requires a value.`);
  }
  return value;
}

function parseModes() {
  const mode = argValue("mode", "both");
  if (mode === "both") {
    return ["development", "production"];
  }
  if (mode !== "development" && mode !== "production") {
    throw new Error(`--mode must be development, production, or both, not ${mode}.`);
  }
  return [mode];
}

function parseScenarios() {
  const filter = argValue("scenario", "");
  if (filter === "") {
    return SCENARIOS;
  }
  const names = filter.split(",");
  const selected = SCENARIOS.filter((scenario) => names.includes(scenario.name));
  if (selected.length !== names.length) {
    const known = SCENARIOS.map((scenario) => scenario.name).join(", ");
    throw new Error(`Unknown scenario in ${filter}. Known scenarios: ${known}.`);
  }
  return selected;
}

function parseConfiguration() {
  const label = argValue("label", "baseline");
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error("The label must be a non-empty kebab-case identifier.");
  }
  const passes = Number(argValue("passes", "3"));
  const cpuThrottle = Number(argValue("cpu-throttle", "1"));
  const zooms = argValue("zoom", DEFAULT_ZOOMS.join(",")).split(",").map(Number);
  if (![passes, cpuThrottle, ...zooms].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("--passes, --cpu-throttle, and --zoom values must be positive numbers.");
  }
  return {
    cpuThrottle,
    label,
    modes: parseModes(),
    passes,
    scenarios: parseScenarios(),
    skipBuild: process.argv.includes("--skip-build"),
    zooms,
  };
}

async function serverReachable(baseUrl) {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverReachable(baseUrl)) {
      return;
    }
    await delay(1_000);
  }
  throw new Error(`The playground did not become reachable at ${baseUrl}.`);
}

async function startServer(mode, skipBuild) {
  const baseUrl = `http://127.0.0.1:${String(MODE_PORTS[mode])}`;
  if (await serverReachable(baseUrl)) {
    return { baseUrl, server: null };
  }
  if (mode === "production" && !skipBuild) {
    runPnpm(["build"]);
  }
  const args =
    mode === "production" ? ["--filter", "@setta/workspace-playground", "preview"] : ["dev"];
  const server = spawn("corepack", ["pnpm", ...args], {
    cwd: repositoryRoot,
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer(baseUrl);
  return { baseUrl, server };
}

function stopServer(server) {
  if (server?.pid) {
    process.kill(-server.pid, "SIGTERM");
  }
}

function scenarioUrl(baseUrl, scenario, zoom, canvasBox, offset = { x: 0, y: 0 }) {
  const viewportX = canvasBox.width / 2 - scenario.focus.x * zoom + offset.x;
  const viewportY = canvasBox.height / 2 - scenario.focus.y * zoom + offset.y;
  const query = `zoom=${String(zoom)}&viewport-x=${String(viewportX)}&viewport-y=${String(viewportY)}`;
  return `${baseUrl}/?visual-matrix&${query}`;
}

/**
 * Scroll the canvas as close to the window center as the page allows and
 * return its box. The page header sits above the canvas, so without this
 * scroll the lower canvas rows fall below the window: synthetic pointer input
 * there reaches no element at all, and gestures near the window edge trigger
 * dnd-kit's window auto-scroll, which drags the document under the pointer
 * mid-gesture.
 */
async function centeredCanvasBox(page) {
  const canvas = page.getByRole("application", { name: "Visual matrix workspace canvas" });
  await canvas.evaluate((element) => {
    element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
  });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("The visual matrix canvas must expose browser geometry.");
  }
  const fitsWindow =
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= VIEWPORT.width &&
    box.y + box.height <= VIEWPORT.height;
  if (!fitsWindow) {
    throw new Error(
      "The visual matrix canvas must fit inside the profiler window after scrolling; " +
        "pointer input outside the window would silently measure nothing.",
    );
  }
  return box;
}

async function measureCanvas(page, baseUrl) {
  await page.goto(`${baseUrl}/?visual-matrix`);
  return centeredCanvasBox(page);
}

/**
 * Restore the canonical fixture state between passes. A gesture may commit a
 * document change (structural sorts committed reorders whenever window
 * auto-scroll displaced the release point; a freeform origin release commits
 * a snapped move), and a completed drag leaves the section selected, which
 * relocates its movement handle to the floating selected-state actions bar —
 * in this fixture an overlapping sibling occludes that bar. The reset control
 * clears selection and restores the document so every pass starts identical.
 * Clicking the control scrolls the page; callers must re-measure the canvas
 * box afterwards.
 */
async function resetMatrixDocument(page) {
  await page.getByRole("button", { name: "Reset matrix document" }).click();
  await page.getByText("Reset the matrix document.", { exact: true }).first().waitFor();
  await delay(COMMIT_SETTLE_MS);
}

async function movementHandleBox(page, scenario) {
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  const handle = workspace
    .getByRole("article", { name: scenario.article })
    .getByRole("button", { name: `Move ${scenario.article}` })
    .first();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`The ${scenario.name} movement handle must expose browser geometry.`);
  }
  return box;
}

async function waitForScenarioArticle(page, scenario) {
  await page
    .getByRole("region", { exact: true, name: "Visual matrix workspace" })
    .getByRole("article", { name: scenario.article })
    .first()
    .waitFor();
}

/**
 * Navigate so the measured gesture midpoint sits at the canvas center. The
 * authored scenario focus is only a seed: it drifts whenever fixture chrome
 * or layout changes, and a gesture that ends up near a window edge triggers
 * dnd-kit's window auto-scroll, which both contaminates the measurement and
 * moves the release point to a different document location. Measuring the
 * real handle and renavigating with a corrected viewport keeps every cell
 * measuring the gesture it claims to measure.
 */
async function navigateToCenteredGesture(page, baseUrl, scenario, zoom, canvasBox) {
  await page.goto(scenarioUrl(baseUrl, scenario, zoom, canvasBox));
  await waitForScenarioArticle(page, scenario);
  const seedCanvas = await centeredCanvasBox(page);
  const seedHandle = await movementHandleBox(page, scenario);
  const offset = {
    x:
      seedCanvas.x +
      seedCanvas.width / 2 -
      seedHandle.x -
      seedHandle.width / 2 -
      scenario.vector.x / 2,
    y:
      seedCanvas.y +
      seedCanvas.height / 2 -
      seedHandle.y -
      seedHandle.height / 2 -
      scenario.vector.y / 2,
  };
  await page.goto(scenarioUrl(baseUrl, scenario, zoom, canvasBox, offset));
  await waitForScenarioArticle(page, scenario);
}

async function gestureStartPoint(page, scenario, canvasBox) {
  const box = await movementHandleBox(page, scenario);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const inside =
    point.x > canvasBox.x &&
    point.x < canvasBox.x + canvasBox.width &&
    point.y > canvasBox.y &&
    point.y < canvasBox.y + canvasBox.height;
  if (!inside) {
    throw new Error(`The ${scenario.name} movement handle is outside the visible canvas.`);
  }
  const xExtents = [box.x, box.x + box.width, point.x + scenario.vector.x];
  const yExtents = [box.y, box.y + box.height, point.y + scenario.vector.y];
  const clearOfWindowEdges =
    Math.min(...xExtents) >= WINDOW_EDGE_MARGIN_PX &&
    Math.max(...xExtents) <= VIEWPORT.width - WINDOW_EDGE_MARGIN_PX &&
    Math.min(...yExtents) >= WINDOW_EDGE_MARGIN_PX &&
    Math.max(...yExtents) <= VIEWPORT.height - WINDOW_EDGE_MARGIN_PX;
  if (!clearOfWindowEdges) {
    throw new Error(
      `The ${scenario.name} gesture runs within ${String(WINDOW_EDGE_MARGIN_PX)} px of a window ` +
        "edge, inside dnd-kit's window auto-scroll region. Fix the scenario seed focus.",
    );
  }
  return point;
}

function gesturePath(start, vector) {
  const points = [];
  const half = MOVE_COUNT / 2;
  for (let step = 1; step <= MOVE_COUNT; step += 1) {
    const progress = step <= half ? step / half : (MOVE_COUNT - step) / half;
    points.push({ x: start.x + vector.x * progress, y: start.y + vector.y * progress });
  }
  return points;
}

async function runPass(page, cdp, scenario, canvasBox) {
  const start = await gestureStartPoint(page, scenario, canvasBox);
  await page.mouse.move(start.x, start.y);
  await delay(HOVER_SETTLE_MS);
  const { metrics: cdpBefore } = await cdp.send("Performance.getMetrics");
  await page.evaluate("window.__settaInteractionProbe.begin()");
  // Let the probe record a few pre-gesture frames so the first gap after
  // pointer-down has an anchor spanning the activation stall.
  await delay(50);
  await page.mouse.down();
  for (const point of gesturePath(start, scenario.vector)) {
    await page.mouse.move(point.x, point.y);
    await delay(MOVE_PAUSE_MS);
  }
  await page.mouse.up();
  await delay(COMMIT_SETTLE_MS);
  const sample = await page.evaluate("window.__settaInteractionProbe.end()");
  const { metrics: cdpAfter } = await cdp.send("Performance.getMetrics");
  const metrics = analyzeGestureSample(sample);
  if (metrics.moveCount !== MOVE_COUNT) {
    throw new Error(
      `The ${scenario.name} gesture recorded ${String(metrics.moveCount)} pointer moves; ` +
        `expected ${String(MOVE_COUNT)}. The pass did not drive its declared gesture path.`,
    );
  }
  if (!metrics.activationOwners.includes(scenario.owner)) {
    throw new Error(
      `The ${scenario.name} gesture never published its expected ${scenario.owner} interaction ` +
        `owner. The pass did not activate the declared drag.`,
    );
  }
  if (metrics.pageScrollDelta.x !== 0 || metrics.pageScrollDelta.y !== 0) {
    throw new Error(
      `The page scrolled ${JSON.stringify(metrics.pageScrollDelta)} px during the ` +
        `${scenario.name} gesture. Window auto-scroll drags the document under the pointer, so ` +
        "the pass measures auto-scroll instead of the drag; fix the gesture placement.",
    );
  }
  return { ...metrics, cdp: cdpMetricsDelta(cdpBefore, cdpAfter) };
}

async function runScenarioMatrix(page, cdp, configuration, baseUrl, canvasBox) {
  const results = [];
  for (const scenario of configuration.scenarios) {
    for (const zoom of configuration.zooms) {
      await navigateToCenteredGesture(page, baseUrl, scenario, zoom, canvasBox);
      for (let pass = 1; pass <= configuration.passes; pass += 1) {
        if (pass > 1) {
          await resetMatrixDocument(page);
        }
        const passCanvasBox = await centeredCanvasBox(page);
        const metrics = await runPass(page, cdp, scenario, passCanvasBox);
        results.push({ cold: pass === 1, metrics, pass, scenario: scenario.name, zoom });
        console.log(
          `${scenario.name} zoom=${String(zoom)} pass=${String(pass)}: ` +
            `down=${String(metrics.pointerDownHandlerMs)}ms ` +
            `activationMaxGap=${String(metrics.activation.maxGapMs)}ms ` +
            `sustainedMaxGap=${String(metrics.sustained.maxGapMs)}ms`,
        );
      }
    }
  }
  return results;
}

async function profileMode(mode, configuration) {
  console.log(`Profiling the ${mode} build...`);
  const { baseUrl, server } = await startServer(mode, configuration.skipBuild);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: VIEWPORT });
    const page = await context.newPage();
    await page.addInitScript(PROBE_INIT_SCRIPT);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (configuration.cpuThrottle !== 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: configuration.cpuThrottle });
    }
    const canvasBox = await measureCanvas(page, baseUrl);
    const results = await runScenarioMatrix(page, cdp, configuration, baseUrl, canvasBox);
    return { baseUrl, mode, results };
  } finally {
    await browser.close();
    stopServer(server);
  }
}

function environmentSummary() {
  const require = createRequire(import.meta.url);
  return {
    architecture: process.arch,
    cpuCount: os.cpus().length,
    node: process.version,
    platform: process.platform,
    playwright: require("@playwright/test/package.json").version,
  };
}

function traceFilePath(label, mode) {
  return path.join(repositoryRoot, "perf/interaction-traces", `${label}-${mode}.json`);
}

function writeTrace(configuration, run, startedAt) {
  const tracePath = traceFilePath(configuration.label, run.mode);
  mkdirSync(path.dirname(tracePath), { recursive: true });
  const payload = {
    baseUrl: run.baseUrl,
    command: `node scripts/profile-interaction.mjs --label ${configuration.label} --mode ${run.mode}`,
    configuration: {
      commitSettleMs: COMMIT_SETTLE_MS,
      cpuThrottle: configuration.cpuThrottle,
      hoverSettleMs: HOVER_SETTLE_MS,
      moveCount: MOVE_COUNT,
      movePauseMs: MOVE_PAUSE_MS,
      passes: configuration.passes,
      viewport: VIEWPORT,
      zooms: configuration.zooms,
    },
    environment: environmentSummary(),
    mode: run.mode,
    results: run.results,
    scenarios: SCENARIOS.map(({ article, focus, name, owner, vector, workload }) => ({
      article,
      focus,
      name,
      owner,
      vector,
      workload,
    })),
    startedAt,
  };
  writeFileSync(tracePath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${path.relative(repositoryRoot, tracePath)}`);
}

const REPORT_HEADER = `# Interaction profile report

Append-only frame-pacing traces for the Setta-styled workspace UI plan, recorded by
\`corepack pnpm perf:interaction\` against the public \`/?visual-matrix\` playground route. Each
run centers each gesture in the browser window (measured handle, corrected viewport query, pass
failure if the page auto-scrolls mid-gesture), then drives out-and-back pointer drags (96 moves,
~7 ms pause between moves) for the registered gestures at 0.5x, 1x, and 2x workspace zoom. Pass 1
is cold after navigation; later passes are warm and start from the canonical fixture arrangement
restored through the matrix reset control. Runs labeled before \`phase-1-fixture\` predate these
fixture corrections (see \`phase-1-structural-drag-activation.md\`): their gestures ran at or below
the window's bottom edge, so structural-sort 2x and nested-freeform 1x/2x cells measured pointer
input below the window, window auto-scroll rearranged the document mid-pass, and later
structural-sort passes dragged a reordered document. Full per-pass traces,
configuration, and environment records live next to this file in \`perf/interaction-traces/\`.
Numbers are machine-local evidence, not portable CI thresholds.
`;

function longTaskSummary(metrics) {
  if (metrics.longTasks.length === 0) {
    return "none";
  }
  const worst = Math.max(...metrics.longTasks.map((task) => task.durationMs));
  return `${String(metrics.longTasks.length)} (max ${String(worst)} ms)`;
}

function reportRow(entry) {
  const { metrics } = entry;
  return (
    `| ${entry.scenario} | ${String(entry.zoom)} | ${String(entry.pass)}${entry.cold ? " (cold)" : ""} ` +
    `| ${String(metrics.pointerDownHandlerMs)} | ${String(metrics.firstMutationAfterDownMs)} ` +
    `| ${String(metrics.activation.maxGapMs)} | ${String(metrics.sustained.maxGapMs)} ` +
    `| ${String(metrics.overall.over32Count)} | ${longTaskSummary(metrics)} |`
  );
}

function appendReport(configuration, runs, startedAt) {
  const reportPath = path.join(repositoryRoot, "perf/interaction-profile.md");
  if (!existsSync(reportPath)) {
    writeFileSync(reportPath, REPORT_HEADER);
  }
  const environment = environmentSummary();
  const lines = [`\n## ${configuration.label} — ${startedAt}\n`];
  lines.push(
    `Environment: ${environment.platform} ${environment.architecture}, ` +
      `${String(environment.cpuCount)} cores, Node ${environment.node}, ` +
      `Playwright ${environment.playwright}, CPU throttle ${String(configuration.cpuThrottle)}x, ` +
      `${String(configuration.passes)} passes per zoom.\n`,
  );
  for (const run of runs) {
    lines.push(`### ${run.mode}\n`);
    lines.push(
      "| Scenario | Zoom | Pass | Pointer-down handlers (ms) | First mutation after down (ms) " +
        "| Activation max gap (ms) | Sustained max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const entry of run.results) {
      lines.push(reportRow(entry));
    }
    lines.push("");
  }
  appendFileSync(reportPath, `${lines.join("\n")}\n`);
  console.log(`Appended ${path.relative(repositoryRoot, reportPath)}`);
}

const configuration = parseConfiguration();
const startedAt = new Date().toISOString();
const runs = [];
for (const mode of configuration.modes) {
  runs.push(await profileMode(mode, configuration));
}
for (const run of runs) {
  writeTrace(configuration, run, startedAt);
}
appendReport(configuration, runs, startedAt);
