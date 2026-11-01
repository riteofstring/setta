import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createCdpPage } from "./lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "./lib/headless-chrome.mjs";
import {
  browserFixtureRoot,
  buildBrowserFixture,
  serveBrowserFixture,
} from "./lib/browser-fixture.mjs";

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
        document.querySelector('[data-workspace-window-id="fixture-checklist-window"]') !== null`,
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
  throw new Error("The browser fixture did not reach an interactive state.");
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
      const floatingWindow = document.querySelector('[data-workspace-window-id="fixture-checklist-window"]');
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(pane instanceof HTMLElement) || !(floatingWindow instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        throw new Error("The marquee integration surface is incomplete.");
      }
      const bounds = floatingWindow.getBoundingClientRect();
      const end = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
      const start = { x: bounds.right + 100, y: bounds.bottom + 100 };
      if (start.x >= innerWidth || start.y >= innerHeight || document.elementFromPoint(start.x, start.y) !== pane) {
        throw new Error("The marquee fixture start must be bare pane outside the checklist window: " + JSON.stringify({ start, hit: document.elementFromPoint(start.x, start.y)?.outerHTML.slice(0, 300) }));
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
              hitChecklist: Boolean(hit?.closest('[data-workspace-window-id="fixture-checklist-window"]')),
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
        windowPresent: document.querySelector('[data-workspace-window-id="fixture-checklist-window"]') !== null,
      };
    })()`,
  );
}

async function readGraphLayering(client) {
  return evaluate(
    client,
    `(() => {
      const hitAt = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.closest("[data-edge-id]")?.dataset.edgeId ??
          hit?.closest("[data-workspace-graph-port-id]")?.dataset.workspaceGraphPortId ??
          null;
      };
      const path = document.querySelector('[data-edge-id="drift-amp"] .setta-workspace-graph-edge-interaction');
      const filter = document.querySelector('[data-workspace-section-shell="true"][data-section-id="filter"]');
      if (!(path instanceof SVGPathElement) || !(filter instanceof HTMLElement)) {
        return null;
      }
      const middle = path.getPointAtLength(path.getTotalLength() / 2);
      const crossing = new DOMPoint(middle.x, middle.y).matrixTransform(path.getScreenCTM());
      const bounds = filter.getBoundingClientRect();
      const ports = {};
      for (const anchor of document.querySelectorAll("[data-workspace-graph-port-anchor]")) {
        const rect = anchor.getBoundingClientRect();
        ports[anchor.closest("[data-workspace-graph-port-id]").dataset.workspaceGraphPortId] =
          hitAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      return {
        besideCrossing: hitAt(crossing.x, crossing.y + 8),
        crossing: { x: crossing.x, y: crossing.y },
        crossingHit: hitAt(crossing.x, crossing.y),
        crossingInsideNestedSection:
          crossing.x > bounds.left && crossing.x < bounds.right &&
          crossing.y > bounds.top && crossing.y < bounds.bottom,
        hiddenEndpointDrawn: document.querySelector('[data-edge-id="env-amp"]') !== null,
        ports,
        selected: document.querySelector('[data-edge-id="drift-amp"]')
          .classList.contains("setta-workspace-graph-edge--selected"),
      };
    })()`,
  );
}

async function verifyGraphLayering(client, url) {
  const loaded = client.waitForEvent("Page.loadEventFired", READY_TIMEOUT_MS);
  await client.send("Page.navigate", { url: `${url}?fixture=graph` });
  await loaded;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let layering = await readGraphLayering(client);
  while (layering === null && Date.now() < deadline) {
    await delay(50);
    layering = await readGraphLayering(client);
  }
  assert.ok(layering, "The graph fixture did not render its cables.");
  assert.equal(
    layering.crossingInsideNestedSection,
    true,
    "The crossing cable must pass over a section nested in a group.",
  );
  assert.equal(
    layering.crossingHit,
    "drift-amp",
    "A cable over a nested section is hidden or unclickable.",
  );
  assert.notEqual(
    layering.besideCrossing,
    "drift-amp",
    "The cable hit stroke swallows clicks beside the cable.",
  );
  for (const portId of ["drift-out", "filter-in", "amp-in", "amp-cv"]) {
    assert.equal(
      layering.ports[portId],
      portId,
      `Cable hit-testing covers port ${portId}.`,
    );
  }
  assert.equal(
    layering.hiddenEndpointDrawn,
    false,
    "A cable to a port scrolled out of its bounded group was drawn.",
  );
  for (const type of ["mousePressed", "mouseReleased"]) {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      clickCount: 1,
      type,
      ...layering.crossing,
    });
  }
  await evaluate(
    client,
    `(() => {
      const scroller = document.querySelector('[data-section-id="rack"] .setta-workspace-bounded-group-scroll');
      scroller.scrollTop = scroller.scrollHeight;
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
    })()`,
  );
  const after = await readGraphLayering(client);
  assert.equal(after?.selected, true, "Clicking the cable did not select it.");
  assert.equal(
    after?.hiddenEndpointDrawn,
    true,
    "Scrolling the bounded group did not restore the cable.",
  );
  return { crossing: layering.crossing, ports: layering.ports };
}

