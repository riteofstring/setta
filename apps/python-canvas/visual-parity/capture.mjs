import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  fetchCanonicalSnapshot,
  runAgainstCopiedProductionProject,
} from "../browser-processes.mjs";
import { openWorkspaceCanvas } from "../callable-commit.browser.mjs";
import {
  activateCodeEditor,
  clickElementCenter,
  evaluate,
  focusElement,
  insertText,
  pressEnter,
  visibleElementPoint,
  waitFor,
} from "../browser-page.mjs";
import { createParityExtensionCaptureActions } from "./capture-extension-actions.mjs";
import {
  parityFixtureCatalog,
  parityManifestVersion,
  parityScenarioCatalog,
  parityViewports,
  registeredPythonCanvasSectionKinds,
  requiredParityCoverage,
} from "./scenario-manifest.mjs";

const applicationRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(applicationRoot, "../../..");
const baselineRoot = path.join(
  repositoryRoot,
  "docs",
  "evidence",
  "xyflow-12-cutover",
  "baseline",
);
const generatedSectionId = "python-canvas:generated-python";
const generatedSectionSelector = `[data-section-id=${JSON.stringify(generatedSectionId)}]`;
const generatedEditorSelector =
  '[aria-label="Generated Python code editor, generated output read-only"]';
const generatedRunSelector = `${generatedSectionSelector} [data-generated-python-run]`;
const terminalPaneSelector =
  '[data-workspace-joined-section-group]:has(> [data-section-id="python-canvas:generated-python"]) .python-canvas-generated-python-terminal-pane';
const terminalSurfaceSelector = `${terminalPaneSelector} [data-attached-terminal-section-id="generated-python-runtime"]`;
const terminalTextAreaSelector = `${terminalSurfaceSelector} .xterm-helper-textarea`;
const terminalRowsSelector = `${terminalSurfaceSelector} .xterm-rows`;
const terminalScreenSelector = `${terminalSurfaceSelector} .xterm-screen`;
const terminalViewportSelector = `${terminalSurfaceSelector} .xterm-viewport`;
const terminalToggleSelector = `${generatedSectionSelector} [data-generated-python-terminal-toggle]`;
const workspaceCanvasSelector =
  '[role="region"][aria-label="Workspace canvas"]';
const workspaceCanvasPaneSelector =
  '.react-flow__pane[aria-label="Workspace canvas background"]';
const savedViewsTabSelector =
  '[data-workspace-shell-tab="leading:saved-views"]';
const sectionTabSelector =
  '[data-workspace-shell-tab="trailing:section-settings"]';
const savedViewsPaneSelector = '[data-testid="workspace-saved-views-pane"]';
const canonicalCaptureNormalizations = Object.freeze({
  "canonical-callable-replacement": Object.freeze({
    collection: "callables",
    sectionPrefix: "python-canvas:callable:",
    stableId: "id:000000000000000000000000000000c1",
  }),
  "canonical-list-replacement": Object.freeze({
    collection: "lists",
    sectionPrefix: "python-canvas:list:",
    stableId: "id:00000000000000000000000000000011",
  }),
  "canonical-param-dict-replacement": Object.freeze({
    collection: "parameterDictionaries",
    sectionPrefix: "python-canvas:parameter-dictionary:",
    stableId: "id:000000000000000000000000000000d1",
  }),
});

const captureActions = Object.freeze({
  ...createParityExtensionCaptureActions({
    activateSection,
    captureGeneratedPythonFocused,
    fixtureCallable,
    fixtureDictionary,
    fixtureSectionIds,
    generatedEditorSelector,
    nestedListDragContext,
    savedViewsPaneSelector,
    savedViewsTabSelector,
    sectionTabSelector,
    workspaceCanvasPaneSelector,
    zoomIn,
  }),
  "callable-selected-focused-zoomed": captureCallableSelectedFocusedZoomed,
  "generated-python-focused": captureGeneratedPythonFocused,
  "list-of-objects-selected": captureListOfObjectsSelected,
  "mixed-project": captureMixedProject,
  "parameter-dictionary-selected": captureParameterDictionarySelected,
  "terminal-attached-running": captureTerminalAttachedRunning,
  "terminal-attached-scrolled": captureTerminalAttachedScrolled,
  "terminal-hidden": captureTerminalHidden,
  "terminal-not-created": captureTerminalNotCreated,
});

