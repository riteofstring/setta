import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createCdpPage } from "../lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "../lib/headless-chrome.mjs";
import { repositoryRoot, run } from "../lib/process.mjs";
import {
  assertEmptyOutputDirectory,
  createStagingDirectory,
  promoteStagingDirectory,
} from "./artifact-output.mjs";
import {
  PLAYGROUND_PARITY_SCENARIOS,
  PLAYGROUND_PARITY_SETUP_ACTIONS,
  REQUIRED_SCENARIO_COVERAGE,
  SCENARIO_CATALOG_VERSION,
  selectParityScenarios,
  validateScenarioCatalog,
} from "./scenario-catalog.mjs";

const DEFAULT_URL = "http://localhost:5174/";
const READY_TIMEOUT_MS = 15_000;
const SETTLE_DELAY_MS = 100;
const DRAG_MOVE_DELAY_MS = 8;
const CAPTURE_SCHEMA_VERSION = 1;
const PNG_SIGNATURE = "89504e470d0a1a0a";
const GOVERNED_PRODUCT_SOURCE_PATHS = [
  "apps/playground/src",
  "packages/workspace/src",
];
const PERMITTED_UNREACHABLE_SOURCE_PATHS = new Set([
  "packages/workspace/src/canvas/xyflow/WorkspaceXyflowAdapter.test.tsx",
  "packages/workspace/src/canvas/xyflow/WorkspaceXyflowAdapter.tsx",
  "packages/workspace/src/canvas/xyflow/WorkspaceXyflowNode.tsx",
  "packages/workspace/src/canvas/xyflow/types.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowChanges.test.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowChanges.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowProjection.test.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowProjection.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowRuntime.test.ts",
  "packages/workspace/src/canvas/xyflow/workspaceXyflowRuntime.ts",
]);
const WORKSPACE_DIST_DIRECTORY = path.join(
  repositoryRoot,
  "packages/workspace/dist",
);
const MODIFIER_BITS = {
  alt: 1,
  control: 2,
  meta: 4,
  shift: 8,
};
const MODIFIER_KEYS = {
  alt: { code: "AltLeft", key: "Alt", windowsVirtualKeyCode: 18 },
  control: { code: "ControlLeft", key: "Control", windowsVirtualKeyCode: 17 },
  meta: { code: "MetaLeft", key: "Meta", windowsVirtualKeyCode: 91 },
  shift: { code: "ShiftLeft", key: "Shift", windowsVirtualKeyCode: 16 },
};
const MOUSE_BUTTONS = {
  left: { button: "left", buttons: 1 },
  middle: { button: "middle", buttons: 4 },
  right: { button: "right", buttons: 2 },
};

const GEOMETRY_SNAPSHOT_EXPRESSION = `(() => {
  const round = (value) => Math.round(value * 1_000) / 1_000;
  const rect = (element) => {
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return {
      bottom: round(value.bottom),
      height: round(value.height),
      left: round(value.left),
      right: round(value.right),
      top: round(value.top),
      width: round(value.width),
    };
  };
  const style = (element) => {
    if (!element) return null;
    const value = getComputedStyle(element);
    return {
      display: value.display,
      opacity: value.opacity,
      pointerEvents: value.pointerEvents,
      position: value.position,
      transform: value.transform,
      visibility: value.visibility,
      zIndex: value.zIndex,
    };
  };
  const record = (element, extra = {}) => ({
    ...extra,
    rect: rect(element),
    style: style(element),
  });
  const shell = document.querySelector('[data-workspace-shell="true"]');
  const canvas = document.querySelector('.setta-workspace-shell-canvas');
  const flow = document.querySelector('.react-flow');
  const minimap = document.querySelector('[data-testid="rf__minimap"]');
  const viewport = document.querySelector('.react-flow__viewport');
  const sections = [...document.querySelectorAll('[data-section-id]')].map((element, index) => {
    const manager = element.closest('[data-testid="workspace-window-manager-window"]');
    const dock = element.closest('[data-testid="workspace-bottom-dock-window-panel"]');
    return record(element, {
      active: element.getAttribute('data-section-active'),
      id: element.getAttribute('data-section-id'),
      index,
      placement: manager ? 'floating-window' : dock ? 'bottom-dock' : 'canvas',
      presentation: element.getAttribute('data-section-presentation'),
      type: element.getAttribute('data-section-type'),
    });
  });
  const nodes = [...document.querySelectorAll('[data-id]')].map((element, index) =>
    record(element, {
      id: element.getAttribute('data-id'),
      index,
      selected: element.getAttribute('data-selected'),
    }),
  );
  const panes = [...document.querySelectorAll('[data-workspace-shell-pane-region]')].map((element) => {
    const pane = element.querySelector('[data-pane]');
    return record(element, {
      pane: element.getAttribute('data-workspace-shell-pane-region'),
      visible: pane?.getAttribute('data-visible') ?? null,
      width: pane?.style.width ?? null,
    });
  });
  const windows = [...document.querySelectorAll('[data-testid="workspace-window-manager-window"], [data-testid="workspace-bottom-dock-window-panel"]')].map((element, index) =>
    record(element, {
      focused: element.getAttribute('data-focused'),
      id: element.getAttribute('data-workspace-window-id'),
      index,
      kind: element.getAttribute('data-testid'),
    }),
  );
  const selection = [...document.querySelectorAll('.react-flow__nodesselection-rect, .react-flow__selection')].map((element, index) =>
    record(element, { className: element.className, index }),
  );
  const activeElement = document.activeElement;
  return {
    document: {
      devicePixelRatio: window.devicePixelRatio,
      readyState: document.readyState,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      title: document.title,
      url: location.href,
    },
    elements: {
      canvas: record(canvas),
      flow: record(flow),
      minimap: record(minimap),
      shell: record(shell),
      viewport: record(viewport),
    },
    focus: activeElement instanceof HTMLElement
      ? {
          ariaLabel: activeElement.getAttribute('aria-label'),
          dataTestId: activeElement.getAttribute('data-testid'),
          tagName: activeElement.tagName.toLowerCase(),
        }
      : null,
    nodes,
    panes,
    sections,
    selection,
    windows,
  };
})()`;

