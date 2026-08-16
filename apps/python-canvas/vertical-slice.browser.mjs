import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../scripts/lib/cdp-client.mjs";
import {
  fetchCanonicalSnapshot,
  reserveLoopbackPort,
  run,
  startHeadlessChrome,
  startProcess,
  stopHeadlessChrome,
  stopProcess,
  waitForHeadlessChrome,
  waitForHttp,
} from "./browser-processes.mjs";
import {
  activateTextBox,
  clickElementCenter,
  dragSelectElement,
  evaluate,
  insertText,
  labeledSelector,
  navigate,
  pressEnter,
  pressEscape,
  pressTab,
  selectAll,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(appRoot, "backend");
// The Callable section is observed through public surfaces only: its accessible section group,
// the package's one documented toolbar hook, and this app's own content root.
const callableSectionSelector =
  '[role="group"][aria-label^="Square Root section"]';
const itemToolbarSelector = "[data-workspace-item-toolbar]";
const sectionFieldSelector = "[data-workspace-section-field]";
const generatedOutputSelector =
  '[data-workspace-section-editor="generated-output"]';
const callableContentSelector = ".python-canvas-callable-section";
// The activation swap may move the field's own box by less than a device pixel of rounding, but
// not by a layout step.
const fieldGeometryToleranceCssPx = 1;

// The Args filter's own controls, resolved from its accessible name and required to belong to
// the rendered toolbar. Nothing here reads package-private toolbar structure.
const filterControlsScript = `(() => {
  const toolbar = document.querySelector(${JSON.stringify(itemToolbarSelector)});
  const label = Array.from(document.querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.trim() === "Filter parameters",
  );
  const input = label instanceof HTMLLabelElement ? label.control : null;
  if (
    !(toolbar instanceof HTMLElement) ||
    !(input instanceof HTMLInputElement) ||
    !toolbar.contains(input)
  ) {
    return null;
  }
  return {
    input,
    status: document.getElementById(input.getAttribute("aria-describedby") ?? ""),
    toolbar,
  };
})()`;

function withFilterControls(body) {
  return `(() => {
    const controls = ${filterControlsScript};
    if (controls === null) {
      return null;
    }
    ${body}
  })()`;
}

function toolbarButtonNamesScript(toolbarExpression) {
  return `Array.from(${toolbarExpression}.querySelectorAll("button"), (button) =>
    button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
  )`;
}

// The corrected composition: the callable editor leads the section, the Args toolbar follows it in
// the filter-only mode, the parameter list follows the toolbar, and an ordinary idle section says
// nothing about the provider.
async function assertCallableFirstComposition(client, callableLabel) {
  const composition = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
      const editor = section?.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const toolbar = section?.querySelector(${JSON.stringify(itemToolbarSelector)});
      const list = section?.querySelector(${JSON.stringify(callableContentSelector)});
      if (
        !(editor instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) ||
        !(list instanceof HTMLElement)
      ) {
        return null;
      }
      const precedes = (first, second) =>
        (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return {
        alertCount: section.querySelectorAll('[role="alert"]').length,
        editorPrecedesToolbar: precedes(editor, toolbar),
        mentionsProvider: section.textContent?.includes("Basedpyright") === true,
        toolbarButtonNames: ${toolbarButtonNamesScript("toolbar")},
        toolbarMode: toolbar.getAttribute("data-workspace-item-toolbar"),
        toolbarPrecedesList: precedes(toolbar, list),
        toolbarText: toolbar.textContent?.trim() ?? "",
      };
    })()`,
  );
  if (composition === null) {
    throw new Error(
      "The Square Root section did not render its callable editor, Args toolbar, and parameter list.",
    );
  }
  if (!composition.editorPrecedesToolbar || !composition.toolbarPrecedesList) {
    throw new Error(
      "The Square Root section must render the callable editor, then the Args toolbar, then the parameter list.",
    );
  }
  if (composition.toolbarMode !== "filter-only") {
    throw new Error(
      `The Args toolbar rendered in ${JSON.stringify(composition.toolbarMode)} instead of filter-only.`,
    );
  }
  if (!composition.toolbarText.includes("Args")) {
    throw new Error("The filter-only toolbar no longer labels the Args area.");
  }
  assertNoStructuralParameterControls(composition.toolbarButtonNames);
  if (composition.mentionsProvider || composition.alertCount > 0) {
    throw new Error(
      "The idle Square Root section still renders provider-status prose.",
    );
  }
}

function assertNoStructuralParameterControls(names) {
  const structuralNames = new Set([
    "Add parameter",
    "Remove last parameter",
    "Delete selected parameters",
  ]);
  const unexpected = names.filter((name) => structuralNames.has(name));
  if (unexpected.length > 0) {
    throw new Error(
      `The filter-only Args toolbar exposed unavailable controls: ${unexpected.join(", ")}.`,
    );
  }
}

function idleCallableSelector(callableLabel) {
  return `${textBoxSelector(callableLabel)}:not([contenteditable="true"])`;
}

function liveCallableSelector(callableLabel) {
  return `${textBoxSelector(callableLabel)}[contenteditable="true"]`;
}

async function waitForEnabledCallableField(client, callableLabel) {
  await waitFor(
    client,
    "enabled callable editor after initial provider work",
    `(() => {
      const control = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      return control instanceof HTMLElement && control.getAttribute("aria-disabled") !== "true";
    })()`,
  );
}

// The field's own box and the text layer inside it, read through the package's documented
// section-field hook and this control's accessible name. Nothing here selects a package class.
function callableFieldStateScript(textSelector) {
  return `(() => {
    const field = document.querySelector(${JSON.stringify(sectionFieldSelector)});
    const text = document.querySelector(${JSON.stringify(textSelector)});
    if (!(field instanceof HTMLElement) || !(text instanceof HTMLElement)) {
      return null;
    }
    const rect = field.getBoundingClientRect();
    const fieldStyle = window.getComputedStyle(field);
    const textStyle = window.getComputedStyle(text);
    return {
      box: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
      surface: {
        backgroundColor: fieldStyle.backgroundColor,
        borderRadius: fieldStyle.borderTopLeftRadius,
        borderWidth: fieldStyle.borderTopWidth,
        marginInline: fieldStyle.marginLeft + " " + fieldStyle.marginRight,
        padding: fieldStyle.paddingTop + " " + fieldStyle.paddingRight + " " +
          fieldStyle.paddingBottom + " " + fieldStyle.paddingLeft,
      },
      borderColor: fieldStyle.borderTopColor,
      type: {
        color: textStyle.color,
        fontFamily: textStyle.fontFamily,
        fontSize: textStyle.fontSize,
        fontWeight: textStyle.fontWeight,
        lineHeight: textStyle.lineHeight,
      },
    };
  })()`;
}

// An empty field shows its own muted placeholder layer against CodeMirror's placeholder, so text
// colour is compared only in the committed-value pass, where both layers render the same value.
const fieldTypeProperties = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
];
const fieldValueTypeProperties = [...fieldTypeProperties, "color"];

// The developer rejected the previous candidate because clicking the callable field changed its
// dimensions and its type. Measure the donor pill idle, click it, and require that the same
// surface comes back with only its border colour changed.
async function assertCallableFieldActivationParity(
  client,
  callableLabel,
  typeProperties,
) {
  await waitForEnabledCallableField(client, callableLabel);
  const idle = await evaluate(
    client,
    callableFieldStateScript(idleCallableSelector(callableLabel)),
  );
  if (idle === null) {
    throw new Error("The idle callable field did not render its surface.");
  }
  assertDonorCallableFieldSurface(idle);

  await clickElementCenter(
    client,
    idleCallableSelector(callableLabel),
    "The idle callable field",
  );
  await waitFor(
    client,
    "the clicked callable field mounting and focusing its live editor",
    `(() => {
      const live = document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))});
      return live instanceof HTMLElement && document.activeElement === live;
    })()`,
  );
  const live = await evaluate(
    client,
    callableFieldStateScript(liveCallableSelector(callableLabel)),
  );
  if (live === null) {
    throw new Error("The live callable field did not render its surface.");
  }
  assertCallableFieldParity(idle, live, typeProperties);

  await pressEscape(client);
  await waitFor(
    client,
    "the callable field returning to its idle layer",
    `document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))}) === null`,
  );
}

function assertDonorCallableFieldSurface(state) {
  const donorSurface = {
    backgroundColor: "rgb(255, 255, 255)",
    borderRadius: "16px",
    borderWidth: "1px",
    marginInline: "2px 2px",
    padding: "4px 10px 4px 10px",
  };
  for (const [property, expected] of Object.entries(donorSurface)) {
    if (state.surface[property] !== expected) {
      throw new Error(
        `The idle callable field rendered ${property} ${JSON.stringify(state.surface[property])} instead of the donor's ${JSON.stringify(expected)}.`,
      );
    }
  }
}

