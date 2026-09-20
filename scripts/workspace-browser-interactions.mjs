import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createCdpPage } from "./lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "./lib/headless-chrome.mjs";
import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const PREVIEW_PORT = 4_175;
const PREVIEW_ORIGIN = `http://127.0.0.1:${String(PREVIEW_PORT)}`;
const READY_TIMEOUT_MS = 15_000;
const CONTROL_MODIFIER = 2;
const META_MODIFIER = 4;
const SHIFT_MODIFIER = 8;
const MOVE_COUNT = 20;
const VIEWPORT = {
  deviceScaleFactor: 1,
  height: 696,
  mobile: false,
  width: 1_492,
};

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

function buildBrowserSurface() {
  if (process.argv.includes("--skip-build")) {
    return;
  }
  runPnpm(["--filter", "@setta/workspace", "run", "build"]);
  runPnpm(["--filter", "@setta/workspace-playground", "run", "build"]);
}

function startPreview() {
  const playgroundRoot = path.join(
    repositoryRoot,
    "examples/workspace-playground",
  );
  const viteEntry = path.join(playgroundRoot, "node_modules/vite/bin/vite.js");
  const child = spawn(
    process.execPath,
    [
      viteEntry,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(PREVIEW_PORT),
      "--strictPort",
    ],
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
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (preview.child.exitCode !== null) {
      throw new Error(
        `Playground preview exited with ${String(preview.child.exitCode)}.\n${preview.output.stderr || preview.output.stdout}`,
      );
    }
    try {
      const response = await fetch(PREVIEW_ORIGIN);
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error("Playground preview did not become ready within 15 seconds.");
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
    throw new Error(
      `Playground preview process ${String(preview.child.pid)} did not terminate.`,
    );
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

function collectPageIssues(client) {
  const issues = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    issues.push(
      exceptionDetails?.exception?.description ??
        exceptionDetails?.text ??
        "Unidentified runtime exception",
    );
  });
  client.on("Runtime.consoleAPICalled", ({ args, type }) => {
    if (type !== "error" && type !== "assert") {
      return;
    }
    issues.push(
      args
        .map((argument) => argument.value ?? argument.description ?? "")
        .join(" "),
    );
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") {
      issues.push(entry.text ?? "Unidentified browser log error");
    }
  });
  return issues;
}

async function waitForWorkspace(client) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      client,
      `document.readyState === "complete" &&
        document.querySelector(".react-flow__pane") !== null &&
        document.querySelector(".react-flow__viewport") !== null &&
        document.querySelector('[data-workspace-window-id="playground-checklist-window"]') !== null`,
    );
    if (ready === true) {
      await evaluate(
        client,
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
      );
      return;
    }
    await delay(50);
  }
  throw new Error("The Playground did not reach an interactive state.");
}

async function inspectCodeGutterHorizontalScroll(client) {
  return evaluate(
    client,
    `(() => {
      const node = document.querySelector('.react-flow__node[data-id="code-editor"]');
      const scroller = node?.querySelector('.cm-scroller');
      const content = node?.querySelector('.cm-content');
      const gutter = node?.querySelector('.cm-gutters');
      if (!(scroller instanceof HTMLElement) || !(content instanceof HTMLElement) || !(gutter instanceof HTMLElement)) {
        throw new Error("The code editor gutter surface is incomplete.");
      }
      const previousMinWidth = content.style.minWidth;
      const previousScrollLeft = scroller.scrollLeft;
      const gutterLeftBefore = gutter.getBoundingClientRect().left;
      content.style.minWidth = String(scroller.clientWidth + 800) + "px";
      scroller.scrollLeft = 400;
      const gutterLeftAfter = gutter.getBoundingClientRect().left;
      const result = {
        backgroundColor: getComputedStyle(gutter).backgroundColor,
        gutterLeftDelta: gutterLeftAfter - gutterLeftBefore,
        scrollLeft: scroller.scrollLeft,
      };
      content.style.minWidth = previousMinWidth;
      scroller.scrollLeft = previousScrollLeft;
      return result;
    })()`,
  );
}

async function navigateToWorkspace(client, url) {
  const loaded = client.waitForEvent("Page.loadEventFired", READY_TIMEOUT_MS);
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForWorkspace(client);
}

