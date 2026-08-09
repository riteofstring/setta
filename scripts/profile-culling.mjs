/**
 * Repeatable development/production large-document culling profiler.
 *
 * Drives the public culling-profile playground route — a deterministic
 * 305-section document nested to three depths with viewport culling enabled —
 * and records animation-frame gaps, long tasks, Chrome style/layout counters,
 * and rendered/culled section counts for four workloads:
 *
 * 1. pan — sustained canvas pan pressed inside the fixture's vacant pan
 *    alley, streaming sections through the culling overscan in both
 *    directions.
 * 2. zoom-sweep — Alt+wheel zoom out then back in at the canvas center,
 *    growing the rendered set from a viewport-sized slice toward most of the
 *    document and back.
 * 3. pinned-pan — the focused "Pinned target" section is displaced far
 *    offscreen by wheel pan (focus pinning holds it rendered while an
 *    unfocused neighbor culls), then an out-and-back wheel pan is measured
 *    with the pin active. A pointer pan would move focus to the pane and
 *    release the pin, so the measured pan uses the wheel.
 * 4. drag — a top-level XYFlow drag of the "Drag target" section (active
 *    pinning), measuring drag activation against the large culled document.
 *
 * Results append to perf/culling-profile.md and full traces land in
 * perf/interaction-traces/. Numbers are machine-local evidence, not portable
 * CI thresholds.
 *
 * Usage: node scripts/profile-culling.mjs [--label phase-4-culling]
 *        [--mode development|production|both] [--passes 3]
 *        [--scenario name[,name]] [--cpu-throttle 1] [--skip-build]
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "@playwright/test";

import {
  analyzeContinuousSample,
  analyzeGestureSample,
  cdpMetricsDelta,
  PROBE_INIT_SCRIPT,
} from "./lib/interaction-probe.mjs";
import { startServer, stopServer } from "./lib/playground-server.mjs";
import { repositoryRoot } from "./lib/process.mjs";

const VIEWPORT = { height: 1000, width: 1440 };
const MOVE_COUNT = 96;
const MOVE_PAUSE_MS = 7;
const HOVER_SETTLE_MS = 150;
const COMMIT_SETTLE_MS = 250;
const CULLING_SETTLE_TIMEOUT_MS = 10_000;
const WHEEL_STEP_PAUSE_MS = 60;
const ZOOM_WHEEL_STEPS = 8;
const ZOOM_WHEEL_DELTA = 120;
// One unmeasured wheel-pan displacement; panOnScrollSpeed 0.5 halves it, so
// the viewport moves 1,800 px — far beyond the 160 px default overscan.
const PINNED_DISPLACEMENT_WHEEL_DELTA = 3_600;
// The measured pinned wheel pan: 12 steps down then 12 back, ±1,200 px.
const PINNED_WHEEL_PAN_STEPS = 12;
const PINNED_WHEEL_PAN_DELTA = 200;
const WORKSPACE_NAME = "Culling profile workspace";
const EXPECTED_SECTION_COUNT = 305;

/**
 * Fixture geometry duplicated from CULLING_PROFILE_GRID in
 * apps/playground/src/CullingProfilePage.tsx. The runner fails loud whenever
 * the route stops matching: the section-count assertion, the empty-pane probe
 * under the pan start point, and the named article lookups all throw on
 * drift.
 */
const GRID = {
  alleyColumn: 7,
  cellHeight: 150,
  cellWidth: 260,
  columnSpacing: 360,
  dragCell: { column: 8, row: 3 },
  originX: 24,
  originY: 24,
  pinnedCell: { column: 6, row: 3 },
  rowSpacing: 560,
};

function cellCenter(column, row) {
  return {
    x: GRID.originX + column * GRID.columnSpacing + GRID.cellWidth / 2,
    y: GRID.originY + row * GRID.rowSpacing + GRID.cellHeight / 2,
  };
}

const ALLEY_FOCUS = cellCenter(GRID.alleyColumn, 3);
const DRAG_FOCUS = cellCenter(GRID.dragCell.column, GRID.dragCell.row);
const PAN_VECTOR = { x: 420, y: 280 };
const DRAG_VECTOR = { x: 150, y: 90 };