const booleanArgumentSetters = new Map([
  [
    "--allow-baseline-create",
    (options) => {
      options.allowBaselineCreate = true;
    },
  ],
  [
    "--help",
    (options) => {
      options.help = true;
    },
  ],
  [
    "--validate",
    (options) => {
      options.validate = true;
    },
  ],
]);

const valueArgumentSetters = new Map([
  [
    "--mode",
    (options, value) => {
      options.mode = value;
    },
  ],
  [
    "--output",
    (options, value) => {
      options.outputDirectory = path.resolve(process.cwd(), value);
    },
  ],
  [
    "--reference-revision",
    (options, value) => {
      options.referenceRevision = value;
    },
  ],
  [
    "--scenario",
    (options, value) => {
      options.scenarioIds.push(value);
    },
  ],
]);

function parseArguments(argv) {
  const options = {
    allowBaselineCreate: false,
    mode: "candidate",
    outputDirectory: null,
    referenceRevision: null,
    scenarioIds: [],
    validate: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const booleanSetter = booleanArgumentSetters.get(argument);
    if (booleanSetter !== undefined) {
      booleanSetter(options);
      continue;
    }
    const valueSetter = valueArgumentSetters.get(argument);
    if (valueSetter !== undefined) {
      const { value, nextIndex } = requiredArgumentValue(argv, index, argument);
      valueSetter(options, value);
      index = nextIndex;
      continue;
    }
    throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

function requiredArgumentValue(argv, index, argument) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${argument} requires a value.`);
  }
  return { nextIndex: index + 1, value };
}

function usage() {
  return [
    "Usage: node apps/python-canvas/visual-parity/capture.mjs --output DIRECTORY [options]",
    "",
    "Options:",
    "  --scenario ID                 Capture one declared capturable scenario. May repeat.",
    "  --mode candidate|baseline     Candidate is the default and cannot write under the baseline root.",
    "  --allow-baseline-create        Required together with --mode baseline.",
    "  --reference-revision REVISION  Frozen product revision used as the parity reference.",
    "  --validate                     Validate the scenario catalog without starting services or writing files.",
    "  --help                         Print this help text.",
  ].join("\n");
}

function validateScenarioCatalog() {
  const scenarioIds = new Set();
  const coverage = new Set();
  for (const scenario of parityScenarioCatalog) {
    assert.equal(typeof scenario.id, "string", "A parity scenario has no id.");
    assert.match(
      scenario.id,
      /^[a-z0-9-]+$/u,
      "A parity scenario id is invalid.",
    );
    assert.equal(
      scenarioIds.has(scenario.id),
      false,
      `Parity scenario ${scenario.id} is duplicated.`,
    );
    scenarioIds.add(scenario.id);
    assert.ok(
      scenario.fixture in parityFixtureCatalog,
      `Parity scenario ${scenario.id} has no fixture.`,
    );
    for (const item of scenario.coverage) {
      coverage.add(item);
    }
    if (scenario.availability === "capturable") {
      assert.equal(
        typeof scenario.capture,
        "string",
        `Capturable scenario ${scenario.id} has no capture action.`,
      );
      assert.equal(
        captureActions[scenario.capture] !== undefined,
        true,
        `Capturable scenario ${scenario.id} has an unknown capture action.`,
      );
      assert.equal(
        parityViewports[scenario.viewport] !== undefined,
        true,
        `Capturable scenario ${scenario.id} has an unknown viewport.`,
      );
      assert.equal(
        ["dark", "light"].includes(scenario.theme),
        true,
        `Capturable scenario ${scenario.id} has an unknown theme.`,
      );
      continue;
    }
    assert.equal(
      scenario.availability,
      "requires-product-seam",
      `Parity scenario ${scenario.id} has an unknown availability.`,
    );
    assert.equal(
      typeof scenario.fixtureHook?.owner,
      "string",
      `Deferred scenario ${scenario.id} has no seam owner.`,
    );
    assert.equal(
      typeof scenario.fixtureHook?.requirement,
      "string",
      `Deferred scenario ${scenario.id} has no seam requirement.`,
    );
  }
  for (const item of requiredParityCoverage) {
    assert.equal(
      coverage.has(item),
      true,
      `The parity catalog does not cover ${item}.`,
    );
  }
  const declaredKinds = new Set([
    ...Object.values(parityFixtureCatalog).flatMap(
      (fixture) => fixture.sectionKinds ?? [],
    ),
    ...parityScenarioCatalog.flatMap((scenario) => scenario.sectionKinds ?? []),
  ]);
  for (const sectionKind of registeredPythonCanvasSectionKinds) {
    assert.equal(
      declaredKinds.has(sectionKind),
      true,
      `The parity fixtures do not declare registered section kind ${sectionKind}.`,
    );
  }
}

function selectScenarios(scenarioIds) {
  const capturable = parityScenarioCatalog.filter(
    (scenario) => scenario.availability === "capturable",
  );
  if (scenarioIds.length === 0) {
    return capturable;
  }
  const selected = [];
  for (const scenarioId of scenarioIds) {
    const scenario = parityScenarioCatalog.find(
      (candidate) => candidate.id === scenarioId,
    );
    if (scenario === undefined) {
      throw new Error(`Unknown parity scenario ${scenarioId}.`);
    }
    if (scenario.availability !== "capturable") {
      throw new Error(
        `Parity scenario ${scenarioId} requires the ${scenario.fixtureHook.owner} seam and cannot be captured yet.`,
      );
    }
    if (!selected.includes(scenario)) {
      selected.push(scenario);
    }
  }
  return selected;
}

function isWithin(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function validateOutputTarget(outputDirectory) {
  assert.notEqual(
    outputDirectory,
    null,
    "--output is required unless --validate is used.",
  );
  const filesystemRoot = path.parse(outputDirectory).root;
  if (
    outputDirectory === filesystemRoot ||
    outputDirectory === repositoryRoot
  ) {
    throw new Error("The output directory must be a new dedicated directory.");
  }
  if (existsSync(outputDirectory)) {
    throw new Error(
      `The output directory already exists and will not be overwritten: ${outputDirectory}`,
    );
  }
  const parentDirectory = path.dirname(outputDirectory);
  if (
    existsSync(parentDirectory) &&
    !lstatSync(parentDirectory).isDirectory()
  ) {
    throw new Error(`The output parent is not a directory: ${parentDirectory}`);
  }
}

function validateCaptureMode(options) {
  if (options.mode !== "candidate" && options.mode !== "baseline") {
    throw new Error("--mode must be candidate or baseline.");
  }
  if (options.mode === "baseline" && !options.allowBaselineCreate) {
    throw new Error(
      "Baseline capture requires --allow-baseline-create and a new output directory.",
    );
  }
  if (options.mode === "candidate" && options.allowBaselineCreate) {
    throw new Error(
      "--allow-baseline-create is valid only with --mode baseline.",
    );
  }
  assert.notEqual(
    options.referenceRevision,
    null,
    "--reference-revision is required for a capture.",
  );
  try {
    execFileSync(
      "git",
      ["cat-file", "-e", `${options.referenceRevision}^{commit}`],
      { cwd: repositoryRoot, stdio: "ignore" },
    );
  } catch {
    throw new Error(
      `The reference revision is not an available commit: ${options.referenceRevision}`,
    );
  }
}

function validateBaselineOutput(options) {
  if (
    options.mode === "candidate" &&
    isWithin(baselineRoot, options.outputDirectory)
  ) {
    throw new Error(
      "Candidate captures cannot write inside the immutable baseline root.",
    );
  }
}

function validateOutputDirectory(options) {
  validateOutputTarget(options.outputDirectory);
  validateCaptureMode(options);
  validateBaselineOutput(options);
}

function fixturePath(scenario) {
  const fixture = parityFixtureCatalog[scenario.fixture];
  assert.ok(fixture, `Fixture ${scenario.fixture} is unavailable.`);
  return path.join(repositoryRoot, fixture.source);
}

function sectionSelector(sectionId) {
  return `[data-section-id=${JSON.stringify(sectionId)}]`;
}

function fixtureSectionIds(snapshot) {
  const callable = fixtureCallable(snapshot);
  const dictionary = fixtureDictionary(snapshot);
  const list = fixtureList(snapshot);
  return {
    callable: `python-canvas:callable:${callable.id}`,
    dictionary: `python-canvas:parameter-dictionary:${dictionary.id}`,
    list: `python-canvas:list:${list.id}`,
  };
}

function fixtureCallable(snapshot) {
  const callable = snapshot.callables.find(
    (candidate) => candidate.name === "New callable",
  );
  assert.ok(callable, "The parity fixture has no New callable section.");
  return callable;
}

function fixtureDictionary(snapshot) {
  const dictionary = snapshot.parameterDictionaries.find(
    (candidate) => candidate.name === "New Param Dict",
  );
  assert.ok(dictionary, "The parity fixture has no New Param Dict section.");
  return dictionary;
}

function fixtureList(snapshot) {
  const list = snapshot.lists.find(
    (candidate) => candidate.name === "New List of Objects",
  );
  assert.ok(list, "The parity fixture has no New List of Objects section.");
  return list;
}

function nestedListDragContext(snapshot) {
  const list = snapshot.lists.find(
    (candidate) => candidate.childSectionIds.length >= 2,
  );
  assert.ok(
    list,
    "The parity fixture has no multi-child List of Objects section.",
  );
  const [targetId, sourceId] = list.childSectionIds;
  assert.equal(typeof sourceId, "string", "The nested drag source is missing.");
  assert.equal(typeof targetId, "string", "The nested drag target is missing.");
  return {
    listId: list.id,
    sourceId,
    targetId,
  };
}

async function configureViewportAndTheme(client, scenario) {
  const viewport = parityViewports[scenario.viewport];
  await Promise.all([
    client.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      mobile: false,
    }),
    client.send("Emulation.setEmulatedMedia", {
      features: [
        {
          name: "prefers-color-scheme",
          value: scenario.theme,
        },
      ],
    }),
  ]);
}

async function settleWorkspace(client, scenario) {
  const darkMode = scenario.theme === "dark";
  await waitFor(
    client,
    `${scenario.id} workspace presentation`,
    `(() => {
      const workspace = document.querySelector(".setta-workspace");
      return workspace instanceof HTMLElement &&
        workspace.classList.contains("setta-workspace-dark") === ${String(darkMode)} &&
        window.innerWidth === ${String(parityViewports[scenario.viewport].width)};
    })()`,
  );
  await evaluate(client, "document.fonts?.ready ?? Promise.resolve(true)");
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
  );
  await evaluate(
    client,
    `(() => {
      const workspace = document.querySelector(".setta-workspace");
      const animations = workspace instanceof HTMLElement
        ? workspace.getAnimations({ subtree: true }).filter((animation) => {
            const timing = animation.effect?.getTiming();
            return timing !== undefined &&
              Number.isFinite(Number(timing.duration)) &&
              Number.isFinite(timing.iterations);
          })
        : [];
      return Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished)),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
    })()`,
  );
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
  );
}

async function activateSection(client, sectionId, description) {
  const selector = sectionSelector(sectionId);
  await focusElement(client, selector, description);
  await pressEnter(client);
  await waitFor(
    client,
    `${description} active presentation`,
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute("data-section-active") === "true"`,
  );
}