function usage() {
  return [
    "Usage: node scripts/xyflow-parity/capture-playground.mjs --mode <baseline|candidate> --output-dir <absolute-directory> [options]",
    "",
    "Options:",
    "  --url <http-url>                 Playground URL, default http://localhost:5174/",
    "  --scenario <id[,id]>             Capture only catalog scenarios by id",
    "  --width <pixels>                 Override each selected scenario width",
    "  --height <pixels>                Override each selected scenario height",
    "  --device-scale-factor <number>   Override the default device scale factor of 1",
    "  --chrome-binary <absolute-path>  Headless Chrome binary",
    "  --reference-commit <full-sha>    Frozen product reference commit",
    "  --validate-catalog               Validate the catalog without launching Chrome",
    "  --help                           Show this message",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    chromeBinary: null,
    deviceScaleFactor: null,
    height: null,
    help: false,
    mode: null,
    outputDir: null,
    referenceCommit: null,
    scenarioIds: [],
    url: null,
    validateCatalog: false,
    width: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (argument === "--validate-catalog") {
      options.validateCatalog = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}.`);
    }
    const name = argument.slice(2);
    if (
      ![
        "chrome-binary",
        "device-scale-factor",
        "height",
        "mode",
        "output-dir",
        "reference-commit",
        "scenario",
        "url",
        "width",
      ].includes(name)
    ) {
      throw new Error(`Unknown option: ${argument}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    if (name === "scenario") {
      options.scenarioIds.push(
        ...value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      );
      continue;
    }
    const key = name.replace(/-([a-z])/g, (_match, letter) =>
      letter.toUpperCase(),
    );
    if (options[key] !== null) {
      throw new Error(`${argument} may be supplied only once.`);
    }
    options[key] = value;
  }
  return options;
}

function requirePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function requirePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function normalizeOptions(options) {
  if (options.mode !== "baseline" && options.mode !== "candidate") {
    throw new Error("--mode must be baseline or candidate.");
  }
  if (options.outputDir === null || !path.isAbsolute(options.outputDir)) {
    throw new Error("--output-dir must be an absolute directory path.");
  }
  const url = new URL(options.url ?? DEFAULT_URL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--url must use http or https.");
  }
  if (options.chromeBinary !== null && !path.isAbsolute(options.chromeBinary)) {
    throw new Error("--chrome-binary must be an absolute path.");
  }
  if (
    options.referenceCommit === null ||
    !/^[0-9a-f]{40}$/.test(options.referenceCommit)
  ) {
    throw new Error(
      "--reference-commit must be a full 40-character lowercase commit SHA.",
    );
  }
  return {
    chromeBinary: options.chromeBinary,
    deviceScaleFactor:
      options.deviceScaleFactor === null
        ? 1
        : requirePositiveNumber(
            options.deviceScaleFactor,
            "--device-scale-factor",
          ),
    height:
      options.height === null
        ? null
        : requirePositiveInteger(options.height, "--height"),
    mode: options.mode,
    outputDir: path.resolve(options.outputDir),
    referenceCommit: resolveCommit(options.referenceCommit),
    scenarioIds: options.scenarioIds,
    url: url.href,
    width:
      options.width === null
        ? null
        : requirePositiveInteger(options.width, "--width"),
  };
}