const SCENARIOS = [
  { name: "pan", zooms: [0.5, 1] },
  { name: "zoom-sweep", zooms: [1] },
  { name: "pinned-pan", zooms: [1] },
  { name: "drag", zooms: [0.5, 1] },
];

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
  const label = argValue("label", "phase-4-culling");
  if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error("The label must be a non-empty kebab-case identifier.");
  }
  const passes = Number(argValue("passes", "3"));
  const cpuThrottle = Number(argValue("cpu-throttle", "1"));
  if (![passes, cpuThrottle].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("--passes and --cpu-throttle values must be positive numbers.");
  }
  return {
    cpuThrottle,
    label,
    modes: parseModes(),
    passes,
    scenarios: parseScenarios(),
    skipBuild: process.argv.includes("--skip-build"),
  };
}

function profileUrl(baseUrl, focus, zoom, canvasBox) {
  const viewportX = canvasBox.width / 2 - focus.x * zoom;
  const viewportY = canvasBox.height / 2 - focus.y * zoom;
  const query = `zoom=${String(zoom)}&viewport-x=${String(viewportX)}&viewport-y=${String(viewportY)}`;
  return `${baseUrl}/?culling-profile&${query}`;
}

async function centeredCanvasBox(page) {
  const canvas = page.getByRole("application", { name: `${WORKSPACE_NAME} canvas` });
  await canvas.evaluate((element) => {
    element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
  });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("The culling profile canvas must expose browser geometry.");
  }
  const fitsWindow =
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= VIEWPORT.width &&
    box.y + box.height <= VIEWPORT.height;
  if (!fitsWindow) {
    throw new Error(
      "The culling profile canvas must fit inside the profiler window after scrolling; " +
        "pointer input outside the window would silently measure nothing.",
    );
  }
  return box;
}

async function measureCanvas(page, baseUrl) {
  await page.goto(`${baseUrl}/?culling-profile`);
  return centeredCanvasBox(page);
}

async function sectionCounts(page) {
  const region = page.getByRole("region", { exact: true, name: WORKSPACE_NAME });
  const [culled, hostBodies, rendered, total] = await Promise.all([
    region.locator('[data-workspace-culled="true"]').count(),
    region.locator(".culling-profile-note").count(),
    region.locator('[data-workspace-culled="false"]').count(),
    region.locator("[data-workspace-section-id]").count(),
  ]);
  return { culled, hostBodies, rendered, total };
}

/**
 * Wait until culling has classified the large document. A culled container
 * drops its whole subtree behind one placeholder, so the mounted frame count
 * must stay well below the document's section count while most mounted
 * frames are placeholders.
 */
async function waitForCulledDocument(page) {
  const documentSections = Number(
    await page.getByTestId("culling-profile-section-count").textContent(),
  );
  if (documentSections !== EXPECTED_SECTION_COUNT) {
    throw new Error(
      `The culling profile document holds ${String(documentSections)} sections; ` +
        `expected ${String(EXPECTED_SECTION_COUNT)}. The fixture drifted from the profiler.`,
    );
  }
  const deadline = Date.now() + CULLING_SETTLE_TIMEOUT_MS;
  let counts = await sectionCounts(page);
  while (Date.now() < deadline && counts.culled <= counts.total / 2) {
    await delay(100);
    counts = await sectionCounts(page);
  }
  if (counts.culled + counts.rendered !== counts.total || counts.culled <= counts.total / 2) {
    throw new Error(
      `Culling never bounded the rendered set: ${String(counts.rendered)} rendered, ` +
        `${String(counts.culled)} culled of ${String(counts.total)} mounted frames.`,
    );
  }
  if (counts.total >= documentSections) {
    throw new Error(
      `All ${String(counts.total)} frames are mounted for ${String(documentSections)} document ` +
        "sections; culling is not dropping offscreen subtrees.",
    );
  }
  return counts;
}

async function assertEmptyPaneAt(page, point) {
  const target = await page.evaluate(`(() => {
    const element = document.elementFromPoint(${String(point.x)}, ${String(point.y)});
    if (!element) {
      return "nothing";
    }
    if (element.closest("[data-workspace-section-id]")) {
      return "section";
    }
    return element.closest(".react-flow__pane") ? "pane" : element.tagName.toLowerCase();
  })()`);
  if (target !== "pane") {
    throw new Error(
      `The pan start point must press the empty canvas pane, but it hits "${target}". ` +
        "The fixture's pan alley no longer lines up with the profiler navigation.",
    );
  }
}

