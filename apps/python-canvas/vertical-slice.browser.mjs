import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  productionTimeoutMs,
  runAgainstProductionApp,
} from "./browser-processes.mjs";
import {
  activateCodeEditor,
  activateContentEditableTextBox,
  clickElementCenter,
  clickPoint,
  dragBetweenPoints,
  dragElementToElement,
  evaluate,
  focusElement,
  holdItemSelectionChord,
  insertText,
  itemSelectionModifiers,
  labeledSelector,
  moveCaretToDocumentEnd,
  moveCaretToDocumentStart,
  navigate,
  nextAnimationFrame,
  pressCompletion,
  pressEnd,
  pressEnter,
  pressEscape,
  pressItemActionMenuKey,
  prepareElementDrag,
  releaseItemSelectionChord,
  replaceNativeInputAndSubmit,
  selectAll,
  contentEditableTextBoxSelector,
  waitFor,
} from "./browser-page.mjs";

const generatedPythonEditorSelector = labeledSelector(
  "Generated Python code editor, generated output read-only",
);
const sampleCallableName = "Sample callable";
const zeroCallableName = "Zero callable";

// The browser suite is a separately authorized standard check. Its only path
// is the V2 product: a fresh project is created through the launcher, every
// mutation is made through the public UI, and canonical state is observed with
// GET /api/v2/project before a restart opens the same file without --create.
await runAgainstProductionApp(
  async ({ backendOrigin, client, previewOrigin, restart }) => {
    const initial = await fetchCanonicalSnapshot(backendOrigin);
    assert.equal(initial.version, "v2");
    assert.deepEqual(initial.callables, []);

    await navigate(client, previewOrigin);
    await waitFor(
      client,
      "the labelled project control and empty-state action",
      `(() => {
        const projectName = document.querySelector("label[for='python-canvas-project-name']");
        const addCallable = document.querySelector(".python-canvas-empty-state button");
        return projectName?.textContent === "Project name" &&
          addCallable?.textContent === "Add callable";
      })()`,
    );

    await replaceNativeInputAndSubmit(
      client,
      "input[name='project-name']",
      "Browser walkthrough project",
      "the Project name control",
    );
    await waitForSnapshot(
      backendOrigin,
      "the renamed project",
      (snapshot) => snapshot.project.name === "Browser walkthrough project",
    );

    await editPythonTargetOuterRegions(client, backendOrigin);

    await createCallable(client, backendOrigin, sampleCallableName);
    await commitCallableExpression(
      client,
      backendOrigin,
      sampleCallableName,
      "fixture_module.sample",
    );
    const sampleWithProviderParameters = await waitForSnapshot(
      backendOrigin,
      "the sample fixture signature",
      (snapshot) => {
        const callable = findCallable(snapshot, sampleCallableName);
        return (
          callable !== null &&
          callable.parameters.length === 5 &&
          callable.parameters.every(
            (parameter) =>
              parameter.nameEditable === false &&
              Number.isInteger(parameter.providerOrdinal),
          )
        );
      },
    );

    await createCallable(client, backendOrigin, zeroCallableName);
    await commitCallableExpression(
      client,
      backendOrigin,
      zeroCallableName,
      "fixture_module.zero",
    );
    await waitForSnapshot(
      backendOrigin,
      "the zero-parameter callable",
      (snapshot) => {
        const callable = findCallable(snapshot, zeroCallableName);
        return callable !== null && callable.parameters.length === 0;
      },
    );

    await waitFor(
      client,
      "both dynamic callable sections",
      `document.querySelector(${JSON.stringify(callableSectionSelector(sampleCallableName))}) !== null &&
        document.querySelector(${JSON.stringify(callableSectionSelector(zeroCallableName))}) !== null`,
    );
    const initialProviderMetadata = await exerciseParameterAuthoring(
      client,
      backendOrigin,
      findRequiredCallable(sampleWithProviderParameters, sampleCallableName),
    );
    await observeGeneratedDocumentBoundaries(client, backendOrigin);
    await observeTargetDiagnostics(client, backendOrigin);

    await clickElementCenter(
      client,
      labeledSelector(`Delete callable ${zeroCallableName}`),
      "the dynamic zero-callable delete control",
    );
    const beforeRestart = await waitForSnapshot(
      backendOrigin,
      "the remaining callable after deletion",
      (snapshot) =>
        snapshot.callables.length === 1 &&
        snapshot.callables[0]?.name === sampleCallableName,
    );
    assertCanonicalParameterMetadata(
      findRequiredCallable(beforeRestart, sampleCallableName),
    );
    assertRetainedProviderMetadata(
      findRequiredCallable(beforeRestart, sampleCallableName),
      initialProviderMetadata,
    );

    await restart();
    const restored = await fetchCanonicalSnapshot(backendOrigin);
    assert.equal(restored.version, "v2");
    assert.equal(restored.project.name, "Browser walkthrough project");
    assert.deepEqual(restored.callables, beforeRestart.callables);
    assert.deepEqual(restored.pythonTarget, beforeRestart.pythonTarget);
    assert.equal(restored.generatedCode.code, beforeRestart.generatedCode.code);
    assertCanonicalParameterMetadata(
      findRequiredCallable(restored, sampleCallableName),
    );
    assertRetainedProviderMetadata(
      findRequiredCallable(restored, sampleCallableName),
      initialProviderMetadata,
    );

    await navigate(client, previewOrigin);
    await waitFor(
      client,
      "the restored project and callable controls",
      `(() => {
        const projectName = document.querySelector("input[name='project-name']");
        const callable = document.querySelector(${JSON.stringify(callableSectionSelector(sampleCallableName))});
        return projectName instanceof HTMLInputElement &&
          projectName.value === "Browser walkthrough project" && callable !== null;
      })()`,
    );

    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 720,
      mobile: false,
      width: 320,
    });
    await waitFor(
      client,
      "the narrow page reflow without horizontal scrolling",
      `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
    );
  },
);

async function editPythonTargetOuterRegions(client, backendOrigin) {
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentStart(client);
  await insertText(client, "import fixture_module\n");
  await waitForSnapshot(
    backendOrigin,
    "the authored Generated Python prefix",
    (snapshot) => snapshot.pythonTarget.prefix === "import fixture_module\n",
  );

  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentEnd(client);
  await insertText(client, "\nprint('browser suffix')");
  await waitForSnapshot(
    backendOrigin,
    "the authored Generated Python suffix",
    (snapshot) =>
      snapshot.pythonTarget.suffix.endsWith("print('browser suffix')"),
  );
}

async function createCallable(client, backendOrigin, name) {
  const inputSelector = "input[name='new-callable-name']";
  if (
    !(await evaluate(
      client,
      `document.querySelector(${JSON.stringify(inputSelector)}) instanceof HTMLInputElement`,
    ))
  ) {
    const emptyStateAction = await evaluate(
      client,
      'document.querySelector(".python-canvas-empty-state button") instanceof HTMLButtonElement',
    );
    const actionSelector = emptyStateAction
      ? ".python-canvas-empty-state button"
      : ".python-canvas-project-controls > button";
    await clickElementCenter(client, actionSelector, "the Add callable action");
    await waitFor(
      client,
      "the focused callable-name input",
      `document.activeElement === document.querySelector(${JSON.stringify(inputSelector)})`,
    );
  }
  await replaceNativeInputAndSubmit(
    client,
    inputSelector,
    name,
    `the ${name} create control`,
  );
  await waitForSnapshot(
    backendOrigin,
    `the ${name} callable`,
    (snapshot) => findCallable(snapshot, name) !== null,
  );
  const expressionSelector = `${callableSectionSelector(name)} input[name='callable-expression']`;
  await waitFor(
    client,
    `the ${name} callable expression control`,
    `document.querySelector(${JSON.stringify(expressionSelector)}) instanceof HTMLInputElement`,
  );
}

async function commitCallableExpression(
  client,
  backendOrigin,
  name,
  expression,
) {
  await replaceNativeInputAndSubmit(
    client,
    `${callableSectionSelector(name)} input[name='callable-expression']`,
    expression,
    `the ${name} callable expression`,
  );
  await waitForSnapshot(
    backendOrigin,
    `the ${name} callable expression commit`,
    (snapshot) =>
      findCallable(snapshot, name)?.authoredExpression === expression,
  );
}

async function exerciseParameterAuthoring(
  client,
  backendOrigin,
  initialCallable,
) {
  const initialProviderMetadata = providerMetadata(initialCallable);
  const firstApp = await addAppParameter(
    client,
    backendOrigin,
    initialCallable,
  );
  await setParameterName(client, backendOrigin, firstApp.id, "browser_note");
  await setParameterExpression(client, backendOrigin, firstApp.id, "3");
  await setParameterName(client, backendOrigin, firstApp.id, "browser_value");

  const afterFirstApp = await fetchCanonicalSnapshot(backendOrigin);
  const transient = await addAppParameter(
    client,
    backendOrigin,
    findRequiredCallable(afterFirstApp, sampleCallableName),
  );
  await setParameterName(client, backendOrigin, transient.id, "transient");
  await setParameterExpression(client, backendOrigin, transient.id, "4");

  const afterTransient = await fetchCanonicalSnapshot(backendOrigin);
  const last = await addAppParameter(
    client,
    backendOrigin,
    findRequiredCallable(afterTransient, sampleCallableName),
  );
  await setParameterName(client, backendOrigin, last.id, "last");
  await setParameterExpression(client, backendOrigin, last.id, "5");
  await clickElementCenter(
    client,
    callableToolbarButtonSelector(sampleCallableName, "Remove last parameter"),
    "the Remove Last parameter control",
  );
  await waitForSnapshot(
    backendOrigin,
    "the removal of the last app-authored parameter",
    (snapshot) =>
      !findRequiredCallable(snapshot, sampleCallableName).parameters.some(
        (parameter) => parameter.id === last.id,
      ),
  );

  await filterParameters(client, firstApp.id, transient.id, "browser_value");
  await invokeParameterItemAction(client, backendOrigin, transient.id);

  const afterItemAction = await fetchCanonicalSnapshot(backendOrigin);
  const selectedApp = await addAppParameter(
    client,
    backendOrigin,
    findRequiredCallable(afterItemAction, sampleCallableName),
  );
  await setParameterName(
    client,
    backendOrigin,
    selectedApp.id,
    "selected_value",
  );
  await setParameterExpression(client, backendOrigin, selectedApp.id, "5");
  await deleteSelectedParameter(
    client,
    backendOrigin,
    selectedApp.id,
    "app-authored parameter",
  );

  const afterSelectedApp = await fetchCanonicalSnapshot(backendOrigin);
  const secondApp = await addAppParameter(
    client,
    backendOrigin,
    findRequiredCallable(afterSelectedApp, sampleCallableName),
  );
  await setParameterName(client, backendOrigin, secondApp.id, "second_value");
  await setParameterExpression(client, backendOrigin, secondApp.id, "4");

  await dragParameterToDifferentPosition(
    client,
    backendOrigin,
    firstApp.id,
    secondApp.id,
    "the app-authored parameter drag reorder",
  );

  const beforeProviderEdit = await fetchCanonicalSnapshot(backendOrigin);
  const providerFirst = requireProviderParameter(beforeProviderEdit, "first");
  const providerSecond = requireProviderParameter(beforeProviderEdit, "second");
  const providerKeyword = requireProviderParameter(
    beforeProviderEdit,
    "keyword",
  );
  await setParameterExpression(client, backendOrigin, providerFirst.id, "1");
  await dragParameterToDifferentPosition(
    client,
    backendOrigin,
    providerFirst.id,
    providerSecond.id,
    "the provider-derived parameter drag reorder",
  );
  await deleteSelectedParameter(
    client,
    backendOrigin,
    providerKeyword.id,
    "provider-derived parameter",
  );
  return initialProviderMetadata;
}

async function addAppParameter(client, backendOrigin, callable) {
  const beforeIDs = new Set(
    callable.parameters.map((parameter) => parameter.id),
  );
  await clickElementCenter(
    client,
    callableToolbarButtonSelector(sampleCallableName, "Add parameter"),
    "the Add parameter control",
  );
  const snapshot = await waitForSnapshot(
    backendOrigin,
    "the added app-authored parameter",
    (next) => {
      const current = findRequiredCallable(next, sampleCallableName);
      return (
        current !== null &&
        current.parameters.some(
          (parameter) =>
            !beforeIDs.has(parameter.id) && parameter.nameEditable === true,
        )
      );
    },
  );
  const added = findRequiredCallable(
    snapshot,
    sampleCallableName,
  ).parameters.find((parameter) => !beforeIDs.has(parameter.id));
  assert.ok(added, "The added app-authored parameter was not persisted.");
  return added;
}

async function setParameterName(client, backendOrigin, parameterID, name) {
  await activateContentEditableTextBox(
    client,
    `${parameterRowSelector(parameterID)} ${contentEditableTextBoxSelector("Item name")}`,
    `the ItemNameEditor for ${name}`,
  );
  await selectAll(client);
  await insertText(client, name);
  await pressEscape(client);
  await waitForSnapshot(
    backendOrigin,
    `the ${name} app-authored parameter name`,
    (snapshot) =>
      findRequiredCallable(snapshot, sampleCallableName).parameters.some(
        (parameter) => parameter.id === parameterID && parameter.name === name,
      ),
  );
}

async function setParameterExpression(
  client,
  backendOrigin,
  parameterID,
  expression,
) {
  const callable = findRequiredCallable(
    await fetchCanonicalSnapshot(backendOrigin),
    sampleCallableName,
  );
  const parameter = callable.parameters.find(
    (candidate) => candidate.id === parameterID,
  );
  assert.ok(parameter, `The ${parameterID} parameter was not present.`);
  const label = parameter.name === "" ? "Unnamed parameter" : parameter.name;
  await activateContentEditableTextBox(
    client,
    `${parameterRowSelector(parameterID)} ${contentEditableTextBoxSelector(`${label} expression`)}`,
    `the ${label} expression editor`,
  );
  await selectAll(client);
  await insertText(client, expression);
  await pressEscape(client);
  await waitForSnapshot(backendOrigin, `the ${label} expression`, (snapshot) =>
    findRequiredCallable(snapshot, sampleCallableName).parameters.some(
      (candidate) =>
        candidate.id === parameterID &&
        candidate.authoredExpression === expression,
    ),
  );
}

async function filterParameters(
  client,
  matchingParameterID,
  hiddenParameterID,
  name,
) {
  const selector = `${callableSectionSelector(sampleCallableName)} input[id$="-parameter-filter"]`;
  await clickElementCenter(client, selector, "the parameter filter");
  await selectAll(client);
  await insertText(client, name);
  await waitFor(
    client,
    "the filtered app-authored parameter rows",
    `document.querySelector(${JSON.stringify(`${callableSectionSelector(sampleCallableName)} ${parameterRowSelector(matchingParameterID)}`)}) !== null &&
      document.querySelector(${JSON.stringify(`${callableSectionSelector(sampleCallableName)} ${parameterRowSelector(hiddenParameterID)}`)}) === null`,
  );
  await clickElementCenter(
    client,
    `${callableSectionSelector(sampleCallableName)} ${labeledSelector("Clear parameter filter")}`,
    "the Clear parameter filter control",
  );
  await waitFor(
    client,
    "the cleared parameter filter",
    `document.querySelector(${JSON.stringify(`${callableSectionSelector(sampleCallableName)} ${parameterRowSelector(hiddenParameterID)}`)}) !== null`,
  );
}

async function invokeParameterItemAction(client, backendOrigin, parameterID) {
  const row = parameterRowSelector(parameterID);
  await focusElement(client, row, "the transient parameter row");
  await pressItemActionMenuKey(client);
  await waitFor(
    client,
    "the Workspace item actions menu",
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Workspace item actions"))});
      const action = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((item) => item.textContent?.trim() === "Delete parameter");
      return action instanceof HTMLElement &&
        !action.hasAttribute("data-disabled") &&
        document.activeElement === action;
    })()`,
  );
  const actionInvoked = await evaluate(
    client,
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Workspace item actions"))});
      const action = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((item) => item.textContent?.trim() === "Delete parameter");
      if (!(action instanceof HTMLElement) || action.hasAttribute("data-disabled")) {
        return false;
      }
      action.click();
      return true;
    })()`,
  );
  assert.equal(actionInvoked, true, "The focused item action is missing.");
  await waitForSnapshot(
    backendOrigin,
    "the parameter deleted through its item action",
    (snapshot) =>
      !findRequiredCallable(snapshot, sampleCallableName).parameters.some(
        (parameter) => parameter.id === parameterID,
      ),
  );
}

async function dragParameterToDifferentPosition(
  client,
  backendOrigin,
  sourceID,
  targetID,
  description,
) {
  const before = findRequiredCallable(
    await fetchCanonicalSnapshot(backendOrigin),
    sampleCallableName,
  ).parameters.map((parameter) => parameter.id);
  await activateSampleCallableSection(client);
  await prepareElementDrag(
    client,
    parameterRowSelector(sourceID),
    parameterRowSelector(targetID),
    description,
  );
  await holdItemSelectionChord(client);
  try {
    await waitForParameterSelectionMode(client, sourceID);
    await dragElementToElement(
      client,
      parameterRowSelector(sourceID),
      parameterRowSelector(targetID),
      description,
      itemSelectionModifiers(),
    );
  } finally {
    await releaseItemSelectionChord(client);
  }
  await waitForParameterSelectionModeReleased(client, sourceID);
  await waitForSnapshot(backendOrigin, description, (snapshot) => {
    const after = findRequiredCallable(
      snapshot,
      sampleCallableName,
    ).parameters.map((parameter) => parameter.id);
    return after.indexOf(sourceID) !== before.indexOf(sourceID);
  });
}

async function activateSampleCallableSection(client) {
  const selector = callableSectionSelector(sampleCallableName);
  await focusElement(client, selector, "the Sample callable section");
  await pressEnter(client);
  await waitFor(
    client,
    "the active Sample callable section",
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute("data-section-active") === "true"`,
  );
}

