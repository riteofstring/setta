/**
 * Repeatable development/production interaction profiler.
 *
 * Drives the public visual-matrix playground route with synthetic pointer
 * gestures (top-level XYFlow drag, nested structural sort drag, same-parent
 * nested freeform drag) at 0.5x, 1x, and 2x workspace zoom, and records
 * activation timings, animation-frame gaps, long tasks, and Chrome
 * style/layout counters. Results append to perf/interaction-profile.md and
 * full traces land in perf/interaction-traces/.
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

/**
 * One stable fixture: the public-API-only visual-matrix route. Focus is the
 * document-space point the viewport centers on before the gesture; vector is
 * the screen-space out-and-back drag extent.
 */
const SCENARIOS = [
  {
    article: "Default chrome",
    focus: { x: 144, y: 108 },
    name: "root-drag",
    vector: { x: 150, y: 90 },
    workload: "Top-level XYFlow spatial drag of the root leaf section.",
  },
  {
    article: "Nested leaf",
    focus: { x: 200, y: 560 },
    name: "structural-sort",
    vector: { x: 0, y: 120 },
    workload: "dnd-kit nested structural drag inside the vertical ordered group.",
  },
  {
    article: "Freeform note A",
    focus: { x: 1_188, y: 328 },
    name: "nested-freeform",
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

function scenarioUrl(baseUrl, scenario, zoom, canvasBox) {
  const viewportX = canvasBox.width / 2 - scenario.focus.x * zoom;
  const viewportY = canvasBox.height / 2 - scenario.focus.y * zoom;
  const query = `zoom=${String(zoom)}&viewport-x=${String(viewportX)}&viewport-y=${String(viewportY)}`;
  return `${baseUrl}/?visual-matrix&${query}`;
}

async function measureCanvas(page, baseUrl) {
  await page.goto(`${baseUrl}/?visual-matrix`);
  const canvas = page.getByRole("application", { name: "Visual matrix workspace canvas" });
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("The visual matrix canvas must expose browser geometry.");
  }
  return box;
}

async function gestureStartPoint(page, scenario, canvasBox) {
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  const handle = workspace
    .getByRole("article", { name: scenario.article })
    .getByRole("button", { name: `Move ${scenario.article}` })
    .first();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`The ${scenario.name} movement handle must expose browser geometry.`);
  }
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const inside =
    point.x > canvasBox.x &&
    point.x < canvasBox.x + canvasBox.width &&
    point.y > canvasBox.y &&
    point.y < canvasBox.y + canvasBox.height;
  if (!inside) {
    throw new Error(`The ${scenario.name} movement handle is outside the visible canvas.`);
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
  return { ...analyzeGestureSample(sample), cdp: cdpMetricsDelta(cdpBefore, cdpAfter) };
}

async function runScenarioMatrix(page, cdp, configuration, baseUrl, canvasBox) {
  const results = [];
  for (const scenario of configuration.scenarios) {
    for (const zoom of configuration.zooms) {
      await page.goto(scenarioUrl(baseUrl, scenario, zoom, canvasBox));
      await page
        .getByRole("region", { exact: true, name: "Visual matrix workspace" })
        .getByRole("article", { name: scenario.article })
        .first()
        .waitFor();
      for (let pass = 1; pass <= configuration.passes; pass += 1) {
        const metrics = await runPass(page, cdp, scenario, canvasBox);
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
    scenarios: SCENARIOS.map(({ article, focus, name, vector, workload }) => ({
      article,
      focus,
      name,
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
run drives out-and-back pointer drags (96 moves, ~7 ms pause between moves, release at the origin
so passes stay document-stable) for the registered gestures at 0.5x, 1x, and 2x workspace zoom,
with pass 1 cold after navigation and later passes warm. Full per-pass traces, configuration, and
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