function assertCodeGutter(codeGutter, expectedBackgroundColor) {
  assert.ok(
    codeGutter.scrollLeft > 0,
    "The code editor did not enter horizontal overflow.",
  );
  assert.equal(
    codeGutter.gutterLeftDelta,
    0,
    "The line-number gutter did not remain pinned during horizontal scrolling.",
  );
  assert.equal(
    codeGutter.backgroundColor,
    expectedBackgroundColor,
    "Horizontally scrolled code remained visible through the line-number gutter.",
  );
}

async function preparePointerOwnedSectionDrag(client) {
  return evaluate(
    client,
    `(() => {
      const node = document.querySelector('.react-flow__node[data-id="meta-text"]');
      const target = node?.querySelector('[role="textbox"]');
      const surface = node?.querySelector('section');
      if (!(node instanceof HTMLElement) || !(target instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
        throw new Error("The pointer-owned section drag surface is incomplete.");
      }
      const targetBounds = target.getBoundingClientRect();
      const nodeBounds = node.getBoundingClientRect();
      const start = {
        x: targetBounds.left + targetBounds.width / 2,
        y: targetBounds.top + targetBounds.height / 2,
      };
      const hit = document.elementFromPoint(start.x, start.y);
      if (!(hit instanceof Element) || !hit.closest('.react-flow__node[data-id="meta-text"]')) {
        throw new Error("The pointer-owned section drag target is covered.");
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body.focus();
      const macOS = navigator.userAgent.includes("Mac");
      return {
        activeElement: document.activeElement?.tagName ?? null,
        end: { x: start.x + 80, y: start.y + 40 },
        key: macOS
          ? { code: "MetaLeft", key: "Meta", modifiers: ${String(META_MODIFIER)}, windowsVirtualKeyCode: 91 }
          : { code: "ControlLeft", key: "Control", modifiers: ${String(CONTROL_MODIFIER)}, windowsVirtualKeyCode: 17 },
        nodeBounds: {
          height: nodeBounds.height,
          left: nodeBounds.left,
          top: nodeBounds.top,
          width: nodeBounds.width,
        },
        start,
        startHitHasNoDrag: Boolean(hit.closest('.nodrag')),
      };
    })()`,
  );
}

async function readPointerOwnedSectionDragState(client, point) {
  return evaluate(
    client,
    `(() => {
      const node = document.querySelector('.react-flow__node[data-id="meta-text"]');
      const surface = node?.querySelector('section');
      if (!(node instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
        throw new Error("The pointer-owned section drag surface disappeared.");
      }
      const bounds = node.getBoundingClientRect();
      const hit = document.elementFromPoint(${String(point.x)}, ${String(point.y)});
      return {
        bounds: {
          height: bounds.height,
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
        },
        hitHasNoDrag: Boolean(hit?.closest('.nodrag')),
        surfacePointerEvents: getComputedStyle(surface).pointerEvents,
      };
    })()`,
  );
}

async function dispatchPointerOwnedSectionDrag(client, path) {
  await client.send("Input.dispatchMouseEvent", {
    modifiers: 0,
    type: "mouseMoved",
    x: path.start.x,
    y: path.start.y,
  });
  await client.send("Input.dispatchKeyEvent", {
    ...path.key,
    type: "keyDown",
  });
  try {
    const armed = await readPointerOwnedSectionDragState(client, path.start);
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers: path.key.modifiers,
      type: "mousePressed",
      x: path.start.x,
      y: path.start.y,
    });
    for (let step = 1; step <= MOVE_COUNT; step += 1) {
      const progress = step / MOVE_COUNT;
      await client.send("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 1,
        modifiers: path.key.modifiers,
        type: "mouseMoved",
        x: path.start.x + (path.end.x - path.start.x) * progress,
        y: path.start.y + (path.end.y - path.start.y) * progress,
      });
      await delay(10);
    }
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      modifiers: path.key.modifiers,
      type: "mouseReleased",
      x: path.end.x,
      y: path.end.y,
    });
    await delay(100);
    return {
      after: await readPointerOwnedSectionDragState(client, path.end),
      armed,
    };
  } finally {
    await client.send("Input.dispatchKeyEvent", {
      code: path.key.code,
      key: path.key.key,
      modifiers: 0,
      type: "keyUp",
      windowsVirtualKeyCode: path.key.windowsVirtualKeyCode,
    });
  }
}