async function configureClient(client) {
  await Promise.all([
    client.send("Log.enable"),
    client.send("Page.enable"),
    client.send("Runtime.enable"),
  ]);
  await client.send("Emulation.setDeviceMetricsOverride", VIEWPORT);
}

async function verifyNestedSorting(client, key, cancel) {
  const path = await evaluate(
    client,
    `(() => {
    const point = (id) => {
      const element = document.querySelector('[data-sortable-section-id="' + id + '"]');
      if (!(element instanceof HTMLElement)) throw new Error('Missing sorting target ' + id);
      const bounds = element.getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    };
    return { start: point('sort-first'), end: point('sort-third') };
  })()`,
  );
  const modifiers = key.modifiers | 1;
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...path.start,
  });
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Alt",
    code: "AltLeft",
    windowsVirtualKeyCode: 18,
    modifiers,
  });
  await delay(50);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...path.start,
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
  });
  for (let step = 1; step <= MOVE_COUNT; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: path.start.x + ((path.end.x - path.start.x) * step) / MOVE_COUNT,
      y: path.start.y + ((path.end.y - path.start.y) * step) / MOVE_COUNT,
      buttons: 1,
      modifiers,
    });
    await delay(16);
  }
  const sortingActive = await evaluate(
    client,
    `document.querySelector('[data-sortable-section-id="sort-first-TempDND"]') !== null`,
  );
  assert.equal(
    sortingActive,
    true,
    "Nested sorting never activated its drag placeholder.",
  );
  if (cancel) {
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      modifiers,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      modifiers,
    });
  }
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...path.end,
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Alt",
    code: "AltLeft",
    windowsVirtualKeyCode: 18,
    modifiers: key.modifiers,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    ...key,
    modifiers: 0,
  });
  await delay(100);
  const order = await evaluate(
    client,
    `Array.from(document.querySelectorAll('[data-sortable-section-id^="sort-"]'), (element) => element.getAttribute('data-sortable-section-id'))`,
  );
  assert.deepEqual(
    order,
    cancel
      ? ["sort-first", "sort-second", "sort-third"]
      : ["sort-second", "sort-third", "sort-first"],
    cancel
      ? "Cancelling nested sorting changed the order."
      : "Nested sorting did not commit the new order.",
  );
  return order;
}

async function dragHandle(
  client,
  selector,
  target,
  cancel = false,
  touch = false,
) {
  const start = await evaluate(
    client,
    `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`,
  );
  if (touch) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 1 }],
    });
  } else {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...start,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...start,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
  }
  for (let step = 1; step <= MOVE_COUNT; step++) {
    const point = {
      x: start.x + ((target.x - start.x) * step) / MOVE_COUNT,
      y: start.y + ((target.y - start.y) * step) / MOVE_COUNT,
    };
    await moveHandlePointer(client, point, touch);
    await delay(25);
  }
  if (cancel)
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  await client.send(
    touch ? "Input.dispatchTouchEvent" : "Input.dispatchMouseEvent",
    touch
      ? { type: "touchEnd", touchPoints: [] }
      : {
          type: "mouseReleased",
          ...target,
          button: "left",
          buttons: 0,
          clickCount: 1,
        },
  );
  if (cancel)
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  await delay(450);
}

async function moveHandlePointer(client, point, touch) {
  await client.send(
    touch ? "Input.dispatchTouchEvent" : "Input.dispatchMouseEvent",
    touch
      ? { type: "touchMove", touchPoints: [{ ...point, id: 1 }] }
      : { type: "mouseMoved", ...point, buttons: 1 },
  );
}

