import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../scripts/lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "../../scripts/lib/headless-chrome.mjs";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const backendRoot = path.join(appRoot, "backend");
const fixtureRoot = path.join(
  appRoot,
  "examples",
  "battery-playground",
  "fixture",
);
const timeoutMilliseconds = 30_000;

function runCommand(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.`,
    );
  }
}

function buildSurface(binaryPath) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const go = process.platform === "win32" ? "go.exe" : "go";
  if (!process.argv.includes("--skip-build")) {
    runCommand(
      pnpm,
      ["--filter", "@setta/experiment-lens", "run", "build"],
      repositoryRoot,
    );
  }
  runCommand(
    go,
    ["build", "-mod=readonly", "-o", binaryPath, "./cmd/experiment-lens"],
    backendRoot,
  );
}

function startServer(binaryPath, projectRoot) {
  const nonce = `browser-${process.pid.toString(36)}`;
  const child = spawn(
    binaryPath,
    [
      "serve",
      "--project-root",
      projectRoot,
      "--web-root",
      path.join(appRoot, "dist"),
      "--session-nonce",
      nonce,
      "--supervised-stdin=true",
      "--port",
      "0",
    ],
    {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-8_000);
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-8_000);
  });
  child.stdin.on("error", () => {});
  return { child, nonce, output, projectRoot };
}

function throwIfServerExited(server) {
  if (server.child.exitCode === null) {
    return;
  }
  throw new Error(
    `Experiment Lens host exited with ${String(server.child.exitCode)}.\n${server.output.stderr || server.output.stdout}`,
  );
}

function readServerReadiness(server) {
  const lineEnd = server.output.stdout.indexOf("\n");
  if (lineEnd < 0) {
    return null;
  }
  const readiness = JSON.parse(server.output.stdout.slice(0, lineEnd));
  assert.equal(readiness.app, "experiment-lens");
  assert.equal(readiness.nonce, server.nonce);
  assert.equal(readiness.project, realpathSync(server.projectRoot));
  assert.match(readiness.url, /^http:\/\/127\.0\.0\.1:[0-9]+$/u);
  return readiness;
}

function assertRuntimeSession(server, session) {
  assert.deepEqual(session, {
    appId: "experiment-lens",
    instanceNonce: server.nonce,
    projectPath: realpathSync(server.projectRoot),
    schemaVersion: "experiment-lens-session/v1",
  });
}

async function serverAcceptsRequests(server, readiness) {
  try {
    const response = await fetch(`${readiness.url}/api/v2/runtime/session`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) {
      return false;
    }
    assertRuntimeSession(server, await response.json());
    return true;
  } catch (error) {
    if (error instanceof TypeError || error?.name === "TimeoutError") {
      return false;
    }
    throw error;
  }
}

async function waitForServer(server) {
  const deadline = Date.now() + timeoutMilliseconds;
  let readiness = null;
  while (Date.now() < deadline) {
    throwIfServerExited(server);
    readiness ??= readServerReadiness(server);
    if (
      readiness !== null &&
      (await serverAcceptsRequests(server, readiness))
    ) {
      return readiness.url;
    }
    await delay(50);
  }
  throw new Error("Experiment Lens host did not publish readiness.");
}

async function waitForProcessExit(child, action, timeout) {
  if (child.exitCode !== null) {
    return true;
  }
  const exit = once(child, "exit");
  action();
  if (child.exitCode !== null) {
    return true;
  }
  return Promise.race([
    exit.then(() => true),
    delay(timeout).then(() => false),
  ]);
}

function signalServerTree(server, signal) {
  const processId = server.child.pid;
  if (processId === undefined) {
    return;
  }
  if (process.platform === "win32") {
    if (signal === "SIGKILL") {
      spawnSync("taskkill.exe", ["/PID", String(processId), "/T", "/F"]);
    } else {
      server.child.kill(signal);
    }
    return;
  }
  try {
    process.kill(-processId, signal);
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ESRCH")) {
      throw error;
    }
  }
}

async function stopServer(server) {
  if (server === null || server.child.exitCode !== null) {
    return;
  }
  if (
    await waitForProcessExit(
      server.child,
      () => server.child.stdin.end(),
      5_000,
    )
  ) {
    return;
  }
  if (
    await waitForProcessExit(
      server.child,
      () => signalServerTree(server, "SIGTERM"),
      2_000,
    )
  ) {
    return;
  }
  signalServerTree(server, "SIGKILL");
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails !== undefined) {
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text,
    );
  }
  return response.result?.value;
}

async function waitFor(client, description, expression) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if ((await evaluate(client, expression)) === true) {
      return;
    }
    await delay(75);
  }
  const observed = await evaluate(
    client,
    `({ body: document.body.textContent?.slice(0, 3000) ?? "", url: location.href })`,
  );
  throw new Error(`${description} did not occur: ${JSON.stringify(observed)}`);
}

async function jsonRequest(origin, pathname) {
  const response = await fetch(`${origin}${pathname}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${String(response.status)}.`);
  }
  return response.json();
}

async function waitForSnapshot(origin, description, accept) {
  const deadline = Date.now() + timeoutMilliseconds;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = await jsonRequest(origin, "/api/v1/experiment-lens");
    if (accept(snapshot)) {
      return snapshot;
    }
    await delay(75);
  }
  throw new Error(
    `${description} did not occur: ${JSON.stringify({ revision: snapshot?.revision, selection: snapshot?.selection })}`,
  );
}

function sectionSelector(sectionId) {
  return `[data-workspace-section-shell="true"][data-section-id="${sectionId}"]`;
}

async function pointForSelector(client, selector, description) {
  const point = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) ||
        (element instanceof HTMLButtonElement && element.disabled)) {
        return null;
      }
      const bounds = element.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(x, y);
      return bounds.width > 0 && bounds.height > 0 &&
        hit instanceof Element && (hit === element || element.contains(hit))
        ? { x, y }
        : null;
    })()`,
  );
  assert.notEqual(point, null, `${description} was not physically reachable.`);
  return point;
}