function canvasCenter(canvasBox) {
  return { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
}

function assertGestureInsideCanvas(start, vector, canvasBox, name) {
  const xExtents = [start.x, start.x + vector.x];
  const yExtents = [start.y, start.y + vector.y];
  const inside =
    Math.min(...xExtents) >= canvasBox.x + 10 &&
    Math.max(...xExtents) <= canvasBox.x + canvasBox.width - 10 &&
    Math.min(...yExtents) >= canvasBox.y + 10 &&
    Math.max(...yExtents) <= canvasBox.y + canvasBox.height - 10;
  if (!inside) {
    throw new Error(`The ${name} gesture path leaves the canvas; fix the vector or navigation.`);
  }
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

async function measureGesture(page, cdp, start, vector, expectedOwner) {
  await page.mouse.move(start.x, start.y);
  await delay(HOVER_SETTLE_MS);
  const before = await sectionCounts(page);
  const { metrics: cdpBefore } = await cdp.send("Performance.getMetrics");
  await page.evaluate("window.__settaInteractionProbe.begin()");
  await delay(50);
  await page.mouse.down();
  for (const point of gesturePath(start, vector)) {
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
      `The gesture recorded ${String(metrics.moveCount)} pointer moves; ` +
        `expected ${String(MOVE_COUNT)}. The pass did not drive its declared gesture path.`,
    );
  }
  if (expectedOwner && !metrics.activationOwners.includes(expectedOwner)) {
    throw new Error(`The gesture never published its expected ${expectedOwner} interaction owner.`);
  }
  if (metrics.pageScrollDelta.x !== 0 || metrics.pageScrollDelta.y !== 0) {
    throw new Error(
      `The page scrolled ${JSON.stringify(metrics.pageScrollDelta)} px mid-gesture, so the pass ` +
        "measured document scroll instead of the canvas interaction.",
    );
  }
  const after = await sectionCounts(page);
  return { cdp: cdpMetricsDelta(cdpBefore, cdpAfter), counts: { after, before }, ...metrics };
}

async function measureWheelSweep(page, cdp, center, deltaY) {
  await page.mouse.move(center.x, center.y);
  await delay(HOVER_SETTLE_MS);
  const before = await sectionCounts(page);
  const { metrics: cdpBefore } = await cdp.send("Performance.getMetrics");
  await page.evaluate("window.__settaInteractionProbe.begin()");
  await delay(50);
  await page.keyboard.down("Alt");
  for (let step = 0; step < ZOOM_WHEEL_STEPS; step += 1) {
    await page.mouse.wheel(0, deltaY);
    await delay(WHEEL_STEP_PAUSE_MS);
  }
  await page.keyboard.up("Alt");
  await delay(COMMIT_SETTLE_MS);
  const sample = await page.evaluate("window.__settaInteractionProbe.end()");
  const { metrics: cdpAfter } = await cdp.send("Performance.getMetrics");
  const metrics = analyzeContinuousSample(sample);
  if (metrics.pageScrollDelta.x !== 0 || metrics.pageScrollDelta.y !== 0) {
    throw new Error(
      `The page scrolled ${JSON.stringify(metrics.pageScrollDelta)} px during the zoom sweep; ` +
        "the wheel input missed the canvas.",
    );
  }
  const after = await sectionCounts(page);
  return { cdp: cdpMetricsDelta(cdpBefore, cdpAfter), counts: { after, before }, ...metrics };
}

async function runPanPasses(page, cdp, configuration, baseUrl, canvasBox, zoom, record) {
  await page.goto(profileUrl(baseUrl, ALLEY_FOCUS, zoom, canvasBox));
  await waitForCulledDocument(page);
  for (let pass = 1; pass <= configuration.passes; pass += 1) {
    const passCanvasBox = await centeredCanvasBox(page);
    const start = canvasCenter(passCanvasBox);
    assertGestureInsideCanvas(start, PAN_VECTOR, passCanvasBox, "pan");
    await assertEmptyPaneAt(page, start);
    const metrics = await measureGesture(page, cdp, start, PAN_VECTOR, null);
    record("pan", zoom, pass, "gesture", metrics);
  }
}

async function runZoomSweepPasses(page, cdp, configuration, baseUrl, canvasBox, zoom, record) {
  for (let pass = 1; pass <= configuration.passes; pass += 1) {
    await page.goto(profileUrl(baseUrl, ALLEY_FOCUS, zoom, canvasBox));
    await waitForCulledDocument(page);
    const passCanvasBox = await centeredCanvasBox(page);
    const center = canvasCenter(passCanvasBox);
    const out = await measureWheelSweep(page, cdp, center, ZOOM_WHEEL_DELTA);
    if (out.counts.after.rendered < out.counts.before.rendered * 2) {
      throw new Error(
        `Zooming out only grew the rendered set from ${String(out.counts.before.rendered)} to ` +
          `${String(out.counts.after.rendered)} sections; the sweep did not zoom.`,
      );
    }
    record("zoom-sweep", zoom, pass, "sweep-out", out);
    const back = await measureWheelSweep(page, cdp, center, -ZOOM_WHEEL_DELTA);
    if (back.counts.after.rendered * 2 > out.counts.after.rendered) {
      throw new Error(
        `Zooming back in left ${String(back.counts.after.rendered)} sections rendered; ` +
          "the sweep did not return toward the viewport-sized slice.",
      );
    }
    record("zoom-sweep", zoom, pass, "sweep-in", back);
  }
}

async function articleCullingState(page, name) {
  const article = page
    .getByRole("region", { exact: true, name: WORKSPACE_NAME })
    .getByRole("article", { name })
    .first();
  return article.getAttribute("data-workspace-culled");
}

async function waitForCullingState(page, name, expected, description) {
  const deadline = Date.now() + CULLING_SETTLE_TIMEOUT_MS;
  let state = await articleCullingState(page, name);
  while (Date.now() < deadline && state !== expected) {
    await delay(100);
    state = await articleCullingState(page, name);
  }
  if (state !== expected) {
    throw new Error(`${description} (data-workspace-culled is ${JSON.stringify(state)}).`);
  }
}

/**
 * Measure an out-and-back wheel pan while the probe records. A wheel pan
 * keeps focus where it is, so it is the pan input that can coexist with the
 * package's focus-driven pinning.
 */
async function measureWheelPan(page, cdp, center) {
  await page.mouse.move(center.x, center.y);
  await delay(HOVER_SETTLE_MS);
  const before = await sectionCounts(page);
  const { metrics: cdpBefore } = await cdp.send("Performance.getMetrics");
  await page.evaluate("window.__settaInteractionProbe.begin()");
  await delay(50);
  for (let step = 0; step < PINNED_WHEEL_PAN_STEPS; step += 1) {
    await page.mouse.wheel(0, PINNED_WHEEL_PAN_DELTA);
    await delay(WHEEL_STEP_PAUSE_MS);
  }
  for (let step = 0; step < PINNED_WHEEL_PAN_STEPS; step += 1) {
    await page.mouse.wheel(0, -PINNED_WHEEL_PAN_DELTA);
    await delay(WHEEL_STEP_PAUSE_MS);
  }
  await delay(COMMIT_SETTLE_MS);
  const sample = await page.evaluate("window.__settaInteractionProbe.end()");
  const { metrics: cdpAfter } = await cdp.send("Performance.getMetrics");
  const metrics = analyzeContinuousSample(sample);
  const after = await sectionCounts(page);
  return { cdp: cdpMetricsDelta(cdpBefore, cdpAfter), counts: { after, before }, ...metrics };
}

async function runPinnedPanPasses(page, cdp, configuration, baseUrl, canvasBox, zoom, record) {
  await page.goto(profileUrl(baseUrl, ALLEY_FOCUS, zoom, canvasBox));
  await waitForCulledDocument(page);
  for (let pass = 1; pass <= configuration.passes; pass += 1) {
    const passCanvasBox = await centeredCanvasBox(page);
    const workspace = page.getByRole("region", { exact: true, name: WORKSPACE_NAME });
    await workspace.getByRole("article", { name: "Pinned target" }).first().click();
    await waitForCullingState(
      page,
      "Pinned target",
      "false",
      "Clicking the pinned target must keep it rendered",
    );
    const center = canvasCenter(passCanvasBox);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, PINNED_DISPLACEMENT_WHEEL_DELTA);
    await waitForCullingState(
      page,
      "Note r3 c5",
      "true",
      "Displacing the viewport must cull the pinned target's unfocused neighbor",
    );
    await waitForCullingState(
      page,
      "Pinned target",
      "false",
      "The focused pinned target must stay rendered offscreen",
    );
    const metrics = await measureWheelPan(page, cdp, center);
    await waitForCullingState(
      page,
      "Pinned target",
      "false",
      "The pinned target must hold its pin through pan churn",
    );
    record("pinned-pan", zoom, pass, "wheel-pan", metrics);
    await page.mouse.wheel(0, -PINNED_DISPLACEMENT_WHEEL_DELTA);
    await waitForCullingState(
      page,
      "Note r3 c5",
      "false",
      "Restoring the viewport must re-render the pinned target's neighbor",
    );
  }
}

