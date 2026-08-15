/**
 * Repeatable Phase 5 production profile for the extracted package's real canvas composition.
 *
 * The script builds the package and playground, serves the production playground, creates a
 * dedicated headless Chrome process, and measures a deterministic 256-section route. Every pass
 * records a fresh initial render plus mounted-versus-visible (culling) counts, sustained
 * empty-pane panning, and top-level drag activation/movement. Timings are machine-local evidence,
 * not cross-machine CI thresholds; fixture drift, missing gesture work, page scroll, and browser
 * errors fail loudly.
 *
 * Usage: pnpm run performance:profile [-- --passes 3] [--skip-build]
 *        [--chrome-binary /absolute/path/to/chrome]
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createCdpPage } from "./lib/cdp-client.mjs";
import {
  analyzeGestureSample,
  cdpMetricsDelta,
  INTERACTION_PROBE_INIT_SCRIPT,
  selectCdpMetrics,
} from "./lib/interaction-profile.mjs";
import { repositoryRoot, run, runPnpm } from "./lib/process.mjs";

const EXPECTED_SECTION_COUNT = 256;
const EXPECTED_VISIBLE_SECTION_COUNT = 20;
const EXPECTED_CANVAS_SIZE = { height: 588, width: 1382 };
const DRAG_TARGET_ID = "performance-drag-target";
const PREVIEW_PORT = 4174;
const PREVIEW_ORIGIN = `http://127.0.0.1:${String(PREVIEW_PORT)}`;
const VIEWPORT = { deviceScaleFactor: 1, height: 696, mobile: false, width: 1492 };
const MOVE_COUNT = 96;
const MOVE_PAUSE_MS = 7;
const GESTURE_SETTLE_MS = 250;
const GESTURE_VECTOR = { x: 150, y: 75 };
const PAN_VECTOR = { x: 180, y: 90 };
const PROFILE_INPUT_PATHS = [
  "apps/playground/src/main.tsx",
  "apps/playground/src/PerformanceProfileApp.tsx",
  "apps/playground/src/performanceProfileDocument.ts",
  "packages/workspace/src/canvas/nodeInternalsActions.ts",
  "scripts/lib/cdp-client.mjs",
  "scripts/lib/interaction-profile.mjs",
  "scripts/profile-workspace-performance.mjs",
];

function argumentValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} requires a value.`);
  }
  return value;
}

function positiveIntegerArgument(name, fallback) {
  const raw = argumentValue(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function chromeBinaryPath() {
  const explicitPath = argumentValue("chrome-binary");
  if (explicitPath !== null) {
    if (!path.isAbsolute(explicitPath)) {
      throw new Error("--chrome-binary must be an absolute path.");
    }
    if (!existsSync(explicitPath)) {
      throw new Error(`Chrome binary does not exist: ${explicitPath}.`);
    }
    return explicitPath;
  }
  if (process.platform !== "darwin") {
    throw new Error("Non-macOS performance profiles require --chrome-binary.");
  }
  const defaultPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(defaultPath)) {
    throw new Error(`Default Chrome binary does not exist: ${defaultPath}.`);
  }
  return defaultPath;
}

function startHeadlessChrome() {
  const profileDirectory = mkdtempSync(path.join(os.tmpdir(), "setta-workspace-profile-chrome-"));
  const child = spawn(
    chromeBinaryPath(),
    [
      "--headless=new",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-extensions",
      "--disable-renderer-backgrounding",
      "--no-default-browser-check",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-8_000);
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-8_000);
  });
  return { child, output, profileDirectory };
}

async function waitForHeadlessChrome(browser) {
  const portFile = path.join(browser.profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (browser.child.exitCode !== null) {
      throw new Error(
        `Headless Chrome exited with ${String(browser.child.exitCode)}.\n` +
          `${browser.output.stderr || browser.output.stdout}`,
      );
    }
    if (existsSync(portFile)) {
      const [rawPort] = readFileSync(portFile, "utf8").split("\n");
      const port = Number(rawPort);
      if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error(`Headless Chrome wrote an invalid DevTools port: ${String(rawPort)}.`);
      }
      return port;
    }
    await delay(50);
  }
  throw new Error("Headless Chrome did not expose a DevTools port within 15 seconds.");
}

async function stopHeadlessChrome(browser) {
  try {
    if (browser.child.exitCode === null) {
      const gracefulExit = once(browser.child, "exit");
      browser.child.kill("SIGTERM");
      const exitedGracefully = await Promise.race([
        gracefulExit.then(() => true),
        delay(2_000).then(() => false),
      ]);
      if (!exitedGracefully) {
        const forcedExit = once(browser.child, "exit");
        browser.child.kill("SIGKILL");
        const exitedForcibly = await Promise.race([
          forcedExit.then(() => true),
          delay(2_000).then(() => false),
        ]);
        if (!exitedForcibly) {
          throw new Error(
            `Headless Chrome process ${String(browser.child.pid)} did not terminate.`,
          );
        }
      }
    }
  } finally {
    rmSync(browser.profileDirectory, { force: true, recursive: true });
  }
}

function buildProfileSurface(skipBuild) {
  if (skipBuild) {
    return;
  }
  runPnpm(["--filter", "@setta/workspace", "run", "build"]);
  runPnpm(["--filter", "@setta/playground", "run", "build"]);
}

function profileInputSha256() {
  const hash = createHash("sha256");
  for (const relativePath of PROFILE_INPUT_PATHS) {
    hash.update(`${relativePath}\0`);
    hash.update(readFileSync(path.join(repositoryRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function directorySha256(relativeDirectory) {
  const directory = path.join(repositoryRoot, relativeDirectory);
  const files = [];
  const visit = (currentDirectory) => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  };
  visit(directory);
  files.sort();
  const hash = createHash("sha256");
  for (const absolutePath of files) {
    hash.update(`${path.relative(directory, absolutePath)}\0`);
    hash.update(readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function startPreview() {
  const playgroundRoot = path.join(repositoryRoot, "apps/playground");
  const viteEntry = path.join(playgroundRoot, "node_modules/vite/bin/vite.js");
  const child = spawn(
    process.execPath,
    [viteEntry, "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT), "--strictPort"],
    {
      cwd: playgroundRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-8_000);
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-8_000);
  });
  return { child, output };
}

async function waitForPreview(preview) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (preview.child.exitCode !== null) {
      throw new Error(
        `Playground preview exited with ${String(preview.child.exitCode)}.\n` +
          `${preview.output.stderr || preview.output.stdout}`,
      );
    }
    let response = null;
    try {
      response = await fetch(PREVIEW_ORIGIN);
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
    if (response?.ok) {
      return;
    }
    await delay(100);
  }
  throw new Error("Playground production preview did not become ready within 15 seconds.");
}

async function stopPreview(preview) {
  if (preview.child.exitCode !== null) {
    return;
  }
  const gracefulExit = once(preview.child, "exit");
  preview.child.kill("SIGTERM");
  const exitedGracefully = await Promise.race([
    gracefulExit.then(() => true),
    delay(2_000).then(() => false),
  ]);
  if (exitedGracefully) {
    return;
  }
  const forcedExit = once(preview.child, "exit");
  preview.child.kill("SIGKILL");
  const exitedForcibly = await Promise.race([
    forcedExit.then(() => true),
    delay(2_000).then(() => false),
  ]);
  if (!exitedForcibly) {
    throw new Error(`Playground preview process ${String(preview.child.pid)} did not terminate.`);
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      `Browser evaluation failed: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`,
    );
  }
  return response.result?.value;
}

function loadProbeScript() {
  return `(() => {
    const expectedSectionCount = ${String(EXPECTED_SECTION_COUNT)};
    const state = {
      longTasks: [],
      nodeReadyAt: null,
      settledAt: null,
    };
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      throw new Error("The performance profile requires long-task observation support.");
    }
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.longTasks.push({ duration: entry.duration, startTime: entry.startTime });
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
    let mutationObserver = null;
    const checkReady = () => {
      if (state.nodeReadyAt !== null) {
        return;
      }
      const nodes = document.querySelectorAll(".react-flow__node");
      const target = document.querySelector('[data-id="${DRAG_TARGET_ID}"]');
      if (nodes.length !== expectedSectionCount || !target) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      state.nodeReadyAt = performance.now();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          state.settledAt = performance.now();
          mutationObserver.disconnect();
        });
      });
    };
    mutationObserver = new MutationObserver(checkReady);
    mutationObserver.observe(document, { attributes: true, childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", checkReady, { once: true });
    window.__settaLoadProbe = {
      snapshot() {
        const navigation = performance.getEntriesByType("navigation")[0];
        return {
          domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
          loadEventEndMs: navigation?.loadEventEnd ?? null,
          longTasks: state.longTasks,
          mountedNodeCount: document.querySelectorAll(".react-flow__node").length,
          nodeReadyAtMs: state.nodeReadyAt,
          settledAtMs: state.settledAt,
        };
      },
    };
  })();`;
}

function profileUrl(scenario, pass) {
  const url = new URL(PREVIEW_ORIGIN);
  url.searchParams.set("performance-profile", "");
  url.searchParams.set("pass", String(pass));
  url.searchParams.set("scenario", scenario);
  return url.toString();
}

async function navigate(client, url) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.send("Page.navigate", { url });
  await loaded;
}

async function waitForProfileReady(client, issues, context) {
  const deadline = Date.now() + 20_000;
  let snapshot = null;
  while (Date.now() < deadline) {
    issues.assertNone(`${context} initialization`);
    snapshot = await evaluate(
      client,
      "window.__settaLoadProbe ? window.__settaLoadProbe.snapshot() : null",
    );
    if (snapshot?.mountedNodeCount > EXPECTED_SECTION_COUNT) {
      throw new Error(
        `Large-document route mounted ${String(snapshot.mountedNodeCount)} top-level nodes; expected ${String(EXPECTED_SECTION_COUNT)}.`,
      );
    }
    if (snapshot?.settledAtMs !== null && snapshot?.settledAtMs !== undefined) {
      await delay(100);
      return evaluate(client, "window.__settaLoadProbe.snapshot()");
    }
    await delay(50);
  }
  const diagnostic = await evaluate(
    client,
    `(() => {
      const profile = document.querySelector('[data-performance-profile="large-document"]');
      const canvas = document.querySelector(".react-flow");
      const root = document.querySelector("#root");
      return {
        body: document.body.getBoundingClientRect().toJSON(),
        canvas: canvas?.getBoundingClientRect().toJSON() ?? null,
        profile: profile?.getBoundingClientRect().toJSON() ?? null,
        rootChildCount: root?.childElementCount ?? null,
        rootText: root?.textContent?.slice(0, 200) ?? null,
      };
    })()`,
  );
  throw new Error(
    `Large-document route did not settle: ${JSON.stringify({ diagnostic, snapshot })}.`,
  );
}

function pageIssueCollector(client) {
  const issues = [];
  const unsubscribers = [
    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      issues.push(
        `exception: ${exceptionDetails?.exception?.description ?? exceptionDetails?.text}`,
      );
    }),
    client.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (type === "error" || type === "warning") {
        issues.push(
          `console ${type}: ${args?.map((argument) => argument.value ?? argument.description).join(" ")}`,
        );
      }
    }),
    client.on("Log.entryAdded", ({ entry }) => {
      if (entry?.level === "error" || entry?.level === "warning") {
        issues.push(`log ${entry.level}: ${entry.url ?? "unknown URL"}: ${entry.text}`);
      }
    }),
  ];
  return {
    assertNone(context) {
      if (issues.length > 0) {
        throw new Error(`${context} emitted browser issues:\n${issues.join("\n")}`);
      }
    },
    clear() {
      issues.length = 0;
    },
    dispose() {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    },
  };
}

const RENDER_COUNTS_EXPRESSION = `(() => {
  const profile = document.querySelector('[data-performance-profile="large-document"]');
  const canvas = document.querySelector(".react-flow");
  if (!profile || !canvas) {
    throw new Error("The large-document profile surface is missing.");
  }
  const expected = Number(profile.getAttribute("data-performance-section-count"));
  const canvasRect = canvas.getBoundingClientRect();
  const nodes = [...document.querySelectorAll(".react-flow__node")];
  const visible = nodes.filter((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" &&
      rect.right > canvasRect.left && rect.left < canvasRect.right &&
      rect.bottom > canvasRect.top && rect.top < canvasRect.bottom;
  }).length;
  return {
    canvas: { height: canvasRect.height, width: canvasRect.width },
    culledTopLevelNodes: expected - nodes.length,
    expectedTopLevelNodes: expected,
    mountedOffscreenTopLevelNodes: nodes.length - visible,
    mountedTopLevelNodes: nodes.length,
    visibleTopLevelNodes: visible,
  };
})()`;

async function prepareProfilePage(client, issues, scenario, pass) {
  issues.clear();
  await navigate(client, profileUrl(scenario, pass));
  const load = await waitForProfileReady(client, issues, `${scenario} pass ${String(pass)}`);
  const counts = await evaluate(client, RENDER_COUNTS_EXPRESSION);
  assertInitialProfileCounts(counts);
  issues.assertNone(`${scenario} pass ${String(pass)} load`);
  return { counts, load };
}

function assertMountedProfileCounts(counts) {
  if (counts.expectedTopLevelNodes !== EXPECTED_SECTION_COUNT) {
    throw new Error(
      `Profile route declares ${String(counts.expectedTopLevelNodes)} sections; expected ${String(EXPECTED_SECTION_COUNT)}.`,
    );
  }
  if (counts.mountedTopLevelNodes !== EXPECTED_SECTION_COUNT) {
    throw new Error(
      `Frozen-main parity requires all ${String(EXPECTED_SECTION_COUNT)} baseline nodes mounted; saw ${String(counts.mountedTopLevelNodes)}.`,
    );
  }
}

function assertInitialProfileCounts(counts) {
  assertMountedProfileCounts(counts);
  if (
    counts.canvas.width !== EXPECTED_CANVAS_SIZE.width ||
    counts.canvas.height !== EXPECTED_CANVAS_SIZE.height
  ) {
    throw new Error(
      `Large-document canvas geometry drifted: ${JSON.stringify(counts.canvas)}; expected ${JSON.stringify(EXPECTED_CANVAS_SIZE)}.`,
    );
  }
  if (counts.visibleTopLevelNodes !== EXPECTED_VISIBLE_SECTION_COUNT) {
    throw new Error(
      `Large-document route has ${String(counts.visibleTopLevelNodes)} initially visible nodes; expected ${String(EXPECTED_VISIBLE_SECTION_COUNT)}.`,
    );
  }
}

function gesturePath(start, vector) {
  const points = [];
  for (let step = 1; step <= MOVE_COUNT; step += 1) {
    const progress = step / MOVE_COUNT;
    points.push({ x: start.x + vector.x * progress, y: start.y + vector.y * progress });
  }
  return points;
}

async function dispatchGesture(client, start, vector, targetSelector, progressLabel) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: start.x,
    y: start.y,
  });
  await evaluate(client, `window.__settaInteractionProbe.begin(${JSON.stringify(targetSelector)})`);
  await delay(50);
  console.error(`[performance] ${progressLabel} pointer down`);
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: start.x,
    y: start.y,
  });
  const points = gesturePath(start, vector);
  const end = points.at(-1);
  if (!end) {
    throw new Error("The performance gesture path is empty.");
  }
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await delay(MOVE_PAUSE_MS);
    if ((index + 1) % 24 === 0) {
      console.error(
        `[performance] ${progressLabel} move ${String(index + 1)}/${String(MOVE_COUNT)}`,
      );
    }
  }
  console.error(`[performance] ${progressLabel} pointer up`);
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: end.x,
    y: end.y,
  });
  await delay(GESTURE_SETTLE_MS);
  console.error(`[performance] ${progressLabel} probe complete`);
  return evaluate(client, "window.__settaInteractionProbe.end()");
}

function validateGesture(metrics, label) {
  const maximumMoveCount = MOVE_COUNT + 16;
  if (metrics.moveCount < MOVE_COUNT || metrics.moveCount > maximumMoveCount) {
    throw new Error(
      `${label} recorded ${String(metrics.moveCount)} pointer moves; expected the ${String(MOVE_COUNT)} driven moves with at most 16 foreground-browser events.`,
    );
  }
  if (
    metrics.targetMutationCount < MOVE_COUNT ||
    metrics.targetMutationCount > maximumMoveCount ||
    metrics.firstTargetMutationAfterDownMs === null
  ) {
    throw new Error(
      `${label} produced ${String(metrics.targetMutationCount)} target mutations; expected sustained work for the ${String(MOVE_COUNT)} driven moves.`,
    );
  }
  if (metrics.pageScrollDelta.x !== 0 || metrics.pageScrollDelta.y !== 0) {
    throw new Error(`${label} scrolled the host page: ${JSON.stringify(metrics.pageScrollDelta)}.`);
  }
  if (metrics.frameCount < 10) {
    throw new Error(`${label} recorded only ${String(metrics.frameCount)} animation frames.`);
  }
}

const PANE_START_EXPRESSION = `(() => {
  const pane = document.querySelector(".react-flow__pane");
  const canvas = document.querySelector(".react-flow");
  if (!pane || !canvas) {
    throw new Error("The canvas pane is missing.");
  }
  const rect = canvas.getBoundingClientRect();
  const candidates = [
    [0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.5, 0.35], [0.5, 0.65],
    [0.3, 0.35], [0.7, 0.35], [0.3, 0.65], [0.7, 0.65],
  ];
  for (const [xFraction, yFraction] of candidates) {
    const x = rect.left + rect.width * xFraction;
    const y = rect.top + rect.height * yFraction;
    const pathFits = x >= rect.left + 20 && x + ${String(PAN_VECTOR.x)} <= rect.right - 20 &&
      y >= rect.top + 20 && y + ${String(PAN_VECTOR.y)} <= rect.bottom - 20;
    const target = document.elementFromPoint(x, y);
    if (pathFits && target === pane) {
      return { x, y };
    }
  }
  throw new Error("The performance fixture has no measured empty-pane pan start point.");
})()`;

const DRAG_START_EXPRESSION = `(() => {
  const wrapper = document.querySelector('[data-id="${DRAG_TARGET_ID}"]');
  const canvas = document.querySelector(".react-flow");
  if (!wrapper || !canvas) {
    throw new Error("The performance drag target or canvas is missing.");
  }
  const rect = wrapper.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const candidates = [[0.5, 0.72], [0.75, 0.72], [0.25, 0.72], [0.5, 0.55]];
  for (const [xFraction, yFraction] of candidates) {
    const x = rect.left + rect.width * xFraction;
    const y = rect.top + rect.height * yFraction;
    const pathFits = x >= canvasRect.left + 20 && x + ${String(GESTURE_VECTOR.x)} <= canvasRect.right - 20 &&
      y >= canvasRect.top + 20 && y + ${String(GESTURE_VECTOR.y)} <= canvasRect.bottom - 20;
    const target = document.elementFromPoint(x, y);
    if (pathFits && target?.closest('[data-id="${DRAG_TARGET_ID}"]') === wrapper &&
        !target.closest("button,input,textarea,select,a,.nodrag")) {
      return { x, y };
    }
  }
  throw new Error("The performance drag target has no non-interactive in-canvas start point.");
})()`;

async function measureGesture(client, issues, configuration) {
  const before = await evaluate(client, RENDER_COUNTS_EXPRESSION);
  assertInitialProfileCounts(before);
  const start = await evaluate(client, configuration.startExpression);
  const { metrics: cdpBefore } = await client.send("Performance.getMetrics");
  const sample = await dispatchGesture(
    client,
    start,
    configuration.vector,
    configuration.targetSelector,
    `${configuration.scenario} pass ${String(configuration.pass)}`,
  );
  const { metrics: cdpAfter } = await client.send("Performance.getMetrics");
  const metrics = analyzeGestureSample(sample);
  validateGesture(metrics, `${configuration.scenario} pass ${String(configuration.pass)}`);
  const after = await evaluate(client, RENDER_COUNTS_EXPRESSION);
  assertMountedProfileCounts(after);
  issues.assertNone(`${configuration.scenario} pass ${String(configuration.pass)}`);
  return {
    ...metrics,
    cdp: cdpMetricsDelta(cdpBefore, cdpAfter),
    counts: { after, before },
  };
}

function maxLongTask(observations) {
  return Math.max(
    0,
    ...observations.flatMap(({ longTasks }) =>
      longTasks.map(({ duration, durationMs }) => duration ?? durationMs),
    ),
  );
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function roundedMedian(values) {
  return Math.round(median(values) * 10) / 10;
}

function summarize(render, pan, drag) {
  return {
    culling: {
      culledTopLevelNodes: render[0].counts.culledTopLevelNodes,
      mountedOffscreenTopLevelNodes: render[0].counts.mountedOffscreenTopLevelNodes,
      mountedTopLevelNodes: render[0].counts.mountedTopLevelNodes,
      visibleTopLevelNodes: render[0].counts.visibleTopLevelNodes,
    },
    drag: {
      maxActivationFrameGapMs: Math.max(...drag.map(({ activation }) => activation.maxGapMs)),
      maxLongTaskMs: maxLongTask(drag),
      maxSustainedFrameGapMs: Math.max(...drag.map(({ sustained }) => sustained.maxGapMs)),
      medianFirstTargetMutationAfterDownMs: roundedMedian(
        drag.map(({ firstTargetMutationAfterDownMs }) => firstTargetMutationAfterDownMs),
      ),
      medianScriptDurationMs: roundedMedian(drag.map(({ cdp }) => cdp.ScriptDurationMs)),
      medianTaskDurationMs: roundedMedian(drag.map(({ cdp }) => cdp.TaskDurationMs)),
    },
    pan: {
      maxActivationFrameGapMs: Math.max(...pan.map(({ activation }) => activation.maxGapMs)),
      maxLongTaskMs: maxLongTask(pan),
      maxSustainedFrameGapMs: Math.max(...pan.map(({ sustained }) => sustained.maxGapMs)),
      medianScriptDurationMs: roundedMedian(pan.map(({ cdp }) => cdp.ScriptDurationMs)),
      medianTaskDurationMs: roundedMedian(pan.map(({ cdp }) => cdp.TaskDurationMs)),
    },
    render: {
      maxLongTaskMs: maxLongTask(render.map(({ load }) => load)),
      medianNodeReadyAtMs: roundedMedian(render.map(({ load }) => load.nodeReadyAtMs)),
      medianSettledAtMs: roundedMedian(render.map(({ load }) => load.settledAtMs)),
    },
  };
}

async function configureCdpClient(client) {
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Performance.enable"),
  ]);
  await client.send("Emulation.setDeviceMetricsOverride", VIEWPORT);
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: loadProbeScript(),
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: INTERACTION_PROBE_INIT_SCRIPT,
  });
}

async function collectProfile(client, passes) {
  const issues = pageIssueCollector(client);
  const render = [];
  const pan = [];
  const drag = [];
  try {
    for (let pass = 1; pass <= passes; pass += 1) {
      console.error(`[performance] pan pass ${String(pass)}/${String(passes)}`);
      console.error(`[performance] render pass ${String(pass)}/${String(passes)}`);
      const prepared = await prepareProfilePage(client, issues, "render", pass);
      const { metrics } = await client.send("Performance.getMetrics");
      render.push({ ...prepared, cdp: selectCdpMetrics(metrics), pass });
      pan.push(
        await measureGesture(client, issues, {
          pass,
          scenario: "pan",
          startExpression: PANE_START_EXPRESSION,
          targetSelector: ".react-flow__viewport",
          vector: PAN_VECTOR,
        }),
      );
    }
    for (let pass = 1; pass <= passes; pass += 1) {
      console.error(`[performance] drag pass ${String(pass)}/${String(passes)}`);
      await prepareProfilePage(client, issues, "drag", pass);
      drag.push(
        await measureGesture(client, issues, {
          pass,
          scenario: "drag",
          startExpression: DRAG_START_EXPRESSION,
          targetSelector: `[data-id="${DRAG_TARGET_ID}"]`,
          vector: GESTURE_VECTOR,
        }),
      );
    }
  } finally {
    issues.dispose();
  }
  return { drag, pan, render, summary: summarize(render, pan, drag) };
}

async function main() {
  const passes = positiveIntegerArgument("passes", 3);
  buildProfileSurface(process.argv.includes("--skip-build"));
  const preview = startPreview();
  let browser = null;
  let client = null;
  try {
    await waitForPreview(preview);
    console.error(`[performance] preview ready on ${PREVIEW_ORIGIN}`);
    browser = startHeadlessChrome();
    const cdpPort = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(cdpPort);
    client = page.client;
    await configureCdpClient(client);
    console.error(`[performance] isolated headless CDP target ready on port ${String(cdpPort)}`);
    const { product, userAgent } = await client.send("Browser.getVersion");
    const observations = await collectProfile(client, passes);
    const result = {
      context: {
        artifactSha256: {
          packageDist: directorySha256("packages/workspace/dist"),
          playgroundDist: directorySha256("apps/playground/dist"),
        },
        baseCommit: run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim(),
        environment: {
          architecture: process.arch,
          chrome: product,
          cpuCount: os.cpus().length,
          node: process.version,
          platform: process.platform,
          userAgent,
        },
        fixture: {
          documentSections: EXPECTED_SECTION_COUNT,
          dragTargetId: DRAG_TARGET_ID,
          passes,
          viewport: VIEWPORT,
          workspaceExtent: { height: 2_642, width: 4_295 },
        },
        profileInputSha256: profileInputSha256(),
        recordedAt: new Date().toISOString(),
      },
      observations,
    };
    const serializedResult = `${JSON.stringify(result, null, 2)}\n`;
    const outputPath = argumentValue("output");
    if (outputPath === null) {
      console.log(serializedResult.trimEnd());
    } else {
      if (!path.isAbsolute(outputPath)) {
        throw new Error("--output must be an absolute path.");
      }
      writeFileSync(outputPath, serializedResult);
      console.log(
        JSON.stringify(
          {
            outputPath,
            summary: observations.summary,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    client?.close();
    try {
      if (browser !== null) {
        await stopHeadlessChrome(browser);
      }
    } finally {
      await stopPreview(preview);
    }
  }
}

await main();