async function pointForMatching(client, selector, label) {
  const point = await evaluate(
    client,
    `(() => {
      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const element = candidates.find((candidate) =>
        candidate.getAttribute("aria-label") === ${JSON.stringify(label)} ||
        candidate.textContent?.trim() === ${JSON.stringify(label)}
      );
      if (!(element instanceof HTMLElement) ||
        (element instanceof HTMLButtonElement && element.disabled)) {
        return null;
      }
      const bounds = element.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const hit = document.elementFromPoint(x, y);
      return bounds.width > 0 && bounds.height > 0 &&
        hit instanceof Element && (hit === element || element.contains(hit))
        ? { x, y }
        : null;
    })()`,
  );
  assert.notEqual(point, null, `${label} was not physically reachable.`);
  return point;
}

async function clickPoint(client, point) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

async function physicalClickSelector(client, selector, description) {
  await clickPoint(
    client,
    await pointForSelector(client, selector, description),
  );
}

async function physicalClickMatching(client, selector, label) {
  await clickPoint(client, await pointForMatching(client, selector, label));
}

async function dragSelector(client, selector, deltaX, deltaY, description) {
  const start = await pointForSelector(client, selector, description);
  const end = { x: start.x + deltaX, y: start.y + deltaY };
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: start.x,
    y: start.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: start.x,
    y: start.y,
  });
  for (let step = 1; step <= 4; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: start.x + (deltaX * step) / 4,
      y: start.y + (deltaY * step) / 4,
    });
  }
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: end.x,
    y: end.y,
  });
}

async function assertBrowserResponsive(client, description) {
  const result = await evaluate(
    client,
    `new Promise((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve(document.querySelector(".lens-app") !== null))
    ))`,
  );
  assert.equal(result, true, `${description} left the browser unresponsive.`);
}

async function assertCanvasPan(client, description) {
  const start = await evaluate(
    client,
    `(() => {
      const pane = document.querySelector(".react-flow__pane");
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(pane instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        return null;
      }
      const bounds = pane.getBoundingClientRect();
      for (let y = bounds.top + 24; y < bounds.bottom - 24; y += 32) {
        for (let x = bounds.left + 24; x < bounds.right - 24; x += 32) {
          if (document.elementFromPoint(x, y) === pane) {
            return { transform: getComputedStyle(viewport).transform, x, y };
          }
        }
      }
      return null;
    })()`,
  );
  assert.notEqual(start, null, `${description} had no reachable canvas.`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: start.x,
    y: start.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    deltaX: 36,
    deltaY: 24,
    type: "mouseWheel",
    x: start.x,
    y: start.y,
  });
  await assertBrowserResponsive(client, description);
  const transform = await evaluate(
    client,
    `getComputedStyle(document.querySelector(".react-flow__viewport")).transform`,
  );
  assert.notEqual(transform, start.transform, `${description} could not pan.`);
  await client.send("Input.dispatchMouseEvent", {
    deltaX: -36,
    deltaY: -24,
    type: "mouseWheel",
    x: start.x,
    y: start.y,
  });
  await assertBrowserResponsive(client, `${description} reverse pan`);
  await delay(200);
}