async function dragHandleStart(page, canvasBox) {
  const handle = page
    .getByRole("region", { exact: true, name: WORKSPACE_NAME })
    .getByRole("article", { name: "Drag target" })
    .getByRole("button", { name: "Move Drag target" })
    .first();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("The drag target movement handle must expose browser geometry.");
  }
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  assertGestureInsideCanvas(start, DRAG_VECTOR, canvasBox, "drag");
  return start;
}

async function resetCullingDocument(page) {
  await page.getByRole("button", { name: "Reset culling document" }).click();
  await page.getByText("Reset the culling profile document.", { exact: true }).first().waitFor();
  await delay(COMMIT_SETTLE_MS);
}

async function runDragPasses(page, cdp, configuration, baseUrl, canvasBox, zoom, record) {
  await page.goto(profileUrl(baseUrl, DRAG_FOCUS, zoom, canvasBox));
  await waitForCulledDocument(page);
  for (let pass = 1; pass <= configuration.passes; pass += 1) {
    if (pass > 1) {
      await resetCullingDocument(page);
      await waitForCulledDocument(page);
    }
    const passCanvasBox = await centeredCanvasBox(page);
    const start = await dragHandleStart(page, passCanvasBox);
    const metrics = await measureGesture(page, cdp, start, DRAG_VECTOR, "root-layout");
    record("drag", zoom, pass, "gesture", metrics);
  }
}