function assertCallableFieldParity(idle, live, typeProperties) {
  for (const [property, idleValue] of Object.entries(idle.box)) {
    const drift = Math.abs(idleValue - live.box[property]);
    if (drift > fieldGeometryToleranceCssPx) {
      throw new Error(
        `Activating the callable field moved its ${property} by ${String(drift)} CSS px.`,
      );
    }
  }
  for (const property of typeProperties) {
    if (live.type[property] !== idle.type[property]) {
      throw new Error(
        `Activating the callable field changed ${property} from ${JSON.stringify(idle.type[property])} to ${JSON.stringify(live.type[property])}.`,
      );
    }
  }
  for (const [property, idleValue] of Object.entries(idle.surface)) {
    if (live.surface[property] !== idleValue) {
      throw new Error(
        `Activating the callable field changed ${property} from ${JSON.stringify(idleValue)} to ${JSON.stringify(live.surface[property])}.`,
      );
    }
  }
  if (live.borderColor !== "rgb(59, 130, 246)") {
    throw new Error(
      `The focused callable field rendered the border colour ${JSON.stringify(live.borderColor)} instead of the donor's focus blue.`,
    );
  }
  if (idle.borderColor === live.borderColor) {
    throw new Error(
      "The callable field's border colour did not change when it took focus.",
    );
  }
}