function captureUrl(baseUrl, theme) {
  const url = new URL(baseUrl);
  url.searchParams.set("setta-xyflow-parity-theme", theme);
  return url.href;
}

function viewportForScenario(scenario, options) {
  return {
    deviceScaleFactor: options.deviceScaleFactor,
    height: options.height ?? scenario.viewport.height,
    mobile: false,
    width: options.width ?? scenario.viewport.width,
  };
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

async function waitForReady(client) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      client,
      `document.readyState === "complete" &&
        document.querySelector('[data-workspace-shell="true"]') !== null &&
        document.querySelector('.react-flow') !== null &&
        document.querySelector('[data-testid="rf__minimap"]') !== null`,
    );
    if (ready === true) {
      await evaluate(
        client,
        `Promise.resolve(document.fonts?.ready).then(() =>
          new Promise((resolve) => requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(true)),
          )),
        )`,
      );
      await delay(SETTLE_DELAY_MS);
      return;
    }
    await delay(50);
  }
  throw new Error("The Playground did not reach an inspectable state.");
}

function pageIssueCollector(client) {
  const issues = [];
  const unsubscribers = [
    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      issues.push(
        `exception: ${exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? "Unidentified runtime exception"}`,
      );
    }),
    client.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (type === "error" || type === "assert") {
        issues.push(
          `console ${type}: ${(args ?? []).map((argument) => argument.value ?? argument.description ?? "").join(" ")}`,
        );
      }
    }),
    client.on("Log.entryAdded", ({ entry }) => {
      if (entry?.level === "error") {
        issues.push(
          `log error: ${entry.url ?? "unknown URL"}: ${entry.text ?? "Unidentified browser log error"}`,
        );
      }
    }),
  ];
  return {
    assertNone(context) {
      if (issues.length > 0) {
        throw new Error(
          `${context} emitted browser issues:\n${issues.join("\n")}`,
        );
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

async function addThemeInitializer(client) {
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const theme = new URLSearchParams(location.search).get('setta-xyflow-parity-theme');
      const applyTheme = () => {
        if (!document.documentElement) return false;
        document.documentElement.classList.toggle('dark', theme === 'dark');
        return true;
      };
      if (!applyTheme()) {
        const observer = new MutationObserver(() => {
          if (applyTheme()) observer.disconnect();
        });
        observer.observe(document, { childList: true });
      }
    })();`,
  });
}

function modifierMask(modifiers = []) {
  return modifiers.reduce((mask, modifier) => {
    const bit = MODIFIER_BITS[modifier];
    if (bit === undefined) {
      throw new Error(`Unsupported input modifier: ${modifier}.`);
    }
    return mask | bit;
  }, 0);
}

async function pressModifiers(client, modifiers) {
  let mask = 0;
  for (const modifier of modifiers) {
    const key = MODIFIER_KEYS[modifier];
    if (!key) {
      throw new Error(`Unsupported input modifier: ${modifier}.`);
    }
    mask |= MODIFIER_BITS[modifier];
    await client.send("Input.dispatchKeyEvent", {
      ...key,
      modifiers: mask,
      type: "keyDown",
    });
  }
}

async function releaseModifiers(client, modifiers) {
  let mask = modifierMask(modifiers);
  for (const modifier of [...modifiers].reverse()) {
    const key = MODIFIER_KEYS[modifier];
    if (!key) {
      throw new Error(`Unsupported input modifier: ${modifier}.`);
    }
    mask &= ~MODIFIER_BITS[modifier];
    await client.send("Input.dispatchKeyEvent", {
      ...key,
      modifiers: mask,
      type: "keyUp",
    });
  }
}

async function actionPoint(
  client,
  selector,
  relativePoint = { x: 0.5, y: 0.5 },
) {
  return evaluate(
    client,
    `(() => {
      const selector = ${JSON.stringify(selector)};
      const relativePoint = ${JSON.stringify(relativePoint)};
      const element = document.querySelector(selector);
      if (!element) throw new Error('Scenario action target is missing: ' + selector);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
        throw new Error('Scenario action target is not visible: ' + selector);
      }
      return {
        x: rect.left + rect.width * relativePoint.x,
        y: rect.top + rect.height * relativePoint.y,
      };
    })()`,
  );
}

async function sectionActionPoint(client, sectionId, pointKind = "body") {
  return evaluate(
    client,
    `(() => {
      const sectionId = ${JSON.stringify(sectionId)};
      const pointKind = ${JSON.stringify(pointKind)};
      const section = [...document.querySelectorAll('[data-section-id]')]
        .filter((element) => element.getAttribute('data-section-id') === sectionId && element.getAttribute('role') === 'group')
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        })[0];
      if (!section) throw new Error('Scenario section target is missing: ' + sectionId);
      const style = getComputedStyle(section);
      const rect = section.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
        throw new Error('Scenario section target is not visible: ' + sectionId);
      }
      const candidates = pointKind === 'header'
        ? [[0.08, 0.14], [0.18, 0.14], [0.08, 0.25]]
        : [[0.12, 0.72], [0.82, 0.72], [0.2, 0.86], [0.1, 0.5]];
      for (const [relativeX, relativeY] of candidates) {
        const x = rect.left + rect.width * relativeX;
        const y = rect.top + rect.height * relativeY;
        const hit = document.elementFromPoint(x, y);
        if (
          hit instanceof Element &&
          section.contains(hit) &&
          !hit.closest('button, input, select, textarea, [contenteditable="true"], .cm-editor')
        ) {
          return { x, y };
        }
      }
      throw new Error('Scenario section target has no non-interactive ' + pointKind + ' point: ' + sectionId);
    })()`,
  );
}

function roundPoint(point) {
  return {
    x: Math.round(point.x * 1_000) / 1_000,
    y: Math.round(point.y * 1_000) / 1_000,
  };
}

function mouseButton(button = "left") {
  const value = MOUSE_BUTTONS[button];
  if (!value) {
    throw new Error(`Unsupported mouse button: ${button}.`);
  }
  return value;
}

async function settle(client) {
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
  );
  await delay(SETTLE_DELAY_MS);
}

async function dispatchMouse(client, parameters) {
  await client.send("Input.dispatchMouseEvent", parameters);
}

async function clickPoint(client, point, action, button = "left") {
  const descriptor = mouseButton(button);
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  await pressModifiers(client, modifierNames);
  try {
    await dispatchMouse(client, {
      modifiers,
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await dispatchMouse(client, {
      button: descriptor.button,
      buttons: descriptor.buttons,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
      x: point.x,
      y: point.y,
    });
    await dispatchMouse(client, {
      button: descriptor.button,
      buttons: 0,
      clickCount: 1,
      modifiers,
      type: "mouseReleased",
      x: point.x,
      y: point.y,
    });
  } finally {
    await releaseModifiers(client, modifierNames);
  }
  await settle(client);
}

async function click(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  await clickPoint(client, point, action, action.button ?? "left");
  return {
    id: action.id,
    kind: action.kind ?? "click",
    modifiers: action.modifiers ?? [],
    point: roundPoint(point),
    selector: action.selector,
  };
}

async function sectionClick(client, action) {
  const point = await sectionActionPoint(client, action.sectionId, "header");
  await clickPoint(client, point, action);
  return {
    id: action.id,
    kind: "section-click",
    modifiers: action.modifiers ?? [],
    point: roundPoint(point),
    sectionId: action.sectionId,
  };
}

async function dragPoints(client, action) {
  const start = action.sectionId
    ? await sectionActionPoint(
        client,
        action.sectionId,
        action.pointKind ?? "header",
      )
    : await actionPoint(
        client,
        action.selector,
        action.startRelativePoint ?? action.relativePoint,
      );
  if (action.endSelector) {
    return {
      end: await actionPoint(
        client,
        action.endSelector,
        action.endRelativePoint ?? action.relativePoint,
      ),
      start,
    };
  }
  if (action.delta) {
    return {
      end: { x: start.x + action.delta.x, y: start.y + action.delta.y },
      start,
    };
  }
  if (action.endRelativePoint) {
    return {
      end: await actionPoint(client, action.selector, action.endRelativePoint),
      start,
    };
  }
  throw new Error(`Drag action ${action.id} needs an end point or delta.`);
}

async function drag(client, action, heldPointer) {
  if (heldPointer.value !== null) {
    throw new Error(
      `Drag action ${action.id} cannot start while an input is held.`,
    );
  }
  const { start, end } = await dragPoints(client, action);
  const descriptor = mouseButton(action.button ?? "left");
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  const steps = action.steps ?? 8;
  let retained = false;
  await pressModifiers(client, modifierNames);
  if (modifierNames.length > 0) {
    await settle(client);
  }
  try {
    await dispatchMouse(client, {
      modifiers,
      type: "mouseMoved",
      x: start.x,
      y: start.y,
    });
    await dispatchMouse(client, {
      button: descriptor.button,
      buttons: descriptor.buttons,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
      x: start.x,
      y: start.y,
    });
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      await dispatchMouse(client, {
        button: descriptor.button,
        buttons: descriptor.buttons,
        modifiers,
        type: "mouseMoved",
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      });
      await delay(DRAG_MOVE_DELAY_MS);
    }
    if (action.hold === true) {
      heldPointer.value = {
        button: descriptor.button,
        modifiers,
        modifierNames,
        point: end,
      };
      retained = true;
    } else {
      await dispatchMouse(client, {
        button: descriptor.button,
        buttons: 0,
        clickCount: 1,
        modifiers,
        type: "mouseReleased",
        x: end.x,
        y: end.y,
      });
    }
  } finally {
    if (!retained) {
      await releaseModifiers(client, modifierNames);
    }
  }
  await settle(client);
  return {
    end: roundPoint(end),
    held: action.hold === true,
    id: action.id,
    kind: action.kind ?? "drag",
    modifiers: modifierNames,
    sectionId: action.sectionId ?? null,
    selector: action.selector ?? null,
    start: roundPoint(start),
  };
}

async function releaseHeldPointer(client, heldPointer) {
  const held = heldPointer.value;
  if (held === null) {
    return;
  }
  heldPointer.value = null;
  try {
    await dispatchMouse(client, {
      button: held.button,
      buttons: 0,
      clickCount: 1,
      modifiers: held.modifiers,
      type: "mouseReleased",
      x: held.point.x,
      y: held.point.y,
    });
  } finally {
    await releaseModifiers(client, held.modifierNames);
  }
}

async function wheel(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  await pressModifiers(client, modifierNames);
  try {
    await dispatchMouse(client, {
      deltaX: action.deltaX ?? 0,
      deltaY: action.deltaY,
      modifiers,
      type: "mouseWheel",
      x: point.x,
      y: point.y,
    });
  } finally {
    await releaseModifiers(client, modifierNames);
  }
  await settle(client);
  return {
    deltaX: action.deltaX ?? 0,
    deltaY: action.deltaY,
    id: action.id,
    kind: "wheel",
    modifiers: modifierNames,
    point: roundPoint(point),
    selector: action.selector,
  };
}

async function hover(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  await dispatchMouse(client, {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await settle(client);
  return {
    id: action.id,
    kind: "hover",
    point: roundPoint(point),
    selector: action.selector,
  };
}

async function typeText(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  await clickPoint(client, point, action);
  await client.send("Input.insertText", { text: action.text });
  await settle(client);
  return {
    id: action.id,
    kind: "type",
    point: roundPoint(point),
    selector: action.selector,
    textLength: action.text.length,
  };
}

async function key(client, action) {
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  await pressModifiers(client, modifierNames);
  try {
    await client.send("Input.dispatchKeyEvent", {
      code: action.code,
      key: action.key,
      modifiers,
      text: action.text,
      type: "keyDown",
      windowsVirtualKeyCode: action.windowsVirtualKeyCode,
    });
    await client.send("Input.dispatchKeyEvent", {
      code: action.code,
      key: action.key,
      modifiers,
      type: "keyUp",
      windowsVirtualKeyCode: action.windowsVirtualKeyCode,
    });
  } finally {
    await releaseModifiers(client, modifierNames);
  }
  await settle(client);
  return {
    id: action.id,
    key: action.key,
    kind: "key",
    modifiers: modifierNames,
  };
}

async function executeAction(client, action, heldPointer) {
  const kind = action.kind ?? "click";
  if (kind === "click") {
    return click(client, action);
  }
  if (kind === "context-menu") {
    return click(client, { ...action, button: "right" });
  }
  if (kind === "section-click") {
    return sectionClick(client, action);
  }
  if (kind === "drag" || kind === "section-drag") {
    return drag(client, action, heldPointer);
  }
  if (kind === "wheel") {
    return wheel(client, action);
  }
  if (kind === "hover") {
    return hover(client, action);
  }
  if (kind === "type") {
    return typeText(client, action);
  }
  if (kind === "key") {
    return key(client, action);
  }
  throw new Error(`Unsupported scenario action kind: ${kind}.`);
}

async function assertSelectorsPresent(client, selectors, context) {
  const missing = await evaluate(
    client,
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.filter((selector) => document.querySelector(selector) === null);
    })()`,
  );
  if (missing.length > 0) {
    throw new Error(`${context} is missing: ${missing.join(", ")}.`);
  }
}

