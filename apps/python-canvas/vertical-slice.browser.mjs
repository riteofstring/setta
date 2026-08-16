import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  runAgainstProductionApp,
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
  setEmulatedAppearance,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";
import {
  assertCallableFieldParity,
  assertDonorCallableFieldSurface,
  assertDonorGeneratedRegion,
  assertNonEditingGeneratedText,
  callableFieldStateScript,
  enterCallableField,
  fieldTypeProperties,
  fieldValueTypeProperties,
  generatedOutputSelector,
  generatedOutputStateScript,
  idleCallableSelector,
  liveCallableSelector,
  selectSqrtCompletion,
  waitForEnabledCallableField,
} from "./callable-presentation.mjs";

// The Callable section is observed through public surfaces only: its accessible section group,
// the package's one documented toolbar hook, and this app's own content root.
const callableSectionSelector =
  '[role="group"][aria-label^="Square Root section"]';
const itemToolbarSelector = "[data-workspace-item-toolbar]";
const callableContentSelector = ".python-canvas-callable-section";
// The application follows the reader's system appearance, so this walkthrough pins the one it
// asserts donor values for. The capture harness records both.
const walkthroughAppearance = "light";

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
  assertDonorCallableFieldSurface(idle, walkthroughAppearance);

  await enterCallableField(client, callableLabel);
  const live = await evaluate(
    client,
    callableFieldStateScript(liveCallableSelector(callableLabel)),
  );
  if (live === null) {
    throw new Error("The live callable field did not render its surface.");
  }
  assertCallableFieldParity(idle, live, typeProperties, walkthroughAppearance);

  await pressEscape(client);
  await waitFor(
    client,
    "the callable field returning to its idle layer",
    `document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))}) === null`,
  );
}

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
  assertDonorGeneratedRegion(idle, walkthroughAppearance);
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
  await selectSqrtCompletion(client, callableLabel);

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
  await runAgainstProductionApp(
    async ({ backendOrigin, client, previewOrigin }) => {
      await setEmulatedAppearance(client, walkthroughAppearance);
      await navigate(client, previewOrigin);
      await runWalkthrough(client, backendOrigin);
    },
  );
  console.log("Python Canvas browser vertical slice passed.");
}

await main();