async function deleteSelectedParameter(
  client,
  backendOrigin,
  parameterID,
  parameterKind,
) {
  await clearParameterSelection(client);
  await holdItemSelectionChord(client);
  try {
    await waitForParameterSelectionMode(client, parameterID);
    await clickParameterSelectionRow(
      client,
      parameterRowSelector(parameterID),
      `the ${parameterKind} selection row`,
    );
    await waitFor(
      client,
      `the selected ${parameterKind} row`,
      `document.querySelector(${JSON.stringify(parameterRowSelector(parameterID))})?.getAttribute("aria-label")?.includes(", selected") === true`,
    );
  } finally {
    await releaseItemSelectionChord(client);
  }
  await waitForParameterSelectionModeReleased(client, parameterID);
  await clickElementCenter(
    client,
    callableToolbarButtonSelector(
      sampleCallableName,
      "Delete selected parameters",
    ),
    "the Delete Selected parameter control",
  );
  await waitForSnapshot(
    backendOrigin,
    `the deleted ${parameterKind}`,
    (snapshot) =>
      !findRequiredCallable(snapshot, sampleCallableName).parameters.some(
        (parameter) => parameter.id === parameterID,
      ),
  );
}

async function clearParameterSelection(client) {
  await holdItemSelectionChord(client);
  try {
    await waitForParameterSelectionMode(client);
    const selectedIDs = await evaluate(
      client,
      `Array.from(
        document.querySelectorAll(${JSON.stringify(`${callableSectionSelector(sampleCallableName)} [data-workspace-item-id]`)}),
        (row) => ({
          id: row.getAttribute("data-workspace-item-id"),
          selected: row.getAttribute("aria-label")?.includes(", selected") === true,
        }),
      ).filter((row) => row.selected).map((row) => row.id)`,
    );
    for (const parameterID of selectedIDs) {
      if (typeof parameterID === "string") {
        await clickParameterSelectionRow(
          client,
          workspaceItemRowSelector(parameterID),
          "the selected parameter row",
        );
      }
    }
  } finally {
    await releaseItemSelectionChord(client);
  }
  await waitForParameterSelectionModeReleased(client);
}