async function assertHorizontalScroll(client, selector, description) {
  const start = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.scrollWidth <= element.clientWidth) {
        return null;
      }
      const bounds = element.getBoundingClientRect();
      return {
        left: element.scrollLeft,
        x: bounds.left + bounds.width * 0.7,
        y: bounds.top + Math.min(90, bounds.height * 0.45),
      };
    })()`,
  );
  assert.notEqual(start, null, `${description} had no horizontal overflow.`);
  await client.send("Input.dispatchMouseEvent", {
    deltaX: 240,
    deltaY: 0,
    type: "mouseWheel",
    x: start.x,
    y: start.y,
  });
  await waitFor(
    client,
    `${description} horizontal scroll`,
    `document.querySelector(${JSON.stringify(selector)})?.scrollLeft > ${String(start.left)}`,
  );
  await client.send("Input.dispatchMouseEvent", {
    deltaX: -240,
    deltaY: 0,
    type: "mouseWheel",
    x: start.x,
    y: start.y,
  });
  await assertBrowserResponsive(client, description);
}

async function typeInputValue(client, selector, value, description) {
  await physicalClickSelector(client, selector, description);
  const selected = await evaluate(
    client,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement) || document.activeElement !== control) {
        return false;
      }
      control.select();
      return true;
    })()`,
  );
  assert.equal(selected, true, `${description} did not receive focus.`);
  await assertBrowserResponsive(client, `${description} focus`);
  const characters = Array.from(String(value));
  for (const [index, character] of characters.entries()) {
    try {
      await client.send("Input.dispatchKeyEvent", {
        text: character,
        type: "char",
        unmodifiedText: character,
      });
    } catch (error) {
      throw new Error(
        `${description} stopped accepting input at character ${String(index)} (${JSON.stringify(character)}).`,
        { cause: error },
      );
    }
  }
  await client.send("Input.dispatchKeyEvent", {
    code: "Tab",
    key: "Tab",
    type: "keyDown",
    windowsVirtualKeyCode: 9,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "Tab",
    key: "Tab",
    type: "keyUp",
    windowsVirtualKeyCode: 9,
  });
  await assertBrowserResponsive(client, `${description} input`);
}

async function clickCanvas(client, selector, xRatio, yRatio) {
  const point = await evaluate(
    client,
    `(() => {
      const surface = document.querySelector(${JSON.stringify(selector)});
      if (!(surface instanceof HTMLElement)) {
        return false;
      }
      const bounds = surface.getBoundingClientRect();
      if (bounds.width < 100 || bounds.height < 100) {
        return null;
      }
      const x = bounds.left + bounds.width * ${String(xRatio)};
      const y = bounds.top + bounds.height * ${String(yRatio)};
      return surface.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
    })()`,
  );
  assert.notEqual(point, null, "The recorded-series chart was not clickable.");
  await clickPoint(client, point);
}

async function captureScreenshot(client, outputPath) {
  const screenshot = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  assert.equal(typeof screenshot.data, "string");
  writeFileSync(outputPath, screenshot.data, "base64");
  assert.ok(statSync(outputPath).size > 1_000);
}

function collectBrowserIssues(client) {
  const issues = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    issues.push(
      exceptionDetails.exception?.description ??
        exceptionDetails.text ??
        "Unknown browser exception",
    );
  });
  client.on("Runtime.consoleAPICalled", ({ args, type }) => {
    if (type === "error" || type === "assert") {
      issues.push(
        args
          .map((argument) => argument.value ?? argument.description ?? "")
          .join(" "),
      );
    }
  });
  return issues;
}

async function closeCdpPage(port, targetId) {
  const response = await fetch(
    `http://127.0.0.1:${String(port)}/json/close/${encodeURIComponent(targetId)}`,
  );
  if (!response.ok) {
    throw new Error(
      `Chrome DevTools target close failed with HTTP ${String(response.status)}.`,
    );
  }
}