async function zoomIn(client) {
  const before = await evaluate(
    client,
    `(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(viewport instanceof HTMLElement)) return null;
      const transform = getComputedStyle(viewport).transform;
      return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).m11;
    })()`,
  );
  assert.equal(
    typeof before,
    "number",
    "The workspace viewport is unavailable.",
  );
  await clickElementCenter(
    client,
    '[aria-label="zoom in"]',
    "the workspace zoom-in control",
  );
  await waitFor(
    client,
    "the workspace zoom-in state",
    `(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      if (!(viewport instanceof HTMLElement)) return false;
      const transform = getComputedStyle(viewport).transform;
      const zoom = transform === "none" ? 1 : new DOMMatrixReadOnly(transform).m11;
      return zoom > ${String(before)} + 0.01;
    })()`,
  );
}

async function captureMixedProject() {}

async function captureCallableSelectedFocusedZoomed(client, snapshot) {
  const sectionId = fixtureSectionIds(snapshot).callable;
  await activateSection(client, sectionId, "the callable parity section");
  await zoomIn(client);
  await activateSection(
    client,
    sectionId,
    "the focused callable parity section",
  );
}

async function captureGeneratedPythonFocused(client) {
  await activateSection(
    client,
    generatedSectionId,
    "the Generated Python parity section",
  );
  await activateCodeEditor(
    client,
    generatedEditorSelector,
    "the Generated Python parity editor",
  );
}