async function clickParameterSelectionRow(client, selector, description) {
  const clicked = await evaluate(
    client,
    `(() => {
      const row = document.querySelector(${JSON.stringify(selector)});
      if (!(row instanceof HTMLElement)) {
        return false;
      }
      row.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `${description} is not on the page.`);
}

async function waitForParameterSelectionMode(client, parameterID = null) {
  const selector =
    parameterID === null
      ? `${callableSectionSelector(sampleCallableName)} [data-workspace-item-id]`
      : parameterRowSelector(parameterID);
  await waitFor(
    client,
    "the parameter selection mode",
    `(() => {
      const row = document.querySelector(${JSON.stringify(selector)});
      return row?.getAttribute("role") === "group" &&
        row.getAttribute("aria-label")?.startsWith("Selectable item ") === true;
    })()`,
  );
}

async function waitForParameterSelectionModeReleased(
  client,
  parameterID = null,
) {
  const selector =
    parameterID === null
      ? `${callableSectionSelector(sampleCallableName)} [data-workspace-item-id]`
      : parameterRowSelector(parameterID);
  await waitFor(
    client,
    "the released parameter selection mode",
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute("role") !== "group"`,
  );
}

async function observeGeneratedDocumentBoundaries(client, backendOrigin) {
  const beforeOuterCompletion = await targetCompletionRequestCount(client);
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentStart(client);
  await pressEnd(client);
  await pressCompletion(client);
  await waitForTargetCompletionRequest(
    client,
    beforeOuterCompletion,
    "a prefix completion request",
  );
  await pressEscape(client);

  const beforeSuffixCompletion = await targetCompletionRequestCount(client);
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentEnd(client);
  await pressCompletion(client);
  await waitForTargetCompletionRequest(
    client,
    beforeSuffixCompletion,
    "a suffix completion request",
  );
  await pressEscape(client);

  const beforeRejectedEdit = await fetchCanonicalSnapshot(backendOrigin);
  const protectedPoints = await generatedBodySelectionPoints(client);
  await dragBetweenPoints(client, protectedPoints.start, protectedPoints.end);
  await insertText(client, "blocked generated change");
  await nextAnimationFrame(client);
  const afterRejectedEdit = await fetchCanonicalSnapshot(backendOrigin);
  assert.equal(
    afterRejectedEdit.generatedCode.code,
    beforeRejectedEdit.generatedCode.code,
    "A transaction that touched the generated body changed canonical Python.",
  );

  const beforeProtectedCompletion = await targetCompletionRequestCount(client);
  await clickPoint(client, protectedPoints.center);
  await pressCompletion(client);
  await nextAnimationFrame(client);
  await nextAnimationFrame(client);
  assert.equal(
    await targetCompletionRequestCount(client),
    beforeProtectedCompletion,
    "A generated-body cursor requested target completion.",
  );
}