async function exerciseBrowser(client, origin, resultDirectory) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.navigate", { url: origin });
  await loaded;
  await waitFor(
    client,
    "the Experiment Lens Atlas",
    `document.querySelector(".lens-app") !== null &&
      document.querySelector(${JSON.stringify(sectionSelector("lens:facets"))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector("lens:scatter"))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector("lens:table"))}) !== null &&
      document.querySelectorAll('[data-lens-observation-id]').length > 1 &&
      (document.querySelector('.lens-project-heading strong')?.getBoundingClientRect().width ?? 0) > 150`,
  );
  const initial = await jsonRequest(origin, "/api/v1/experiment-lens");
  assert.equal(initial.revision, 0);
  assert.equal(initial.observations.length, 864);
  assert.equal(initial.artifacts.length, 144);
  assert.equal(
    initial.artifacts.filter((artifact) => artifact.status === "resolved")
      .length,
    144,
  );

  const atlasScreenshot = path.join(
    resultDirectory,
    "experiment-lens-atlas-dark.png",
  );
  await captureScreenshot(client, atlasScreenshot);
  await assertCanvasPan(client, "the initial Atlas");
  await physicalClickSelector(
    client,
    'button[aria-label="toggle minimap"]',
    "the minimap toggle",
  );
  await waitFor(
    client,
    "the visible minimap",
    `document.querySelector('[data-testid="rf__minimap"]') !== null`,
  );
  await physicalClickSelector(
    client,
    'button[aria-label="toggle minimap"]',
    "the minimap toggle",
  );
  await waitFor(
    client,
    "the hidden minimap",
    `document.querySelector('[data-testid="rf__minimap"]') === null`,
  );
  await assertHorizontalScroll(
    client,
    `${sectionSelector("lens:table")} .lens-table-scroll`,
    "the observation table",
  );
  const observationSortSelector = `${sectionSelector("lens:table")} button[aria-label="Sort by Observation"]`;
  await physicalClickSelector(
    client,
    observationSortSelector,
    "the observation sort control",
  );
  await waitFor(
    client,
    "ascending observation sorting",
    `document.querySelector(${JSON.stringify(observationSortSelector)})?.textContent?.includes("↑") === true`,
  );
  await physicalClickSelector(
    client,
    observationSortSelector,
    "the observation sort control",
  );
  await waitFor(
    client,
    "descending observation sorting",
    `document.querySelector(${JSON.stringify(observationSortSelector)})?.textContent?.includes("↓") === true`,
  );
  await physicalClickSelector(
    client,
    observationSortSelector,
    "the observation sort control",
  );
  await waitFor(
    client,
    "cleared observation sorting",
    `(() => {
      const text = document.querySelector(${JSON.stringify(observationSortSelector)})?.textContent ?? "";
      return !text.includes("↑") && !text.includes("↓");
    })()`,
  );
  const cycleFilteredCount = initial.observations.filter(
    (observation) => Number(observation.values.cycle) >= 100,
  ).length;
  await typeInputValue(
    client,
    'input[aria-label="Cycle minimum"]',
    100,
    "the cycle minimum filter",
  );
  const rangeFiltered = await waitForSnapshot(
    origin,
    "the durable cycle range",
    (snapshot) =>
      snapshot.revision === initial.revision + 1 &&
      snapshot.selection.filters.some(
        (filter) =>
          filter.fieldId === "cycle" &&
          filter.operator === "range" &&
          filter.minimum === 100,
      ),
  );
  await waitFor(
    client,
    "the range-filtered cohort",
    `document.querySelector('[data-lens-visible-count]')?.textContent === ${JSON.stringify(String(cycleFilteredCount))}`,
  );
  await delay(300);
  const settledRange = await jsonRequest(origin, "/api/v1/experiment-lens");
  assert.equal(
    settledRange.revision,
    rangeFiltered.revision,
    "The cycle range input emitted more than one durable mutation.",
  );
  await physicalClickMatching(
    client,
    `${sectionSelector("lens:facets")} button`,
    "Clear filters",
  );
  await waitForSnapshot(
    origin,
    "the cleared cycle range",
    (snapshot) =>
      snapshot.revision === rangeFiltered.revision + 1 &&
      snapshot.selection.filters.length === 0,
  );
  await waitFor(
    client,
    "the restored full cohort",
    `document.querySelector('[data-lens-visible-count]')?.textContent === "864"`,
  );

  const firstObservationId = await evaluate(
    client,
    `document.querySelector('[data-lens-observation-id]')?.getAttribute('data-lens-observation-id') ?? null`,
  );
  assert.equal(typeof firstObservationId, "string");
  await physicalClickSelector(
    client,
    `[data-lens-observation-id="${firstObservationId}"]`,
    "the first observation",
  );
  const focusedFirst = await waitForSnapshot(
    origin,
    "the first durable focus",
    (snapshot) =>
      snapshot.selection.focusedObservationId === firstObservationId,
  );
  await physicalClickSelector(
    client,
    `[data-lens-select-observation="${firstObservationId}"]`,
    "the first comparison selection",
  );
  const selectedFirst = await waitForSnapshot(
    origin,
    "the first durable comparison selection",
    (snapshot) =>
      snapshot.revision === focusedFirst.revision + 1 &&
      snapshot.selection.selectedObservationIds.includes(firstObservationId),
  );

  await physicalClickSelector(
    client,
    `${sectionSelector("lens:facets")} [data-lens-filter-value="LCO"]`,
    "the LCO cohort filter",
  );
  const filtered = await waitForSnapshot(
    origin,
    "the durable LCO exclusion",
    (snapshot) =>
      snapshot.revision === selectedFirst.revision + 1 &&
      snapshot.selection.filters.some(
        (filter) =>
          filter.fieldId === "chemistry" &&
          filter.operator === "in" &&
          !filter.values.includes("LCO"),
      ) &&
      snapshot.selection.selectedObservationIds.includes(firstObservationId),
  );
  await waitFor(
    client,
    "the linked filtered cohort",
    `document.querySelector('[data-lens-visible-count]')?.textContent === "576" &&
      document.body.textContent?.includes("1 outside cohort") === true`,
  );
  await assertCanvasPan(client, "the filtered Atlas");
  await physicalClickMatching(
    client,
    `${sectionSelector("lens:facets")} button`,
    "Clear filters",
  );
  const clearedCohort = await waitForSnapshot(
    origin,
    "the cleared categorical filter",
    (snapshot) =>
      snapshot.revision === filtered.revision + 1 &&
      snapshot.selection.filters.length === 0 &&
      snapshot.selection.selectedObservationIds.includes(firstObservationId),
  );
  await waitFor(
    client,
    "the unfiltered linked cohort",
    `document.querySelector('[data-lens-visible-count]')?.textContent === "864"`,
  );
  await physicalClickSelector(
    client,
    `${sectionSelector("lens:facets")} [data-lens-filter-value="LCO"]`,
    "the restored LCO cohort filter",
  );
  const refiltered = await waitForSnapshot(
    origin,
    "the restored LCO exclusion",
    (snapshot) =>
      snapshot.revision === clearedCohort.revision + 1 &&
      snapshot.selection.filters.some(
        (filter) =>
          filter.fieldId === "chemistry" &&
          filter.operator === "in" &&
          !filter.values.includes("LCO"),
      ),
  );
  await waitFor(
    client,
    "the restored filtered cohort",
    `document.querySelector('[data-lens-visible-count]')?.textContent === "576"`,
  );

  const secondObservationId = await evaluate(
    client,
    `document.querySelector('[data-lens-observation-id]')?.getAttribute('data-lens-observation-id') ?? null`,
  );
  assert.equal(typeof secondObservationId, "string");
  assert.notEqual(secondObservationId, firstObservationId);
  await physicalClickSelector(
    client,
    `[data-lens-observation-id="${secondObservationId}"]`,
    "the visible comparison observation",
  );
  const focusedSecond = await waitForSnapshot(
    origin,
    "the linked table focus",
    (snapshot) =>
      snapshot.revision === refiltered.revision + 1 &&
      snapshot.selection.focusedObservationId === secondObservationId,
  );
  await physicalClickSelector(
    client,
    `[data-lens-select-observation="${secondObservationId}"]`,
    "the second comparison selection",
  );
  const selectedSecond = await waitForSnapshot(
    origin,
    "the two-observation basket",
    (snapshot) =>
      snapshot.revision === focusedSecond.revision + 1 &&
      snapshot.selection.selectedObservationIds.length === 2,
  );

  await physicalClickMatching(
    client,
    '[data-testid="workspace-saved-view-tabs"] button',
    "Inspect",
  );
  await waitFor(
    client,
    "the linked series and cycle artifact",
    `(() => {
      const series = document.querySelector(${JSON.stringify(sectionSelector("lens:series"))});
      const artifact = document.querySelector(${JSON.stringify(sectionSelector("lens:artifact"))});
      const image = artifact?.querySelector('img');
      const seriesBounds = series?.getBoundingClientRect();
      const artifactBounds = artifact?.getBoundingClientRect();
      return seriesBounds !== undefined && seriesBounds.width > 0 && seriesBounds.height > 0 &&
        artifactBounds !== undefined && artifactBounds.width > 0 && artifactBounds.height > 0 &&
        artifact?.querySelector('[data-lens-artifact-id$="0900"]') !== null &&
        image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 &&
        (document.querySelector('.lens-project-heading strong')?.getBoundingClientRect().width ?? 0) > 150;
    })()`,
  );
  await delay(400);
  const inspectScreenshot = path.join(
    resultDirectory,
    "experiment-lens-inspect-dark.png",
  );
  await captureScreenshot(client, inspectScreenshot);

  await clickCanvas(
    client,
    `${sectionSelector("lens:series")} .lens-echart`,
    0.32,
    0.48,
  );
  await waitFor(
    client,
    "the shared series-to-frame cursor",
    `(() => {
      const artifact = document.querySelector(${JSON.stringify(sectionSelector("lens:artifact"))});
      const id = artifact?.querySelector('[data-lens-artifact-id]')?.getAttribute('data-lens-artifact-id');
      const timeline = document.querySelector(${JSON.stringify(`${sectionSelector("lens:series")} .lens-timeline-status`)})?.textContent ?? "";
      return id?.endsWith("0250") === true && timeline.includes("Cycle 300");
    })()`,
  );
  const timelineScreenshot = path.join(
    resultDirectory,
    "experiment-lens-linked-timeline.png",
  );
  await captureScreenshot(client, timelineScreenshot);

  const note = "Recheck the accelerated capacity loss around this checkpoint.";
  await typeInputValue(
    client,
    'input[aria-label="Selection note"]',
    note,
    "the selection note",
  );
  await physicalClickMatching(
    client,
    `${sectionSelector("lens:artifact")} button`,
    "Save note",
  );
  const noted = await waitForSnapshot(
    origin,
    "the artifact-anchored note",
    (snapshot) =>
      snapshot.revision === selectedSecond.revision + 1 &&
      snapshot.selection.notes.some(
        (candidate) =>
          candidate.observationId === secondObservationId &&
          candidate.text === note,
      ),
  );
  await physicalClickMatching(
    client,
    `${sectionSelector("lens:artifact")} button`,
    "Include artifact",
  );
  const included = await waitForSnapshot(
    origin,
    "the exact artifact inclusion",
    (snapshot) =>
      snapshot.revision === noted.revision + 1 &&
      snapshot.selection.selectedArtifactIds.length === 1,
  );

  await physicalClickMatching(client, ".lens-app-actions button", "Compare 2");
  await waitFor(
    client,
    "the managed comparison window",
    `(() => {
      const windowSurface = document.querySelector('article[aria-label="Window Selected observations"]');
      const bounds = windowSurface?.getBoundingClientRect();
      return bounds !== undefined && bounds.width > 0 && bounds.height > 0 &&
        windowSurface?.querySelector('[data-lens-comparison="true"]') !== null;
    })()`,
  );
  const comparisonScreenshot = path.join(
    resultDirectory,
    "experiment-lens-comparison.png",
  );
  await captureScreenshot(client, comparisonScreenshot);

  const comparisonWindowSelector =
    'article[aria-label="Window Selected observations"]';
  const comparisonBounds = await evaluate(
    client,
    `(() => {
      const bounds = document.querySelector(${JSON.stringify(comparisonWindowSelector)})?.getBoundingClientRect();
      return bounds
        ? { height: bounds.height, left: bounds.left, top: bounds.top, width: bounds.width }
        : null;
    })()`,
  );
  assert.notEqual(comparisonBounds, null);
  await dragSelector(
    client,
    `${comparisonWindowSelector} [data-workspace-window-title="true"]`,
    48,
    32,
    "the comparison window title",
  );
  await waitFor(
    client,
    "the comparison window move",
    `(() => {
      const bounds = document.querySelector(${JSON.stringify(comparisonWindowSelector)})?.getBoundingClientRect();
      return bounds !== undefined &&
        Math.abs(bounds.left - ${String(comparisonBounds.left)}) >= 24 &&
        Math.abs(bounds.top - ${String(comparisonBounds.top)}) >= 16;
    })()`,
  );
  await assertBrowserResponsive(client, "the settled comparison window move");
  const movedComparisonBounds = await evaluate(
    client,
    `(() => {
      const bounds = document.querySelector(${JSON.stringify(comparisonWindowSelector)})?.getBoundingClientRect();
      return bounds ? { height: bounds.height, width: bounds.width } : null;
    })()`,
  );
  assert.notEqual(movedComparisonBounds, null);
  await dragSelector(
    client,
    `${comparisonWindowSelector} [data-testid="workspace-window-free-resize-handle"][data-direction="bottom_right"]`,
    44,
    36,
    "the comparison window resize handle",
  );
  await waitFor(
    client,
    "the comparison window resize",
    `(() => {
      const bounds = document.querySelector(${JSON.stringify(comparisonWindowSelector)})?.getBoundingClientRect();
      return bounds !== undefined &&
        bounds.width >= ${String(movedComparisonBounds.width + 24)} &&
        bounds.height >= ${String(movedComparisonBounds.height + 20)};
    })()`,
  );
  await assertBrowserResponsive(client, "the comparison window resize");
  await evaluate(
    client,
    `(() => {
      window.__lensMinimizeClickCount = 0;
      document.querySelector('button[aria-label="Minimize Selected observations"]')?.addEventListener(
        "click",
        () => { window.__lensMinimizeClickCount += 1; },
      );
      return true;
    })()`,
  );
  await physicalClickSelector(
    client,
    'button[aria-label="Minimize Selected observations"]',
    "the comparison window minimize control",
  );
  assert.equal(
    await evaluate(client, "window.__lensMinimizeClickCount"),
    1,
    "The comparison window minimize control did not receive a click.",
  );
  await waitFor(
    client,
    "the minimized comparison window",
    `${JSON.stringify(null)} === document.querySelector(${JSON.stringify(comparisonWindowSelector)}) &&
      document.querySelector('button[aria-label="Restore Selected observations"]') !== null`,
  );
  await physicalClickSelector(
    client,
    'button[aria-label="Restore Selected observations"]',
    "the comparison window restore control",
  );
  await waitFor(
    client,
    "the restored comparison window",
    `document.querySelector(${JSON.stringify(comparisonWindowSelector)}) !== null`,
  );
  await assertBrowserResponsive(client, "the comparison window lifecycle");

  await physicalClickMatching(
    client,
    ".lens-app-actions button",
    "Export selection",
  );
  const exportPath = path.join(
    resultDirectory,
    "battery-aging-study-selection.json",
  );
  const deadline = Date.now() + timeoutMilliseconds;
  while (!existsSync(exportPath) && Date.now() < deadline) {
    await delay(75);
  }
  assert.ok(existsSync(exportPath), "The portable selection did not download.");
  const exported = JSON.parse(readFileSync(exportPath, "utf8"));
  assert.equal(exported.version, 1);
  assert.equal(exported.revision, included.revision);
  assert.equal(exported.selection.selectedObservationIds.length, 2);
  assert.equal(exported.selection.selectedArtifactIds.length, 1);
  assert.equal(exported.selection.notes[0].text, note);
  assert.equal(exported.observations.length, 2);

  const reloaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.reload", { ignoreCache: true });
  await reloaded;
  await waitFor(
    client,
    "the durable exploration state after reload",
    `document.querySelector('[data-lens-visible-count]')?.textContent === "576" &&
      document.body.textContent?.includes("Compare 2") === true`,
  );

  return {
    export: exportPath,
    revision: included.revision,
    screenshots: [
      atlasScreenshot,
      inspectScreenshot,
      timelineScreenshot,
      comparisonScreenshot,
    ],
  };
}