async function captureParameterDictionarySelected(client, snapshot) {
  await activateSection(
    client,
    fixtureSectionIds(snapshot).dictionary,
    "the Parameter Dictionary parity section",
  );
}

async function captureListOfObjectsSelected(client, snapshot) {
  await activateSection(
    client,
    fixtureSectionIds(snapshot).list,
    "the List of Objects parity section",
  );
}

async function waitForTerminal(client) {
  await waitFor(
    client,
    "the attached Generated Python terminal",
    `(() => {
      const pane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      const toggle = document.querySelector(${JSON.stringify(terminalToggleSelector)});
      return pane instanceof HTMLElement && rows instanceof HTMLElement &&
        (rows.textContent ?? "").trim() !== "" &&
        toggle?.getAttribute("aria-label") === "Hide terminal";
    })()`,
  );
}

async function startTerminalRun(client) {
  await clickElementCenter(
    client,
    generatedRunSelector,
    "the Generated Python parity run control",
  );
  await waitForTerminal(client);
}

async function executeTerminalCommand(client, command) {
  await focusElement(client, terminalTextAreaSelector, "the terminal input");
  await insertText(client, command);
  const key = {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    windowsVirtualKeyCode: 13,
  };
  await client.send("Input.dispatchKeyEvent", { ...key, type: "rawKeyDown" });
  await client.send("Input.dispatchKeyEvent", { ...key, type: "keyUp" });
}