// The generated surface, its badge, and the text layer inside it, read through the package's
// documented section-editor hook and this section's accessible name. Nothing here selects a
// package class.
const generatedOutputStateScript = `(() => {
  const surface = document.querySelector(${JSON.stringify(generatedOutputSelector)});
  const text = surface?.querySelector('[role="textbox"]');
  if (!(surface instanceof HTMLElement) || !(text instanceof HTMLElement)) {
    return null;
  }
  const surfaceStyle = window.getComputedStyle(surface);
  const badgeStyle = window.getComputedStyle(surface, "::after");
  const textStyle = window.getComputedStyle(text);
  return {
    region: {
      backgroundImage: surfaceStyle.backgroundImage,
      borderRadius: surfaceStyle.borderTopLeftRadius,
    },
    badge: {
      backgroundColor: badgeStyle.backgroundColor,
      content: badgeStyle.content,
      textTransform: badgeStyle.textTransform,
    },
    text: {
      contentEditable: text.getAttribute("contenteditable"),
      isActiveElement: document.activeElement === text,
      outlineStyle: textStyle.outlineStyle,
      outlineWidth: textStyle.outlineWidth,
      readOnly: text.getAttribute("aria-readonly"),
      source: text.textContent,
    },
    // CodeMirror's own caret and active-line layers. A non-editing surface must mount neither,
    // and their absence is the only DOM evidence that no caret is drawn.
    hasCaretLayer: surface.querySelector(".cm-cursor") !== null,
    hasActiveLine: surface.querySelector(".cm-activeLine") !== null,
  };
})()`;

// The developer rejected the previous candidate because Generated Python was painted as an
// ordinary editor whose still-editable content exposed a black caret line on click. Measure the
// generated region idle, click it with a real pointer, and require the same non-editing surface.
async function assertGeneratedOutputPresentation(client, generatedLabel) {
  const idle = await evaluate(client, generatedOutputStateScript);
  if (idle === null) {
    throw new Error(
      `${generatedLabel} did not render the package's generated-output surface.`,
    );
  }
  assertDonorGeneratedRegion(idle);
  assertNonEditingGeneratedText("The idle", idle);

  await clickElementCenter(
    client,
    generatedOutputSelector,
    "The generated Python region",
  );
  const clicked = await evaluate(client, generatedOutputStateScript);
  if (clicked === null) {
    throw new Error("The clicked generated Python region lost its surface.");
  }
  assertNonEditingGeneratedText("The clicked", clicked);
  for (const [property, idleValue] of Object.entries(idle.region)) {
    if (clicked.region[property] !== idleValue) {
      throw new Error(
        `Clicking generated Python changed ${property} from ${JSON.stringify(idleValue)} to ${JSON.stringify(clicked.region[property])}.`,
      );
    }
  }

  await dragSelectElement(
    client,
    `${generatedOutputSelector} [role="textbox"]`,
    "The generated Python text",
  );
  const selected = await evaluate(
    client,
    `window.getSelection()?.toString() ?? ""`,
  );
  if (!selected.includes("class SettaState:")) {
    throw new Error(
      "Generated Python text could not be selected by a real pointer drag.",
    );
  }
  return idle.text.source;
}