async function observeTargetDiagnostics(client, backendOrigin) {
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentEnd(client);
  await insertText(client, "\nnot_defined_in_browser_walkthrough");
  await waitForSnapshot(
    backendOrigin,
    "a diagnostic for the authored target suffix",
    (snapshot) =>
      snapshot.diagnostics.some((diagnostic) => diagnostic.targetId === null),
  );
}

async function generatedBodySelectionPoints(client) {
  const points = await evaluate(
    client,
    `(() => {
      const editor = document.querySelector(${JSON.stringify(`${generatedPythonEditorSelector} [role="textbox"]`)});
      if (!(editor instanceof HTMLElement)) {
        return null;
      }
      const lines = Array.from(editor.querySelectorAll("[data-workspace-generated-line]"));
      const first = lines[0];
      const last = lines.at(-1);
      if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) {
        return null;
      }
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      if (firstRect.width <= 0 || firstRect.height <= 0 || lastRect.width <= 0 || lastRect.height <= 0) {
        return null;
      }
      return {
        center: { x: firstRect.left + firstRect.width / 2, y: firstRect.top + firstRect.height / 2 },
        end: { x: lastRect.right - 2, y: lastRect.top + lastRect.height / 2 },
        start: { x: firstRect.left + 2, y: firstRect.top + firstRect.height / 2 },
      };
    })()`,
  );
  assert.ok(
    points,
    "The Generated Python body did not expose visible line marks.",
  );
  return points;
}