async function waitForTerminalText(client, text, description) {
  await waitFor(
    client,
    description,
    `document.querySelector(${JSON.stringify(terminalRowsSelector)})?.textContent?.includes(${JSON.stringify(text)}) === true`,
  );
}

async function terminalPresentation(client) {
  return evaluate(
    client,
    `(() => {
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      const viewport = document.querySelector(${JSON.stringify(terminalViewportSelector)});
      return rows instanceof HTMLElement && viewport instanceof HTMLElement
        ? {
            rows: rows.textContent ?? "",
            scrollHeight: viewport.scrollHeight,
            scrollTop: viewport.scrollTop,
          }
        : null;
    })()`,
  );
}

async function waitForStableTerminalPresentation(client, description) {
  let previous = null;
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await terminalPresentation(client);
    assert.notEqual(current, null, `${description} is missing.`);
    const serialized = JSON.stringify(current);
    if (serialized === previous) {
      stableSamples += 1;
      if (stableSamples === 3) {
        return;
      }
    } else {
      previous = serialized;
      stableSamples = 0;
    }
    await delay(50);
  }
  throw new Error(`${description} did not settle.`);
}

async function captureTerminalNotCreated(client) {
  await waitFor(
    client,
    "the not-created Generated Python terminal state",
    `document.querySelector(${JSON.stringify(terminalPaneSelector)}) === null &&
      document.querySelector(${JSON.stringify(terminalToggleSelector)})?.getAttribute("aria-label") === "Create terminal"`,
  );
}

async function captureTerminalHidden(client) {
  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Create terminal control",
  );
  await waitForTerminal(client);
  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Hide terminal control",
  );
  await waitFor(
    client,
    "the hidden Generated Python terminal state",
    `document.querySelector(${JSON.stringify(terminalPaneSelector)}) === null &&
      document.querySelector(${JSON.stringify(terminalToggleSelector)})?.getAttribute("aria-label") === "Show terminal"`,
  );
}

async function captureTerminalAttachedRunning(client) {
  const marker = "SETTA_PARITY_TERMINAL_RUNNING";
  await startTerminalRun(client);
  await waitForStableTerminalPresentation(
    client,
    "the completed Generated Python terminal run",
  );
  await executeTerminalCommand(
    client,
    `printf '\\033[2J\\033[H${marker}\\n'; sleep 60`,
  );
  await waitForTerminalText(client, marker, "the running terminal marker");
  await waitForStableTerminalPresentation(
    client,
    "the running Generated Python terminal presentation",
  );
}

async function captureTerminalAttachedScrolled(client) {
  const marker = "SETTA_PARITY_TERMINAL_SCROLL";
  await startTerminalRun(client);
  await executeTerminalCommand(
    client,
    `python3 -c "for i in range(160): print('${marker}-%03d' % i)"`,
  );
  await waitForTerminalText(
    client,
    `${marker}-159`,
    "the terminal scrollback marker",
  );
  const point = await visibleElementPoint(
    client,
    terminalScreenSelector,
    "the terminal scrollback surface",
  );
  for (let index = 0; index < 12; index += 1) {
    await client.send("Input.dispatchMouseEvent", {
      deltaX: 0,
      deltaY: -120,
      type: "mouseWheel",
      x: point.x,
      y: point.y,
    });
  }
  await waitFor(
    client,
    "the terminal scrollback position",
    `(() => {
      const viewport = document.querySelector(${JSON.stringify(terminalViewportSelector)});
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      return viewport instanceof HTMLElement && rows instanceof HTMLElement &&
        (viewport.scrollTop > 0 || !(rows.textContent ?? "").includes(${JSON.stringify(`${marker}-159`)}));
    })()`,
  );
}