async function verifyDirectHandles(client, touch = false) {
  const handle =
    '[data-section-id="meta-text"] [data-meta-control-drag-handle]';
  const point = await evaluate(
    client,
    `(() => {
    const r = document.querySelector('[data-section-id="sort-group"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom - 15 };
  })()`,
  );
  await dragHandle(client, handle, point, true, touch);
  assert.equal(
    await evaluate(
      client,
      `!!document.querySelector('.react-flow__node[data-id="meta-text"]')`,
    ),
    true,
    "Cancel must leave the control on the canvas",
  );
  await dragHandle(client, handle, point, false, touch);
  assert.equal(
    await evaluate(
      client,
      `!!document.querySelector('[data-section-id="sort-group"] [data-section-id="meta-text"]')`,
    ),
    true,
    "Direct handle must drop the control into the group",
  );
  await dragHandle(client, handle, { x: 1100, y: 170 }, false, touch);
  assert.equal(
    await evaluate(
      client,
      `!!document.querySelector('.react-flow__node[data-id="meta-text"]')`,
    ),
    true,
    "Direct handle must extract the control",
  );
  const itemTarget = await evaluate(
    client,
    `(() => {
    const r = document.querySelector('[data-workspace-item-id="second"]').getBoundingClientRect();
    return { x: r.left + r.width * 0.65, y: r.bottom - 2 };
  })()`,
  );
  await dragHandle(
    client,
    '[data-workspace-item-id="first"] [data-workspace-item-drag-handle]',
    itemTarget,
    false,
    touch,
  );
  assert.deepEqual(
    await evaluate(
      client,
      `Array.from(document.querySelectorAll('[data-section-id="parameters"] [data-workspace-item-id]'), e => e.dataset.workspaceItemId)`,
    ),
    ["second", "first"],
    "Direct parameter handle must reorder without selection mode",
  );
  await evaluate(
    client,
    `document.querySelector('[data-workspace-item-id="first"] [role="textbox"]').focus()`,
  );
  await delay(100);
  await client.send("Input.insertText", { text: "Changed" });
  await delay(100);
  assert.match(
    await evaluate(
      client,
      `document.querySelector('[data-workspace-item-id="first"]').textContent`,
    ),
    /Changed/,
    "Parameter editing must remain enabled after the drag",
  );
}

async function main() {
  buildBrowserFixture(process.argv.includes("--skip-build"));
  const { server, url } = await serveBrowserFixture(browserFixtureRoot);
  let browser = null;
  let client = null;
  try {
    browser = startHeadlessChrome(argumentValue("chrome-binary"));
    const port = await waitForHeadlessChrome(browser);
    ({ client } = await createCdpPage(port));
    await configureClient(client);
    const issues = collectPageIssues(client);
    await navigateToWorkspace(
      client,
      `${url}?fixture=interactions&color-mode=light`,
    );
    const lightCodeGutter = await inspectCodeGutterHorizontalScroll(client);
    assertCodeGutter(lightCodeGutter, "rgb(239, 241, 246)");
    await navigateToWorkspace(
      client,
      `${url}?fixture=interactions&color-mode=dark`,
    );
    const darkCodeGutter = await inspectCodeGutterHorizontalScroll(client);
    assertCodeGutter(darkCodeGutter, "rgb(16, 20, 27)");
    const screenshot = argumentValue("screenshot");
    if (screenshot !== null) {
      if (!isAbsolute(screenshot)) {
        throw new Error("--screenshot must be an absolute path.");
      }
      const { data } = await client.send("Page.captureScreenshot", {
        format: "png",
      });
      writeFileSync(screenshot, Buffer.from(data, "base64"));
    }
    await verifyDirectHandles(client);
    await client.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await navigateToWorkspace(
      client,
      `${url}?fixture=interactions&color-mode=dark`,
    );
    await verifyDirectHandles(client, true);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await navigateToWorkspace(
      client,
      `${url}?fixture=interactions&color-mode=dark`,
    );
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
    const cancelledSort = await verifyNestedSorting(
      client,
      sectionDragPath.key,
      true,
    );
    const completedSort = await verifyNestedSorting(
      client,
      sectionDragPath.key,
      false,
    );
    const graphLayering = await verifyGraphLayering(client, url);
    assert.deepEqual(
      issues,
      [],
      "The browser fixture reported browser errors.",
    );
    console.log(
      JSON.stringify(
        {
          codeGutters: {
            dark: darkCodeGutter,
            light: lightCodeGutter,
          },
          completedSelectionLabel: completed.completedSelectionLabel,
          cancelledSort,
          completedSort,
          floatingWindowSamples: checklistSamples.length,
          graphLayering,
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
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

await main();