async function prepareMarqueePath(client) {
  return evaluate(
    client,
    `(() => {
      const pane = document.querySelector(".react-flow__pane");
      const floatingWindow = document.querySelector('[data-workspace-window-id="playground-checklist-window"]');
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(pane instanceof HTMLElement) || !(floatingWindow instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        throw new Error("The marquee integration surface is incomplete.");
      }
      const bounds = floatingWindow.getBoundingClientRect();
      const end = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
      const candidates = [];
      for (const radius of [40, 80, 120, 160, 200, 240, 300]) {
        for (let index = 0; index < 32; index += 1) {
          const angle = Math.PI * 2 * index / 32;
          candidates.push({
            x: end.x + Math.cos(angle) * radius,
            y: end.y + Math.sin(angle) * radius,
          });
        }
      }
      const start = candidates.find(({ x, y }) =>
        x >= 0 &&
        y >= 0 &&
        x < innerWidth &&
        y < innerHeight &&
        document.elementFromPoint(x, y) === pane,
      );
      if (!start) {
        throw new Error("No bare pane point surrounds the checklist window.");
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body.focus();
      return {
        activeElement: document.activeElement?.tagName ?? null,
        end,
        start,
        viewportTransform: viewport.style.transform,
      };
    })()`,
  );
}

async function dispatchShiftMarquee(client, path) {
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    modifiers: SHIFT_MODIFIER,
    type: "keyDown",
    windowsVirtualKeyCode: 16,
  });
  try {
    await client.send("Input.dispatchMouseEvent", {
      modifiers: SHIFT_MODIFIER,
      type: "mouseMoved",
      x: path.start.x,
      y: path.start.y,
    });
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers: SHIFT_MODIFIER,
      type: "mousePressed",
      x: path.start.x,
      y: path.start.y,
    });
    const samples = [];
    for (let step = 1; step <= MOVE_COUNT; step += 1) {
      const progress = step / MOVE_COUNT;
      const point = {
        x: path.start.x + (path.end.x - path.start.x) * progress,
        y: path.start.y + (path.end.y - path.start.y) * progress,
      };
      await client.send("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 1,
        modifiers: SHIFT_MODIFIER,
        type: "mouseMoved",
        x: point.x,
        y: point.y,
      });
      await delay(20);
      samples.push(
        await evaluate(
          client,
          `(() => {
            const hit = document.elementFromPoint(${String(point.x)}, ${String(point.y)});
            const selection = document.querySelector(".react-flow__selection");
            const selectionBounds = selection?.getBoundingClientRect();
            return {
              hitChecklist: Boolean(hit?.closest('[data-workspace-window-id="playground-checklist-window"]')),
              selection: selectionBounds
                ? { height: selectionBounds.height, width: selectionBounds.width }
                : null,
              viewportTransform: document.querySelector(".react-flow__viewport")?.style.transform ?? null,
            };
          })()`,
        ),
      );
    }
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      modifiers: SHIFT_MODIFIER,
      type: "mouseReleased",
      x: path.end.x,
      y: path.end.y,
    });
    await delay(100);
    return samples;
  } finally {
    await client.send("Input.dispatchKeyEvent", {
      code: "ShiftLeft",
      key: "Shift",
      modifiers: 0,
      type: "keyUp",
      windowsVirtualKeyCode: 16,
    });
  }
}

async function readCompletedSelection(client) {
  return evaluate(
    client,
    `(() => {
      const completedSelection = document.querySelector(".react-flow__nodesselection-rect");
      return {
        completedSelectionLabel: completedSelection?.getAttribute("aria-label") ?? null,
        liveSelectionPresent: document.querySelector(".react-flow__selection") !== null,
        viewportTransform: document.querySelector(".react-flow__viewport")?.style.transform ?? null,
        windowPresent: document.querySelector('[data-workspace-window-id="playground-checklist-window"]') !== null,
      };
    })()`,
  );
}

async function configureClient(client) {
  await Promise.all([
    client.send("Log.enable"),
    client.send("Page.enable"),
    client.send("Runtime.enable"),
  ]);
  await client.send("Emulation.setDeviceMetricsOverride", VIEWPORT);
}