async function collectPublicState(client) {
  return evaluate(
    client,
    `(() => {
      const rectangle = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      };
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" &&
          Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const workspace = document.querySelector(".setta-workspace");
      const canvas = document.querySelector(${JSON.stringify(workspaceCanvasSelector)});
      const canvasViewport = document.querySelector(".react-flow__viewport");
      const shell = document.querySelector('[data-workspace-shell="true"]');
      const active = document.activeElement;
      const transform = canvasViewport instanceof HTMLElement
        ? getComputedStyle(canvasViewport).transform
        : null;
      const matrix = transform === null || transform === "none"
        ? null
        : new DOMMatrixReadOnly(transform);
      const sections = Array.from(document.querySelectorAll("[data-section-id]"), (section) => {
        const style = getComputedStyle(section);
        return {
          active: section.getAttribute("data-section-active"),
          ariaLabel: section.getAttribute("aria-label"),
          ariaSelected: section.getAttribute("aria-selected"),
          dragging: section.classList.contains("opacity-80") ||
            section.parentElement?.classList.contains("opacity-80") === true,
          id: section.getAttribute("data-section-id"),
          rect: rectangle(section),
          selected: section.getAttribute("data-selected"),
          visible: visible(section),
          zIndex: style.zIndex,
        };
      });
      const dragPreview = document.querySelector('[data-dnd-placeholder="true"]');
      const generatedEditor = document.querySelector(${JSON.stringify(generatedEditorSelector)});
      const generatedScroller = generatedEditor?.querySelector(".cm-scroller");
      const pendingSections = Array.from(document.querySelectorAll("[data-section-type]"))
        .filter((section) => section.getAttribute("data-section-type")?.endsWith("-pending") === true)
        .map((section) => ({
          rect: rectangle(section),
          type: section.getAttribute("data-section-type"),
          visible: visible(section),
        }));
      const savedViewsPane = document.querySelector(${JSON.stringify(savedViewsPaneSelector)});
      const savedViewRows = savedViewsPane instanceof HTMLElement
        ? Array.from(savedViewsPane.querySelectorAll("[data-workspace-saved-view-id]"), (row) => ({
            active: row.getAttribute("data-active"),
            id: row.getAttribute("data-workspace-saved-view-id"),
          }))
        : [];
      const terminalPane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      const terminalSurface = document.querySelector(${JSON.stringify(terminalSurfaceSelector)});
      const terminalRows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      const terminalViewport = document.querySelector(${JSON.stringify(terminalViewportSelector)});
      const terminalToggle = document.querySelector(${JSON.stringify(terminalToggleSelector)});
      const focusSection = active instanceof Element
        ? active.closest("[data-section-id]")?.getAttribute("data-section-id") ?? null
        : null;
      return {
        canvas: canvas instanceof HTMLElement ? {
          rect: rectangle(canvas),
          visible: visible(canvas),
        } : null,
        document: {
          activeElement: active instanceof HTMLElement ? {
            ariaLabel: active.getAttribute("aria-label"),
            dataSectionId: focusSection,
            role: active.getAttribute("role"),
            tagName: active.tagName,
          } : null,
          colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
          readyState: document.readyState,
        },
        dragPreview: dragPreview instanceof HTMLElement ? {
          rect: rectangle(dragPreview),
          visible: visible(dragPreview),
        } : null,
        generatedEditor: generatedEditor instanceof HTMLElement ? {
          protectedLineCount: generatedEditor.querySelectorAll("[data-workspace-generated-line]").length,
          rect: rectangle(generatedEditor),
          scroller: generatedScroller instanceof HTMLElement ? {
            clientHeight: generatedScroller.clientHeight,
            scrollHeight: generatedScroller.scrollHeight,
            scrollTop: generatedScroller.scrollTop,
          } : null,
          visible: visible(generatedEditor),
        } : null,
        pendingSections,
        savedViews: savedViewsPane instanceof HTMLElement ? {
          editing: savedViewsPane.getAttribute("data-workspace-saved-view-editing"),
          rect: rectangle(savedViewsPane),
          rows: savedViewRows,
          visible: visible(savedViewsPane),
        } : null,
        sections,
        shell: shell instanceof HTMLElement ? {
          rect: rectangle(shell),
          panes: Array.from(shell.querySelectorAll("[data-workspace-shell-pane-region]"), (pane) => ({
            edge: pane.getAttribute("data-workspace-shell-pane-region"),
            rect: rectangle(pane),
            visible: pane.querySelector("[data-pane]")?.getAttribute("data-visible") ?? null,
          })),
        } : null,
        terminal: {
          nowheel: terminalSurface instanceof HTMLElement
            ? terminalSurface.classList.contains("nowheel")
            : false,
          pane: terminalPane instanceof HTMLElement ? rectangle(terminalPane) : null,
          rows: terminalRows instanceof HTMLElement
            ? (terminalRows.textContent ?? "").slice(-4096)
            : null,
          toggleLabel: terminalToggle?.getAttribute("aria-label") ?? null,
          viewport: terminalViewport instanceof HTMLElement ? {
            clientHeight: terminalViewport.clientHeight,
            scrollHeight: terminalViewport.scrollHeight,
            scrollTop: terminalViewport.scrollTop,
          } : null,
        },
        viewport: {
          devicePixelRatio: window.devicePixelRatio,
          documentHeight: document.documentElement.scrollHeight,
          documentWidth: document.documentElement.scrollWidth,
          height: window.innerHeight,
          matrix: matrix === null ? null : {
            x: matrix.m41,
            y: matrix.m42,
            zoom: matrix.m11,
          },
          width: window.innerWidth,
        },
        workspace: workspace instanceof HTMLElement ? {
          className: workspace.className,
          rect: rectangle(workspace),
          visible: visible(workspace),
        } : null,
      };
    })()`,
  );
}