const SCENARIO_RUNNERS = {
  drag: runDragPasses,
  pan: runPanPasses,
  "pinned-pan": runPinnedPanPasses,
  "zoom-sweep": runZoomSweepPasses,
};

async function runScenarioMatrix(page, cdp, configuration, baseUrl, canvasBox) {
  const results = [];
  for (const scenario of configuration.scenarios) {
    for (const zoom of scenario.zooms) {
      const record = (name, recordedZoom, pass, sample, metrics) => {
        results.push({
          cold: pass === 1,
          metrics,
          pass,
          sample,
          scenario: name,
          zoom: recordedZoom,
        });
        console.log(
          `${name} zoom=${String(recordedZoom)} pass=${String(pass)} ${sample}: ` +
            `maxGap=${String(metrics.overall.maxGapMs)}ms over32=${String(metrics.overall.over32Count)} ` +
            `rendered=${String(metrics.counts.before.rendered)}->${String(metrics.counts.after.rendered)}`,
        );
      };
      await SCENARIO_RUNNERS[scenario.name](
        page,
        cdp,
        configuration,
        baseUrl,
        canvasBox,
        zoom,
        record,
      );
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

function writeTrace(configuration, run, startedAt) {
  const tracePath = path.join(
    repositoryRoot,
    "perf/interaction-traces",
    `${configuration.label}-${run.mode}.json`,
  );
  mkdirSync(path.dirname(tracePath), { recursive: true });
  const payload = {
    baseUrl: run.baseUrl,
    command: `node scripts/profile-culling.mjs --label ${configuration.label} --mode ${run.mode}`,
    configuration: {
      commitSettleMs: COMMIT_SETTLE_MS,
      cpuThrottle: configuration.cpuThrottle,
      expectedSectionCount: EXPECTED_SECTION_COUNT,
      hoverSettleMs: HOVER_SETTLE_MS,
      moveCount: MOVE_COUNT,
      movePauseMs: MOVE_PAUSE_MS,
      panVector: PAN_VECTOR,
      passes: configuration.passes,
      pinnedDisplacementWheelDelta: PINNED_DISPLACEMENT_WHEEL_DELTA,
      viewport: VIEWPORT,
      wheelStepPauseMs: WHEEL_STEP_PAUSE_MS,
      zoomWheelDelta: ZOOM_WHEEL_DELTA,
      zoomWheelSteps: ZOOM_WHEEL_STEPS,
    },
    environment: environmentSummary(),
    mode: run.mode,
    results: run.results,
    scenarios: SCENARIOS,
    startedAt,
  };
  writeFileSync(tracePath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${path.relative(repositoryRoot, tracePath)}`);
}

const REPORT_HEADER = `# Large-document culling profile report

Append-only frame-pacing traces for the Setta-styled workspace UI plan, recorded by
\`corepack pnpm perf:culling\` against the public \`/?culling-profile\` playground route: a
deterministic 305-section document nested to three depths with viewport culling enabled and the
final package CSS. Each run measures sustained canvas pan through the fixture's vacant pan alley,
an Alt+wheel zoom-out/zoom-in sweep at the canvas center, an out-and-back wheel pan with the
focused "Pinned target" section held rendered far offscreen (focus pinning; a pointer pan would
move focus and release the pin), and a top-level drag of the "Drag target" section (active
pinning), in development and production builds. Pass 1 of pan,
pinned-pan, and drag cells is cold after navigation; every zoom-sweep pass renavigates so its
zoom always starts exactly at the declared level. Full per-pass traces, configuration, and
environment records live next to this file in \`perf/interaction-traces/\`. Numbers are
machine-local evidence, not portable CI thresholds.
`;

function longTaskSummary(metrics) {
  if (metrics.longTasks.length === 0) {
    return "none";
  }
  const worst = Math.max(...metrics.longTasks.map((task) => task.durationMs));
  return `${String(metrics.longTasks.length)} (max ${String(worst)} ms)`;
}

function renderedSummary(metrics) {
  return `${String(metrics.counts.before.rendered)} → ${String(metrics.counts.after.rendered)}`;
}

function reportRow(entry) {
  const { metrics } = entry;
  const passLabel = `${String(entry.pass)}${entry.cold ? " (cold)" : ""}`;
  const activation = entry.sample === "gesture" ? String(metrics.activation.maxGapMs) : "n/a";
  const sustained = entry.sample === "gesture" ? String(metrics.sustained.maxGapMs) : "n/a";
  return (
    `| ${entry.scenario} | ${String(entry.zoom)} | ${passLabel} | ${entry.sample} ` +
    `| ${activation} | ${sustained} | ${String(metrics.overall.maxGapMs)} ` +
    `| ${String(metrics.overall.over32Count)} | ${longTaskSummary(metrics)} ` +
    `| ${renderedSummary(metrics)} |`
  );
}

function appendReport(configuration, runs, startedAt) {
  const reportPath = path.join(repositoryRoot, "perf/culling-profile.md");
  if (!existsSync(reportPath)) {
    writeFileSync(reportPath, REPORT_HEADER);
  }
  const environment = environmentSummary();
  const lines = [`\n## ${configuration.label} — ${startedAt}\n`];
  lines.push(
    `Environment: ${environment.platform} ${environment.architecture}, ` +
      `${String(environment.cpuCount)} cores, Node ${environment.node}, ` +
      `Playwright ${environment.playwright}, CPU throttle ${String(configuration.cpuThrottle)}x, ` +
      `${String(configuration.passes)} passes per cell, ` +
      `${String(EXPECTED_SECTION_COUNT)} sections.\n`,
  );
  for (const run of runs) {
    lines.push(`### ${run.mode}\n`);
    lines.push(
      "| Scenario | Zoom | Pass | Sample | Activation max gap (ms) | Sustained max gap (ms) " +
        "| Max gap (ms) | Gaps >32 ms | Long tasks ≥50 ms | Rendered before → after |",
    );
    lines.push(
      "| -------- | ---- | ---- | ------ | ----------------------- | ---------------------- " +
        "| ------------ | ----------- | ----------------- | ----------------------- |",
    );
    for (const entry of run.results) {
      lines.push(reportRow(entry));
    }
    lines.push("");
  }
  appendFileSync(reportPath, `${lines.join("\n")}\n`);
  console.log(`Appended ${path.relative(repositoryRoot, reportPath)}`);
}

async function main() {
  const configuration = parseConfiguration();
  const startedAt = new Date().toISOString();
  const runs = [];
  for (const mode of configuration.modes) {
    const run = await profileMode(mode, configuration);
    runs.push(run);
    writeTrace(configuration, run, startedAt);
  }
  appendReport(configuration, runs, startedAt);
}

await main();