function assertDonorGeneratedRegion(state) {
  // Chromium expands the rail's double-position stop into its two computed stops.
  const donorRegion = {
    backgroundImage:
      "linear-gradient(90deg, rgb(96, 165, 250) 0px, rgb(96, 165, 250) 3px, rgb(219, 234, 254) 3px)",
    borderRadius: "6px",
  };
  for (const [property, expected] of Object.entries(donorRegion)) {
    if (state.region[property] !== expected) {
      throw new Error(
        `Generated Python rendered ${property} ${JSON.stringify(state.region[property])} instead of the donor's ${JSON.stringify(expected)}.`,
      );
    }
  }
  const donorBadge = {
    backgroundColor: "rgb(37, 99, 235)",
    content: '"Generated read-only"',
    textTransform: "uppercase",
  };
  for (const [property, expected] of Object.entries(donorBadge)) {
    if (state.badge[property] !== expected) {
      throw new Error(
        `The generated Python badge rendered ${property} ${JSON.stringify(state.badge[property])} instead of the donor's ${JSON.stringify(expected)}.`,
      );
    }
  }
}

function assertNonEditingGeneratedText(stage, state) {
  if (state.text.contentEditable !== "false") {
    throw new Error(
      `${stage} generated Python text is still an editing surface.`,
    );
  }
  if (state.text.readOnly !== "true") {
    throw new Error(`${stage} generated Python text is not named read-only.`);
  }
  if (state.text.isActiveElement) {
    throw new Error(`${stage} generated Python text took the keyboard focus.`);
  }
  if (state.hasCaretLayer || state.hasActiveLine) {
    throw new Error(
      `${stage} generated Python painted a caret or an active line.`,
    );
  }
  if (state.text.outlineStyle !== "none" && state.text.outlineWidth !== "0px") {
    throw new Error(
      `${stage} generated Python text drew the inner outline ${JSON.stringify(state.text.outlineStyle)}.`,
    );
  }
}

// Rendered order alone would not prove the section reads correctly by keyboard. Start from the last
// ordinary focus target before the callable field, enter the field with a real Tab key, and prove
// its keyboard activation mounts the live editor before the next Tab reaches the Args filter.
async function assertCallableEditorLeadsKeyboardOrder(client, callableLabel) {
  await waitForEnabledCallableField(client, callableLabel);
  const precedingControlFocused = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
      const control = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      if (!(section instanceof HTMLElement) || !(control instanceof HTMLElement)) {
        return false;
      }
      const focusable = Array.from(section.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((candidate) =>
        candidate instanceof HTMLElement &&
        candidate !== control &&
        candidate.getClientRects().length > 0 &&
        (candidate.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      );
      const preceding = focusable.at(-1);
      if (!(preceding instanceof HTMLElement)) {
        return false;
      }
      preceding.focus({ preventScroll: true });
      return document.activeElement === preceding;
    })()`,
  );
  if (!precedingControlFocused) {
    throw new Error(
      "No focusable section control preceded the callable editor.",
    );
  }
  await pressTab(client);
  await waitFor(
    client,
    "live callable editor activation through keyboard traversal",
    `Array.from(document.querySelectorAll(${JSON.stringify(labeledSelector(callableLabel))})).some((control) =>
      control instanceof HTMLElement &&
      control.getAttribute("contenteditable") === "true" &&
      document.activeElement === control
    )`,
  );
  await pressTab(client);
  const focused = await waitFor(
    client,
    "keyboard focus moving from the callable editor into the Args toolbar",
    `(() => {
      const active = document.activeElement;
      if (
        !(active instanceof HTMLElement) ||
        active.closest(${JSON.stringify(itemToolbarSelector)}) === null
      ) {
        return null;
      }
      return {
        name:
          active.labels?.[0]?.textContent?.trim() ??
          active.getAttribute("aria-label") ??
          "",
      };
    })()`,
  );
  if (focused.name !== "Filter parameters") {
    throw new Error(
      `Tab from the callable editor reached ${JSON.stringify(focused.name)} instead of the Args filter.`,
    );
  }
}

// The retained filter still has to work, and it filters on the text the app projects for its own
// opaque rows rather than on package-owned labels.
async function assertArgsFilterRemainsOperable(client, parameterLabel) {
  const focused = await evaluate(
    client,
    withFilterControls(`
      controls.input.focus({ preventScroll: true });
      return document.activeElement === controls.input;
    `),
  );
  if (focused !== true) {
    throw new Error(
      "The filter-only Args toolbar did not expose a focusable parameter filter.",
    );
  }
  await insertText(client, "zzz");
  await waitFor(
    client,
    "the Args filter hiding a non-matching parameter",
    withFilterControls(`
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return !(parameter instanceof HTMLElement) &&
        controls.status?.textContent?.trim() === "0 matching parameters.";
    `),
  );
  const names = await evaluate(
    client,
    withFilterControls(
      `return ${toolbarButtonNamesScript("controls.toolbar")};`,
    ),
  );
  if (names === null) {
    throw new Error("The Args toolbar disappeared while filtering.");
  }
  assertNoStructuralParameterControls(names);
  const cleared = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[aria-label="Clear parameter filter"]');
      if (!(button instanceof HTMLElement)) {
        return false;
      }
      button.click();
      return true;
    })()`,
  );
  if (!cleared) {
    throw new Error("The active Args filter exposed no clear control.");
  }
  await waitFor(
    client,
    "the cleared Args filter restoring the parameter row",
    withFilterControls(`
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return parameter instanceof HTMLElement && controls.input.value === "";
    `),
  );
}