function replaceExactJsonStrings(value, replacements) {
  if (typeof value === "string") {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceExactJsonStrings(item, replacements));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      replacements.get(key) ?? key,
      replaceExactJsonStrings(item, replacements),
    ]),
  );
}

function normalizeCanonicalCapture(
  scenario,
  initialSnapshot,
  canonicalSnapshot,
  publicState,
) {
  const configuration = canonicalCaptureNormalizations[scenario.capture];
  if (configuration === undefined) {
    return { canonicalSnapshot, publicState };
  }
  const initialIds = new Set(
    initialSnapshot[configuration.collection].map((section) => section.id),
  );
  const created = canonicalSnapshot[configuration.collection].filter(
    (section) => !initialIds.has(section.id),
  );
  assert.equal(
    created.length,
    1,
    `${scenario.id} must create exactly one canonical section.`,
  );
  const runtimeId = created[0].id;
  const replacements = new Map([
    [runtimeId, configuration.stableId],
    [
      `${configuration.sectionPrefix}${runtimeId}`,
      `${configuration.sectionPrefix}${configuration.stableId}`,
    ],
  ]);
  return {
    canonicalSnapshot: replaceExactJsonStrings(canonicalSnapshot, replacements),
    publicState: replaceExactJsonStrings(publicState, replacements),
  };
}

async function captureScenario(scenario) {
  let captured = null;
  await runAgainstCopiedProductionProject(
    fixturePath(scenario),
    async ({ backendOrigin, client, previewOrigin }) => {
      await configureViewportAndTheme(client, scenario);
      await openWorkspaceCanvas(client, previewOrigin);
      await settleWorkspace(client, scenario);
      const snapshot = await fetchCanonicalSnapshot(backendOrigin);
      await captureActions[scenario.capture](client, snapshot, backendOrigin);
      await settleWorkspace(client, scenario);
      const [browser, canonicalSnapshot, publicState, screenshot] =
        await Promise.all([
          client.send("Browser.getVersion"),
          fetchCanonicalSnapshot(backendOrigin),
          collectPublicState(client),
          client.send("Page.captureScreenshot", {
            captureBeyondViewport: false,
            format: "png",
            fromSurface: true,
          }),
        ]);
      if (typeof screenshot.data !== "string") {
        throw new Error(`Chrome returned no screenshot for ${scenario.id}.`);
      }
      const normalized = normalizeCanonicalCapture(
        scenario,
        snapshot,
        canonicalSnapshot,
        publicState,
      );
      captured = {
        browser,
        canonicalSnapshot: normalized.canonicalSnapshot,
        publicState: normalized.publicState,
        scenario,
        screenshot: screenshot.data,
        viewport: parityViewports[scenario.viewport],
      };
    },
  );
  assert.ok(captured, `Parity scenario ${scenario.id} did not capture output.`);
  return captured;
}