async function exerciseLightBrowser(client, origin, resultDirectory) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.navigate", { url: origin });
  await loaded;
  await waitFor(
    client,
    "the light Experiment Lens Atlas",
    `document.querySelector(".lens-app") !== null &&
      document.querySelector(${JSON.stringify(sectionSelector("lens:facets"))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector("lens:table"))}) !== null &&
      document.querySelector('[data-lens-visible-count]')?.textContent === "576" &&
      document.body.textContent?.includes("Compare 2") === true &&
      (document.querySelector('.lens-project-heading strong')?.getBoundingClientRect().width ?? 0) > 150`,
  );
  const lightScreenshot = path.join(
    resultDirectory,
    "experiment-lens-atlas-light.png",
  );
  await captureScreenshot(client, lightScreenshot);
  return lightScreenshot;
}

async function exerciseConstrainedBrowser(client, origin, resultDirectory) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.navigate", { url: origin });
  await loaded;
  await waitFor(
    client,
    "the constrained Experiment Lens viewport",
    `innerWidth === 680 && innerHeight === 720 &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
      document.querySelector('.lens-app')?.getBoundingClientRect().width === 680 &&
      document.querySelector('[data-lens-visible-count]')?.textContent === "576"`,
  );
  await delay(300);
  const constrainedScreenshot = path.join(
    resultDirectory,
    "experiment-lens-constrained.png",
  );
  await captureScreenshot(client, constrainedScreenshot);
  return constrainedScreenshot;
}