async function main() {
  buildBrowserSurface();
  const preview = startPreview();
  let browser = null;
  let client = null;
  try {
    await waitForPreview(preview);
    browser = startHeadlessChrome(argumentValue("chrome-binary"));
    const port = await waitForHeadlessChrome(browser);
    ({ client } = await createCdpPage(port));
    await configureClient(client);
    const issues = collectPageIssues(client);
    await navigateToWorkspace(client, `${PREVIEW_ORIGIN}?color-mode=light`);
    const lightCodeGutter = await inspectCodeGutterHorizontalScroll(client);
    assertCodeGutter(lightCodeGutter, "rgb(239, 241, 246)");
    await navigateToWorkspace(client, `${PREVIEW_ORIGIN}?color-mode=dark`);
    const darkCodeGutter = await inspectCodeGutterHorizontalScroll(client);
    assertCodeGutter(darkCodeGutter, "rgb(16, 20, 27)");
    const sectionDragPath = await preparePointerOwnedSectionDrag(client);
    assert.equal(
      sectionDragPath.activeElement,
      "BODY",
      "The section drag must begin with keyboard focus outside Workspace.",
    );
    assert.equal(
      sectionDragPath.startHitHasNoDrag,
      true,
      "The section drag target does not exercise XYFlow's no-drag filter.",
    );
    const sectionDrag = await dispatchPointerOwnedSectionDrag(
      client,
      sectionDragPath,
    );
    assert.equal(
      sectionDrag.armed.surfacePointerEvents,
      "none",
      "The pointer-owned modifier did not arm section dragging.",
    );
    assert.equal(
      sectionDrag.armed.hitHasNoDrag,
      false,
      "The armed section drag still hit no-drag content.",
    );
    assert.ok(
      sectionDrag.after.bounds.left - sectionDragPath.nodeBounds.left > 60 &&
        sectionDrag.after.bounds.top - sectionDragPath.nodeBounds.top > 25,
      "The first pointer-owned modifier drag did not move the section.",
    );
    const path = await prepareMarqueePath(client);
    assert.equal(
      path.activeElement,
      "BODY",
      "The browser test must begin with keyboard focus outside Workspace.",
    );
    const samples = await dispatchShiftMarquee(client, path);
    const completed = await readCompletedSelection(client);
    const checklistSamples = samples.filter((sample) => sample.hitChecklist);
    assert.ok(
      checklistSamples.length > 0,
      "The marquee path did not cross the floating checklist window.",
    );
    assert.ok(
      samples.every(
        (sample) =>
          sample.selection !== null &&
          sample.selection.height > 0 &&
          sample.selection.width > 0,
      ),
      "The marquee disappeared before mouse-up.",
    );
    assert.ok(
      samples.every(
        (sample) => sample.viewportTransform === path.viewportTransform,
      ),
      "The XYFlow viewport moved during Shift marquee selection.",
    );
    assert.equal(
      completed.viewportTransform,
      path.viewportTransform,
      "The XYFlow viewport changed after marquee selection.",
    );
    assert.equal(
      completed.liveSelectionPresent,
      false,
      "The live marquee remained after mouse-up.",
    );
    assert.match(
      completed.completedSelectionLabel ?? "",
      /^(?:[2-9]|[1-9][0-9]+) selected sections:/u,
      "Mouse-up did not produce a multi-section selection.",
    );
    assert.equal(
      completed.windowPresent,
      true,
      "The floating checklist window closed during the gesture.",
    );
    assert.deepEqual(issues, [], "The Playground reported browser errors.");
    console.log(
      JSON.stringify(
        {
          codeGutters: {
            dark: darkCodeGutter,
            light: lightCodeGutter,
          },
          completedSelectionLabel: completed.completedSelectionLabel,
          floatingWindowSamples: checklistSamples.length,
          gestureSamples: samples.length,
          pointerOwnedSectionDelta: {
            x: sectionDrag.after.bounds.left - sectionDragPath.nodeBounds.left,
            y: sectionDrag.after.bounds.top - sectionDragPath.nodeBounds.top,
          },
          viewportTransform: completed.viewportTransform,
        },
        null,
        2,
      ),
    );
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