async function targetCompletionRequestCount(client) {
  return evaluate(
    client,
    `performance.getEntriesByType("resource").filter((entry) => {
      try {
        return new URL(entry.name).pathname === "/api/v2/project/target/completions";
      } catch {
        return false;
      }
    }).length`,
  );
}

async function waitForTargetCompletionRequest(client, before, description) {
  await waitFor(
    client,
    description,
    `performance.getEntriesByType("resource").filter((entry) => {
      try {
        return new URL(entry.name).pathname === "/api/v2/project/target/completions";
      } catch {
        return false;
      }
    }).length > ${String(before)}`,
  );
}

async function waitForSnapshot(backendOrigin, description, predicate) {
  const deadline = Date.now() + productionTimeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await fetchCanonicalSnapshot(backendOrigin);
    if (predicate(latest)) {
      return latest;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical V2 project: ${JSON.stringify(latest)}.`,
  );
}

function callableSectionSelector(name) {
  return `[role="group"][aria-label^=${JSON.stringify(`${name} section`)}]`;
}

function callableToolbarButtonSelector(name, label) {
  return `${callableSectionSelector(name)} button[aria-label=${JSON.stringify(label)}]`;
}

function parameterRowSelector(parameterID) {
  return workspaceItemRowSelector(
    `python-canvas:parameter-item:${encodeURIComponent(parameterID)}`,
  );
}

function workspaceItemRowSelector(itemID) {
  return `[data-workspace-item-id=${JSON.stringify(itemID)}]`;
}

function findCallable(snapshot, name) {
  return snapshot.callables.find((callable) => callable.name === name) ?? null;
}

function findRequiredCallable(snapshot, name) {
  const callable = findCallable(snapshot, name);
  assert.ok(
    callable,
    `The ${name} callable was not present in the V2 snapshot.`,
  );
  return callable;
}

function requireProviderParameter(snapshot, name) {
  const parameter = findRequiredCallable(
    snapshot,
    sampleCallableName,
  ).parameters.find(
    (candidate) => candidate.name === name && candidate.nameEditable === false,
  );
  assert.ok(
    parameter,
    `The provider-derived ${name} parameter was not present.`,
  );
  return parameter;
}

function assertCanonicalParameterMetadata(callable) {
  for (const parameter of callable.parameters) {
    if (parameter.nameEditable) {
      assert.equal(parameter.providerOrdinal, null);
      assert.equal(parameter.passingStyle, "positional_or_keyword");
      assert.equal(parameter.typeAnnotation, null);
      assert.equal(parameter.default, null);
      continue;
    }
    assert.equal(Number.isInteger(parameter.providerOrdinal), true);
  }
}

function providerMetadata(callable) {
  return new Map(
    callable.parameters
      .filter((parameter) => parameter.nameEditable === false)
      .map((parameter) => [parameter.id, providerMetadataRecord(parameter)]),
  );
}

function assertRetainedProviderMetadata(callable, initialMetadata) {
  for (const parameter of callable.parameters) {
    if (parameter.nameEditable) {
      continue;
    }
    const initial = initialMetadata.get(parameter.id);
    assert.ok(
      initial,
      `The provider-derived ${parameter.id} parameter is new.`,
    );
    assert.deepEqual(providerMetadataRecord(parameter), initial);
  }
}

function providerMetadataRecord(parameter) {
  return {
    default: parameter.default,
    name: parameter.name,
    nameEditable: parameter.nameEditable,
    passingStyle: parameter.passingStyle,
    providerOrdinal: parameter.providerOrdinal,
    typeAnnotation: parameter.typeAnnotation,
  };
}