function repositoryRevision() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function resolveRevision(revision) {
  return execFileSync("git", ["rev-parse", `${revision}^{commit}`], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function productSourceDifferences(referenceRevision) {
  return execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      referenceRevision,
      "--",
      "apps/playground/src",
      "apps/python-canvas/src",
      "packages/workspace/src",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

function artifactHashes() {
  const roots = [
    path.join(repositoryRoot, "apps", "python-canvas", "dist"),
    path.join(repositoryRoot, "packages", "workspace", "dist"),
  ];
  const files = [];
  const visit = (candidatePath) => {
    if (lstatSync(candidatePath).isDirectory()) {
      for (const entry of readdirSync(candidatePath).sort()) {
        visit(path.join(candidatePath, entry));
      }
      return;
    }
    files.push(candidatePath);
  };
  for (const root of roots) {
    visit(root);
  }
  return Object.fromEntries(
    files.map((filePath) => [
      path.relative(repositoryRoot, filePath),
      createHash("sha256").update(readFileSync(filePath)).digest("hex"),
    ]),
  );
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeArtifacts(stagingDirectory, options, captures) {
  const screenshotsDirectory = path.join(stagingDirectory, "screenshots");
  const metadataDirectory = path.join(stagingDirectory, "metadata");
  mkdirSync(screenshotsDirectory);
  mkdirSync(metadataDirectory);
  for (const capture of captures) {
    const metadata = {
      browser: capture.browser,
      canonicalSnapshot: capture.canonicalSnapshot,
      publicState: capture.publicState,
      scenario: capture.scenario,
      viewport: capture.viewport,
    };
    writeFileSync(
      path.join(screenshotsDirectory, `${capture.scenario.id}.png`),
      capture.screenshot,
      "base64",
    );
    writeFileSync(
      path.join(metadataDirectory, `${capture.scenario.id}.json`),
      serialize(metadata),
      "utf8",
    );
  }
  const deferred = parityScenarioCatalog.filter(
    (scenario) => scenario.availability !== "capturable",
  );
  writeFileSync(
    path.join(stagingDirectory, "manifest.json"),
    serialize({
      fixtures: parityFixtureCatalog,
      schemaVersion: parityManifestVersion,
      scenarios: parityScenarioCatalog,
    }),
    "utf8",
  );
  writeFileSync(
    path.join(stagingDirectory, "receipt.json"),
    serialize({
      baselineRoot,
      captureRevision: repositoryRevision(),
      capturedScenarioIds: captures.map((capture) => capture.scenario.id),
      deferredScenarios: deferred,
      mode: options.mode,
      productSourceDifferencesFromReference: productSourceDifferences(
        options.referenceRevision,
      ),
      referenceRevision: resolveRevision(options.referenceRevision),
      runtimeArtifactHashes: artifactHashes(),
      schemaVersion: parityManifestVersion,
    }),
    "utf8",
  );
}

function publishArtifacts(options, captures) {
  validateOutputDirectory(options);
  const parentDirectory = path.dirname(options.outputDirectory);
  mkdirSync(parentDirectory, { recursive: true });
  const stagingDirectory = mkdtempSync(
    path.join(
      parentDirectory,
      `.${path.basename(options.outputDirectory)}-staging-`,
    ),
  );
  try {
    writeArtifacts(stagingDirectory, options, captures);
    validateOutputDirectory(options);
    renameSync(stagingDirectory, options.outputDirectory);
  } catch (error) {
    rmSync(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  validateScenarioCatalog();
  if (options.validate) {
    if (options.outputDirectory !== null) {
      validateOutputDirectory(options);
    }
    process.stdout.write(
      serialize({
        capturableScenarioIds: parityScenarioCatalog
          .filter((scenario) => scenario.availability === "capturable")
          .map((scenario) => scenario.id),
        deferredScenarioIds: parityScenarioCatalog
          .filter((scenario) => scenario.availability !== "capturable")
          .map((scenario) => scenario.id),
        valid: true,
      }),
    );
    return;
  }
  validateOutputDirectory(options);
  const scenarios = selectScenarios(options.scenarioIds);
  const captures = [];
  for (const scenario of scenarios) {
    process.stdout.write(
      `Capturing Python Canvas parity scenario ${scenario.id}\n`,
    );
    captures.push(await captureScenario(scenario));
  }
  publishArtifacts(options, captures);
  process.stdout.write(
    serialize({
      outputDirectory: options.outputDirectory,
      scenarioIds: scenarios.map((scenario) => scenario.id),
      valid: true,
    }),
  );
}

await main();