function resultDirectory() {
  const configured = process.env.CODE_POLISHY_ARTIFACT_DIR;
  if (configured !== undefined) {
    if (!path.isAbsolute(configured)) {
      throw new Error("CODE_POLISHY_ARTIFACT_DIR must be absolute.");
    }
    mkdirSync(configured, { recursive: true });
    return configured;
  }
  return mkdtempSync(
    path.join(os.tmpdir(), "setta-experiment-lens-browser-result-"),
  );
}

if (process.argv.includes("--generate-fixture")) {
  await import("./examples/battery-playground/generate-fixture.mjs");
  process.exit(0);
}

const temporaryDirectory = mkdtempSync(
  path.join(os.tmpdir(), "setta-experiment-lens-browser-"),
);
const projectRoot = path.join(temporaryDirectory, "project");
const binaryPath = path.join(
  temporaryDirectory,
  process.platform === "win32" ? "experiment-lens.exe" : "experiment-lens",
);
const artifacts = resultDirectory();
let server = null;
let browser = null;
let client = null;
let lightClient = null;
let constrainedClient = null;
let result = null;

try {
  buildSurface(binaryPath);
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  server = startServer(binaryPath, projectRoot);
  const origin = await waitForServer(server);
  const explicitChrome =
    process.env.EXPERIMENT_LENS_CHROME_BINARY ??
    process.env.REVIEW_CHROME_BINARY ??
    process.env.REALTIME_CHROME_BINARY ??
    null;
  browser = startHeadlessChrome(explicitChrome);
  const port = await waitForHeadlessChrome(browser);
  let darkTargetId = null;
  let lightTargetId = null;
  let constrainedTargetId = null;
  ({ client, targetId: darkTargetId } = await createCdpPage(port));
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 900,
      mobile: false,
      width: 1_440,
    }),
    client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "dark" }],
    }),
    client.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: artifacts,
      eventsEnabled: true,
    }),
  ]);
  const issues = collectBrowserIssues(client);
  try {
    result = await exerciseBrowser(client, origin, artifacts);
    await closeCdpPage(port, darkTargetId);
    client.close();
    client = null;
    ({ client: lightClient, targetId: lightTargetId } =
      await createCdpPage(port));
    await Promise.all([
      lightClient.send("Page.enable"),
      lightClient.send("Runtime.enable"),
      lightClient.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 900,
        mobile: false,
        width: 1_440,
      }),
      lightClient.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "light" }],
      }),
    ]);
    const lightIssues = collectBrowserIssues(lightClient);
    result.screenshots.push(
      await exerciseLightBrowser(lightClient, origin, artifacts),
    );
    assert.deepEqual(
      lightIssues,
      [],
      "Experiment Lens reported light-browser errors.",
    );
    await closeCdpPage(port, lightTargetId);
    lightClient.close();
    lightClient = null;
    ({ client: constrainedClient, targetId: constrainedTargetId } =
      await createCdpPage(port));
    await Promise.all([
      constrainedClient.send("Page.enable"),
      constrainedClient.send("Runtime.enable"),
      constrainedClient.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 720,
        mobile: false,
        width: 680,
      }),
      constrainedClient.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "dark" }],
      }),
    ]);
    const constrainedIssues = collectBrowserIssues(constrainedClient);
    result.screenshots.push(
      await exerciseConstrainedBrowser(constrainedClient, origin, artifacts),
    );
    assert.deepEqual(
      constrainedIssues,
      [],
      "Experiment Lens reported constrained-browser errors.",
    );
    await closeCdpPage(port, constrainedTargetId);
    constrainedClient.close();
    constrainedClient = null;
  } catch (error) {
    try {
      await captureScreenshot(
        constrainedClient ?? lightClient ?? client,
        path.join(artifacts, "experiment-lens-failure.png"),
      );
    } catch {}
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Browser issues: ${JSON.stringify(issues)}`,
      { cause: error },
    );
  }
  assert.deepEqual(issues, [], "Experiment Lens reported browser errors.");
  result.version = 1;
  writeFileSync(
    path.join(artifacts, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
} finally {
  constrainedClient?.close();
  lightClient?.close();
  client?.close();
  try {
    if (browser !== null) {
      await stopHeadlessChrome(browser);
    }
  } finally {
    try {
      await stopServer(server);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

process.stdout.write(
  `${JSON.stringify({ artifacts, result, status: "passed" })}\n`,
);