async function runWalkthrough(client, backendOrigin) {
  const callableLabel = "Callable expression";
  const parameterLabel = "x expression";
  const generatedLabel = "Generated Python generated code, read-only";

  await waitFor(
    client,
    "Python Canvas accessible controls",
    `(() => {
      const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const canvas = document.querySelector('[role="region"][aria-label="Workspace canvas"]');
      return callable instanceof HTMLElement && generated instanceof HTMLElement && canvas instanceof HTMLElement;
    })()`,
  );

  await assertCallableFirstComposition(client, callableLabel);
  await assertCallableFieldActivationParity(
    client,
    callableLabel,
    fieldTypeProperties,
  );
  await assertCallableEditorLeadsKeyboardOrder(client, callableLabel);

  const generatedSource = await assertGeneratedOutputPresentation(
    client,
    generatedLabel,
  );
  // Nothing typed after that pointer press can reach a surface that is not an editor.
  await insertText(client, "attempted_mutation");
  await delay(100);
  const generatedSourceDidNotChange = await evaluate(
    client,
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const editor = generated?.querySelector('[role="textbox"]');
      return editor?.textContent === ${JSON.stringify(generatedSource)};
    })()`,
  );
  if (!generatedSourceDidNotChange) {
    throw new Error("Generated Python output accepted an authored mutation.");
  }

  const beforeCompletion = await fetchCanonicalSnapshot(backendOrigin);
  await activateTextBox(client, callableLabel);
  await insertText(client, "math.sq");
  await waitFor(
    client,
    "accessible sqrt completion",
    `Array.from(document.querySelectorAll('[role="option"]')).some((option) => option.textContent?.trim() === "sqrt")`,
  );
  await pressEnter(client);

  await waitFor(
    client,
    "first completion Enter changing only the callable draft",
    `(() => {
      const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const generatedEditor = generated?.querySelector('[role="textbox"]');
      return callable?.textContent === "math.sqrt" &&
        parameter === null &&
        generatedEditor?.textContent === ${JSON.stringify(generatedSource)};
    })()`,
  );
  const afterCompletion = await fetchCanonicalSnapshot(backendOrigin);
  assertCompletionDidNotMutateCanonicalProject(
    beforeCompletion,
    afterCompletion,
  );

  await pressEnter(client);

  await waitFor(
    client,
    "math.sqrt callable projection",
    `(() => {
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return parameter instanceof HTMLElement && generated?.textContent?.includes("state.Square_Root = math.sqrt()") === true;
    })()`,
  );

  await activateTextBox(client, parameterLabel);
  await insertText(client, "missing_value");
  await waitFor(
    client,
    "mapped undefined-name diagnostic",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const diagnostic = Array.from(document.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes("Parameter diagnostics available."),
      );
      return generated?.textContent?.includes("state.Square_Root__x = missing_value") === true && diagnostic;
    })()`,
  );

  await waitFor(
    client,
    "enabled parameter textbox after mapped undefined-name diagnostic",
    `(() => {
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return parameter instanceof HTMLElement &&
        parameter.getAttribute("aria-disabled") !== "true" &&
        parameter.getAttribute("aria-readonly") !== "true";
    })()`,
  );

  await activateTextBox(client, parameterLabel);
  await selectAll(client);
  await insertText(client, "3");
  await waitFor(
    client,
    "cleared parameter diagnostic",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const cleared = Array.from(document.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes("Parameter diagnostics cleared."),
      );
      return generated?.textContent?.includes("state.Square_Root__x = 3") === true &&
        generated?.textContent?.includes("missing_value") === false && cleared;
    })()`,
  );

  await assertArgsFilterRemainsOperable(client, parameterLabel);
  // The committed callable is the state the section spends its life in, so repeat the parity pass
  // over the real value, where both layers render the same highlighted text.
  await assertCallableFieldActivationParity(
    client,
    callableLabel,
    fieldValueTypeProperties,
  );
}

function assertCompletionDidNotMutateCanonicalProject(before, after) {
  assertCanonicalValue(
    before.project?.revision,
    after.project?.revision,
    "Selecting a completion changed the canonical project revision.",
  );
  assertCanonicalValue(
    before.callables,
    after.callables,
    "Selecting a completion committed or otherwise changed canonical callable records.",
  );
  assertCanonicalValue(
    before.parameters,
    after.parameters,
    "Selecting a completion created or changed a canonical parameter.",
  );
  assertCanonicalValue(
    before.generatedCode,
    after.generatedCode,
    "Selecting a completion changed the canonical generated code.",
  );
  assertCanonicalValue(
    before.diagnostics,
    after.diagnostics,
    "Selecting a completion changed canonical diagnostics.",
  );
}

function assertCanonicalValue(before, after, message) {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(message);
  }
}

async function main() {
  run("pnpm", ["--filter", "@setta/workspace", "run", "build"]);
  run("pnpm", ["run", "build"], { cwd: appRoot });

  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-browser-"),
  );
  let backend = null;
  let preview = null;
  let browser = null;
  let client = null;
  try {
    const backendPort = await reserveLoopbackPort();
    const previewPort = await reserveLoopbackPort();
    const backendOrigin = `http://127.0.0.1:${String(backendPort)}`;
    const previewOrigin = `http://127.0.0.1:${String(previewPort)}`;
    const backendBinary = path.join(temporaryDirectory, "python-canvas");
    run("go", ["build", "-o", backendBinary, "./cmd/python-canvas"], {
      cwd: backendRoot,
    });

    backend = startProcess(backendBinary, ["-port", String(backendPort)], {
      cwd: appRoot,
      label: "Python Canvas backend",
    });
    await waitForHttp(
      backend,
      `${backendOrigin}/api/v1/project`,
      "Python Canvas backend",
    );

    preview = startProcess(
      process.execPath,
      [
        path.join(appRoot, "node_modules/vite/bin/vite.js"),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(previewPort),
        "--strictPort",
      ],
      {
        cwd: appRoot,
        env: { PYTHON_CANVAS_BACKEND_ORIGIN: backendOrigin },
        label: "Python Canvas production preview",
      },
    );
    await waitForHttp(
      preview,
      previewOrigin,
      "Python Canvas production preview",
    );

    browser = startHeadlessChrome();
    const cdpPort = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(cdpPort);
    client = page.client;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 900,
        mobile: false,
        width: 1_440,
      }),
    ]);
    await navigate(client, previewOrigin);
    await runWalkthrough(client, backendOrigin);
    console.log("Python Canvas browser vertical slice passed.");
  } finally {
    client?.close();
    try {
      if (browser !== null) {
        await stopHeadlessChrome(browser);
      }
    } finally {
      try {
        await stopProcess(preview);
      } finally {
        try {
          await stopProcess(backend);
        } finally {
          rmSync(temporaryDirectory, { force: true, recursive: true });
        }
      }
    }
  }
}

await main();