function assertGeometry(geometry, scenario) {
  if (!geometry.elements.shell?.rect || !geometry.elements.flow?.rect) {
    throw new Error(
      `Scenario ${scenario.id} did not report shell and flow geometry.`,
    );
  }
  if (
    geometry.elements.shell.rect.width <= 0 ||
    geometry.elements.shell.rect.height <= 0 ||
    geometry.elements.flow.rect.width <= 0 ||
    geometry.elements.flow.rect.height <= 0
  ) {
    throw new Error(
      `Scenario ${scenario.id} has non-positive shell or flow geometry.`,
    );
  }
  if (geometry.document.theme !== scenario.theme) {
    throw new Error(
      `Scenario ${scenario.id} rendered ${geometry.document.theme} instead of ${scenario.theme}.`,
    );
  }
}

function pngDimensions(base64Data) {
  const image = Buffer.from(base64Data, "base64");
  if (image.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error("Chrome did not return a PNG screenshot.");
  }
  if (image.length < 24) {
    throw new Error("Chrome returned a truncated PNG screenshot.");
  }
  return {
    height: image.readUInt32BE(20),
    width: image.readUInt32BE(16),
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function captureScenario({
  client,
  context,
  issues,
  options,
  scenario,
  stagingDirectory,
}) {
  const viewport = viewportForScenario(scenario, options);
  await client.send("Emulation.setDeviceMetricsOverride", viewport);
  issues.clear();
  const url = captureUrl(options.url, scenario.theme);
  const loaded = client.waitForEvent("Page.loadEventFired", READY_TIMEOUT_MS);
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForReady(client);
  const interactions = [];
  const heldPointer = { value: null };
  try {
    if (scenario.fixtureSetup !== false) {
      for (const action of PLAYGROUND_PARITY_SETUP_ACTIONS) {
        interactions.push({
          ...(await executeAction(client, action, heldPointer)),
          phase: "fixture-setup",
        });
      }
    }
    for (const action of scenario.actions) {
      interactions.push({
        ...(await executeAction(client, action, heldPointer)),
        phase: "scenario",
      });
    }
    await assertSelectorsPresent(
      client,
      scenario.requiredSelectors,
      scenario.id,
    );
    issues.assertNone(`${scenario.id} before screenshot`);
    const geometry = await evaluate(client, GEOMETRY_SNAPSHOT_EXPRESSION);
    assertGeometry(geometry, scenario);
    const screenshot = await client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    if (typeof screenshot.data !== "string") {
      throw new Error(`Chrome returned no screenshot data for ${scenario.id}.`);
    }
    const screenshotDimensions = pngDimensions(screenshot.data);
    const expectedDimensions = {
      height: Math.round(viewport.height * viewport.deviceScaleFactor),
      width: Math.round(viewport.width * viewport.deviceScaleFactor),
    };
    if (
      screenshotDimensions.height !== expectedDimensions.height ||
      screenshotDimensions.width !== expectedDimensions.width
    ) {
      throw new Error(
        `Scenario ${scenario.id} screenshot dimensions ${JSON.stringify(screenshotDimensions)} do not match ${JSON.stringify(expectedDimensions)}.`,
      );
    }
    const scenarioDirectory = path.join(stagingDirectory, scenario.id);
    writeFileSync(
      path.join(scenarioDirectory, "screenshot.png"),
      screenshot.data,
      "base64",
    );
    const receipt = {
      capture: {
        baselineSourceGuard: context.baselineSourceGuard,
        builtWorkspace: context.builtWorkspace,
        chrome: context.chrome,
        captureCommit: context.captureCommit,
        frozenReferenceCommit: context.frozenReferenceCommit,
        liveResponses: context.liveResponses,
        mode: options.mode,
        recordedAt: new Date().toISOString(),
        sourceUrl: options.url,
        stabilization: {
          fontReadiness: "document.fonts.ready",
          postActionDelayMs: SETTLE_DELAY_MS,
          settledFrames: 2,
        },
      },
      geometry,
      interactions,
      scenario: {
        catalogVersion: SCENARIO_CATALOG_VERSION,
        coverage: scenario.coverage,
        fixtureId: scenario.fixtureId,
        id: scenario.id,
        theme: scenario.theme,
        viewportId: scenario.viewportId,
      },
      screenshot: {
        dimensions: screenshotDimensions,
        file: `${scenario.id}/screenshot.png`,
      },
      viewport,
    };
    writeJson(path.join(scenarioDirectory, "receipt.json"), receipt);
    return receipt;
  } finally {
    await releaseHeldPointer(client, heldPointer);
  }
}

function responseReceipt(response, bytes) {
  return {
    bytes: bytes.length,
    contentType: response.headers.get("content-type"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    status: response.status,
    url: response.url,
  };
}

async function readLiveResponse(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `${label} request failed with HTTP ${String(response.status)}.`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, receipt: responseReceipt(response, bytes) };
}

async function livePlaygroundResponseHashes(url) {
  const documentResponse = await readLiveResponse(url, "Live Playground");
  const documentHtml = documentResponse.bytes.toString("utf8");
  const scriptSources = [
    ...documentHtml.matchAll(
      /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu,
    ),
  ].map((match) => match[1]);
  const entrySource =
    scriptSources.find((source) =>
      new URL(source, documentResponse.receipt.url).pathname.startsWith(
        "/src/",
      ),
    ) ?? scriptSources.at(-1);
  if (!entrySource) {
    throw new Error(
      "Live Playground document has no JavaScript entry response.",
    );
  }
  const stylesheetUrl = new URL("/src/index.css", documentResponse.receipt.url)
    .href;
  const [javascriptResponse, stylesheetResponse] = await Promise.all([
    readLiveResponse(
      new URL(entrySource, documentResponse.receipt.url).href,
      "Live Playground JavaScript",
    ),
    readLiveResponse(stylesheetUrl, "Live Playground stylesheet"),
  ]);
  return {
    document: documentResponse.receipt,
    javascript: javascriptResponse.receipt,
    stylesheet: stylesheetResponse.receipt,
  };
}

function resolveCommit(revision) {
  return run("git", ["rev-parse", "--verify", `${revision}^{commit}`], {
    capture: true,
  }).stdout.trim();
}

function currentCommit() {
  return resolveCommit("HEAD");
}

function workspaceDistArtifactHashes() {
  if (!existsSync(WORKSPACE_DIST_DIRECTORY)) {
    throw new Error(
      `The built workspace artifact is missing: ${WORKSPACE_DIST_DIRECTORY}.`,
    );
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };
  visit(WORKSPACE_DIST_DIRECTORY);
  if (files.length === 0) {
    throw new Error(
      `The built workspace artifact has no files: ${WORKSPACE_DIST_DIRECTORY}.`,
    );
  }
  return {
    directory: path.relative(repositoryRoot, WORKSPACE_DIST_DIRECTORY),
    files: files.sort().map((filePath) => ({
      path: path.relative(repositoryRoot, filePath),
      sha256: createHash("sha256").update(readFileSync(filePath)).digest("hex"),
    })),
  };
}

function sameArtifactHashes(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function governedProductSourceChanges(referenceCommit) {
  const changed = run(
    "git",
    [
      "diff",
      "--name-only",
      referenceCommit,
      "--",
      ...GOVERNED_PRODUCT_SOURCE_PATHS,
    ],
    { capture: true },
  )
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  const untracked = run(
    "git",
    [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      ...GOVERNED_PRODUCT_SOURCE_PATHS,
    ],
    { capture: true },
  )
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  return [...new Set([...changed, ...untracked])].sort();
}

function isTestSourcePath(filePath) {
  return /\.test\.[cm]?[jt]sx?$/u.test(filePath);
}

function baselineSourceGuard(referenceCommit) {
  const ignoredTestDiffPaths = [];
  const permittedUnreachableDiffPaths = [];
  const rejectedProductSourceDiffPaths = [];
  for (const filePath of governedProductSourceChanges(referenceCommit)) {
    if (PERMITTED_UNREACHABLE_SOURCE_PATHS.has(filePath)) {
      permittedUnreachableDiffPaths.push(filePath);
    } else if (isTestSourcePath(filePath)) {
      ignoredTestDiffPaths.push(filePath);
    } else {
      rejectedProductSourceDiffPaths.push(filePath);
    }
  }
  return {
    ignoredTestDiffPaths,
    permittedUnreachableDiffPaths,
    rejectedProductSourceDiffPaths,
  };
}

function assertBaselineProductSource(referenceCommit) {
  const sourceGuard = baselineSourceGuard(referenceCommit);
  if (sourceGuard.rejectedProductSourceDiffPaths.length > 0) {
    throw new Error(
      `Baseline capture requires mounted product source to match ${referenceCommit}. Differences:\n${sourceGuard.rejectedProductSourceDiffPaths.join("\n")}`,
    );
  }
  return sourceGuard;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const catalog = validateScenarioCatalog();
  if (parsed.validateCatalog) {
    console.log(
      JSON.stringify(
        {
          catalogVersion: SCENARIO_CATALOG_VERSION,
          coverage: catalog.coverage,
          scenarioCount: catalog.scenarioCount,
        },
        null,
        2,
      ),
    );
    return;
  }
  const options = normalizeOptions(parsed);
  const scenarios = selectParityScenarios(options.scenarioIds);
  assertEmptyOutputDirectory(options.outputDir);
  const baselineSourceGuard =
    options.mode === "baseline"
      ? assertBaselineProductSource(options.referenceCommit)
      : null;
  const builtWorkspace = workspaceDistArtifactHashes();
  const liveResponses = await livePlaygroundResponseHashes(options.url);
  const stagingDirectory = createStagingDirectory(options.outputDir);
  let browser = null;
  let client = null;
  try {
    browser = startHeadlessChrome(options.chromeBinary);
    const port = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(port);
    client = page.client;
    await Promise.all([
      client.send("Log.enable"),
      client.send("Page.enable"),
      client.send("Runtime.enable"),
    ]);
    await addThemeInitializer(client);
    const issues = pageIssueCollector(client);
    try {
      const { jsVersion, product, revision, userAgent } =
        await client.send("Browser.getVersion");
      const context = {
        baselineSourceGuard,
        chrome: {
          binary: browser.child.spawnfile ?? options.chromeBinary ?? "default",
          jsVersion,
          product,
          revision,
          userAgent,
        },
        builtWorkspace,
        captureCommit: currentCommit(),
        frozenReferenceCommit: options.referenceCommit,
        liveResponses,
      };
      const receipts = [];
      for (const scenario of scenarios) {
        const scenarioDirectory = path.join(stagingDirectory, scenario.id);
        if (existsSync(scenarioDirectory)) {
          throw new Error(
            `Scenario output already exists: ${scenarioDirectory}.`,
          );
        }
        mkdirSync(scenarioDirectory);
        const receipt = await captureScenario({
          client,
          context,
          issues,
          options,
          scenario,
          stagingDirectory,
        });
        receipts.push(receipt);
      }
      if (!sameArtifactHashes(builtWorkspace, workspaceDistArtifactHashes())) {
        throw new Error("The built workspace artifact changed during capture.");
      }
      if (
        JSON.stringify(liveResponses) !==
        JSON.stringify(await livePlaygroundResponseHashes(options.url))
      ) {
        throw new Error("Live Playground responses changed during capture.");
      }
      const manifest = {
        capture: {
          ...context,
          mode: options.mode,
          recordedAt: new Date().toISOString(),
          sourceUrl: options.url,
          stabilization: {
            fontReadiness: "document.fonts.ready",
            postActionDelayMs: SETTLE_DELAY_MS,
            settledFrames: 2,
          },
        },
        catalog: {
          catalogVersion: SCENARIO_CATALOG_VERSION,
          completeCatalog:
            scenarios.length === PLAYGROUND_PARITY_SCENARIOS.length,
          requiredCoverage: REQUIRED_SCENARIO_COVERAGE,
          selectedScenarioIds: scenarios.map((scenario) => scenario.id),
        },
        schemaVersion: CAPTURE_SCHEMA_VERSION,
        scenarios: receipts.map((receipt) => ({
          id: receipt.scenario.id,
          receipt: `${receipt.scenario.id}/receipt.json`,
          screenshot: receipt.screenshot.file,
          theme: receipt.scenario.theme,
          viewport: receipt.viewport,
        })),
      };
      writeJson(path.join(stagingDirectory, "manifest.json"), manifest);
      promoteStagingDirectory(stagingDirectory, options.outputDir);
      console.log(
        JSON.stringify(
          {
            mode: options.mode,
            outputDir: options.outputDir,
            referenceCommit: options.referenceCommit,
            scenarioCount: scenarios.length,
            scenarioIds: scenarios.map((scenario) => scenario.id),
          },
          null,
          2,
        ),
      );
    } finally {
      issues.dispose();
    }
  } finally {
    client?.close();
    try {
      if (browser !== null) {
        await stopHeadlessChrome(browser);
      }
    } finally {
      if (existsSync(stagingDirectory)) {
        rmSync(stagingDirectory, { force: true, recursive: true });
      }
    }
  }
}

await main();
