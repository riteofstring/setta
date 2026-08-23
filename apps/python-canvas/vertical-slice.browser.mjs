import assert from "node:assert/strict";

import {
  fetchCanonicalSnapshot,
  runAgainstProductionApp,
} from "./browser-processes.mjs";
import {
  commitNewCallableExpression,
  exerciseCallableCommitParity,
  openWorkspaceCanvas,
  waitForCallableUiIdle,
  waitForSnapshot,
} from "./callable-commit.browser.mjs";
import { exerciseResolvedMathCallableLifecycle } from "./callable-lifecycle.browser.mjs";
import { observeGeneratedDocumentBoundaries } from "./generated-document-boundaries.browser.mjs";
import { exerciseParamDictAndListSlice } from "./param-dict-list.browser.mjs";
import {
  assertGeneratedMultilineCollection,
  assertListRootFixedHeight,
  assertPendingCreationHidden,
  installCreationResponseGate,
  releaseCreationResponseGate,
} from "./param-dict-list.browser-support.mjs";
import {
  editPythonTargetOuterRegions,
  observeTargetDiagnostics,
} from "./python-target.browser.mjs";
import {
  activateAndSelectAllContentEditableTextBox,
  activateContentEditableTextBox,
  clickElementCenter,
  dragElementToElement,
  evaluate,
  focusElement,
  holdItemSelectionChord,
  insertText,
  itemSelectionModifiers,
  labeledSelector,
  navigate,
  pressEnter,
  pressEscape,
  pressItemActionMenuKey,
  prepareElementDrag,
  releaseItemSelectionChord,
  rightClickPoint,
  selectAll,
  contentEditableTextBoxSelector,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

const defaultCallableName = "New callable";
const sampleCallableName = "Sample callable";
const zeroCallableName = "Zero callable";
const callableCommitHarness = {
  callableToolbarButtonSelector,
  callableSectionSelector,
  findCallable,
  findRequiredCallable,
  parameterRowSelector,
};
const waitForCallablePresentation = (client, name) =>
  waitForCallableUiIdle(client, name, callableCommitHarness);

await runAgainstProductionApp(
  async ({ backendOrigin, client, previewOrigin }) => {
    const initial = await fetchCanonicalSnapshot(backendOrigin);
    assert.deepEqual(initial.callables, []);
    await openWorkspaceCanvas(client, previewOrigin);
    await editPythonTargetOuterRegions(client, backendOrigin);
    await createCallable(client, backendOrigin, sampleCallableName);
    await exerciseCallableCommitParity(
      client,
      backendOrigin,
      sampleCallableName,
      "Sample_callable",
      callableCommitHarness,
    );
    await exerciseResolvedMathCallableLifecycle(
      client,
      backendOrigin,
      sampleCallableName,
      callableCommitHarness,
    );
  },
);

// The browser suite is a separately authorized standard check. Its only path
// is the V2 product: a fresh project is created through the launcher, every
// mutation is made through the public UI, and canonical state is observed with
// GET /api/v2/project before a restart opens the same file without --create.
await runAgainstProductionApp(
  async ({ backendOrigin, client, previewOrigin, restart }) => {
    const initial = await fetchCanonicalSnapshot(backendOrigin);
    assert.equal(initial.version, "v2");
    assert.deepEqual(initial.callables, []);

    await openWorkspaceCanvas(client, previewOrigin);

    await editPythonTargetOuterRegions(client, backendOrigin);

    await createCallable(client, backendOrigin, sampleCallableName);
    await commitNewCallableExpression(
      client,
      backendOrigin,
      sampleCallableName,
      "fixture_module.sample",
      callableCommitHarness,
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
    await commitNewCallableExpression(
      client,
      backendOrigin,
      zeroCallableName,
      "fixture_module.zero",
      callableCommitHarness,
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
      `${callableSectionSelector(zeroCallableName)} ${labeledSelector("Delete section")}`,
      "the zero-callable section delete control",
    );
    const afterZeroCallableDelete = await waitForSnapshot(
      backendOrigin,
      "the remaining callable after deletion",
      (snapshot) =>
        snapshot.callables.length === 1 &&
        snapshot.callables[0]?.name === sampleCallableName,
    );
    assertCanonicalParameterMetadata(
      findRequiredCallable(afterZeroCallableDelete, sampleCallableName),
    );
    assertRetainedProviderMetadata(
      findRequiredCallable(afterZeroCallableDelete, sampleCallableName),
      initialProviderMetadata,
    );
    const paramDictAndList = await exerciseParamDictAndListSlice(
      client,
      backendOrigin,
      findRequiredCallable(afterZeroCallableDelete, sampleCallableName).id,
    );
    const beforeRestart = await fetchCanonicalSnapshot(backendOrigin);
    assert.ok(
      beforeRestart.callables.some(
        (callable) => callable.name === sampleCallableName,
      ),
      "The sample callable was removed while exercising Param Dict and List of Objects.",
    );

    await restart();
    const restored = await fetchCanonicalSnapshot(backendOrigin);
    assert.equal(restored.version, "v2");
    assert.deepEqual(restored.callables, beforeRestart.callables);
    assert.deepEqual(
      restored.parameterDictionaries,
      beforeRestart.parameterDictionaries,
    );
    assert.deepEqual(restored.lists, beforeRestart.lists);
    assert.deepEqual(
      restored.topLevelSectionIds,
      beforeRestart.topLevelSectionIds,
    );
    assert.deepEqual(restored.pythonTarget, beforeRestart.pythonTarget);
    assert.equal(restored.generatedCode.code, beforeRestart.generatedCode.code);
    assert.deepEqual(restored.diagnostics, beforeRestart.diagnostics);
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
      "the restored callable section on the workspace canvas",
      `(() => {
        const canvas = document.querySelector('[role="region"][aria-label="Workspace canvas"]');
        const callable = document.querySelector(${JSON.stringify(callableSectionSelector(sampleCallableName))});
        const dictionary = document.querySelector(${JSON.stringify(`[data-section-id="python-canvas:parameter-dictionary:${paramDictAndList.dictionaryId}"]`)});
        const list = document.querySelector(${JSON.stringify(`[data-section-id="python-canvas:list:${paramDictAndList.listId}"]`)});
        return canvas instanceof HTMLElement && callable !== null && dictionary !== null && list !== null;
      })()`,
    );
    await assertListRootFixedHeight(
      client,
      paramDictAndList.listId,
      "The restored List of Objects root",
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

async function createCallable(client, backendOrigin, name) {
  const existingCallableIds = new Set(
    (await fetchCanonicalSnapshot(backendOrigin)).callables.map(
      (callable) => callable.id,
    ),
  );
  await rightClickPoint(
    client,
    await visibleElementPoint(
      client,
      '.react-flow__pane[aria-label="Workspace canvas background"]',
      "the blank workspace pane",
    ),
  );
  await waitFor(
    client,
    "the blank-pane creation menu",
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Create a workspace section"))});
      const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((candidate) => candidate.textContent?.trim() === "Python callable");
      return item instanceof HTMLElement &&
        item.getAttribute("data-disabled") !== "" &&
        item.getAttribute("aria-disabled") !== "true";
    })()`,
  );
  await installCreationResponseGate(client);
  const created = await evaluate(
    client,
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Create a workspace section"))});
      const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((candidate) => candidate.textContent?.trim() === "Python callable");
      if (!(item instanceof HTMLElement) || item.getAttribute("aria-disabled") === "true") {
        return false;
      }
      item.click();
      return true;
    })()`,
  );
  try {
    assert.equal(
      created,
      true,
      "The Python callable creation menu item is missing.",
    );
    await assertPendingCreationHidden(
      client,
      "python-canvas.callable-pending",
      "Python callable",
    );
  } finally {
    await releaseCreationResponseGate(client);
  }
  const createdSnapshot = await waitForSnapshot(
    backendOrigin,
    "the canonical callable created from the pane menu",
    (snapshot) =>
      snapshot.callables.some(
        (callable) =>
          !existingCallableIds.has(callable.id) &&
          callable.name === defaultCallableName,
      ),
  );
  const createdCallable = createdSnapshot.callables.find(
    (callable) =>
      !existingCallableIds.has(callable.id) &&
      callable.name === defaultCallableName,
  );
  assert.ok(
    createdCallable,
    "The pane menu did not create one canonical callable.",
  );
  const defaultSectionSelector = callableSectionSelector(defaultCallableName);
  const titleSelector = `${defaultSectionSelector} [role="button"][aria-label=${JSON.stringify(`${defaultCallableName}, edit section title`)}]`;
  await waitFor(
    client,
    "the created callable section title",
    `document.querySelector(${JSON.stringify(titleSelector)}) instanceof HTMLElement`,
  );
  await focusElement(
    client,
    titleSelector,
    `the ${defaultCallableName} callable section title`,
  );
  await pressEnter(client);
  const titleInputSelector = `${defaultSectionSelector} input[aria-label="Section title"]`;
  await waitFor(
    client,
    "the editable callable section title",
    `document.activeElement === document.querySelector(${JSON.stringify(titleInputSelector)})`,
  );
  await selectAll(client);
  await insertText(client, name);
  await pressEnter(client);
  await waitForSnapshot(
    backendOrigin,
    `the ${name} callable`,
    (snapshot) => findCallable(snapshot, name) !== null,
  );
  const expressionSelector = `${callableSectionSelector(name)} ${contentEditableTextBoxSelector("Callable expression")}`;
  await waitFor(
    client,
    `the ${name} callable expression control`,
    `document.querySelector(${JSON.stringify(expressionSelector)}) instanceof HTMLElement`,
  );
  await waitForCallablePresentation(client, name);
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
  await waitForCallablePresentation(client, sampleCallableName);

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
  await setParameterName(
    client,
    backendOrigin,
    firstApp.id,
    "browser_value_with_a_name_long_enough_to_force_multiline_rendering",
  );
  assertGeneratedMultilineCollection(
    await fetchCanonicalSnapshot(backendOrigin),
    {
      closing: ")",
      description: "The over-88-character Callable argument list",
      itemCount: 3,
      prefix: "fixture_module.sample(",
    },
  );
  await setParameterName(client, backendOrigin, firstApp.id, "browser_value");
  const beforeFourthArgument = await fetchCanonicalSnapshot(backendOrigin);
  const fourthArgument = await addAppParameter(
    client,
    backendOrigin,
    findRequiredCallable(beforeFourthArgument, sampleCallableName),
  );
  await setParameterName(
    client,
    backendOrigin,
    fourthArgument.id,
    "fourth_value",
  );
  await setParameterExpression(client, backendOrigin, fourthArgument.id, "8");
  assertGeneratedMultilineCollection(
    await fetchCanonicalSnapshot(backendOrigin),
    {
      closing: ")",
      description: "The four-item Callable argument list",
      itemCount: 4,
      prefix: "fixture_module.sample(",
    },
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
  await waitForCallablePresentation(client, sampleCallableName);
  return added;
}

async function setParameterName(client, backendOrigin, parameterID, name) {
  await activateAndSelectAllContentEditableTextBox(
    client,
    `${parameterRowSelector(parameterID)} ${contentEditableTextBoxSelector("Item name")}`,
    `the ItemNameEditor for ${name}`,
  );
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
  await waitForCallablePresentation(client, sampleCallableName);
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
  await activateAndSelectAllContentEditableTextBox(
    client,
    `${parameterRowSelector(parameterID)} ${contentEditableTextBoxSelector(`${label} expression`)}`,
    `the ${label} expression editor`,
  );
  await insertText(client, expression);
  await pressEscape(client);
  await waitForSnapshot(backendOrigin, `the ${label} expression`, (snapshot) =>
    findRequiredCallable(snapshot, sampleCallableName).parameters.some(
      (candidate) =>
        candidate.id === parameterID &&
        candidate.authoredExpression === expression,
    ),
  );
  await waitForCallablePresentation(client, sampleCallableName);
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
  await waitForCallablePresentation(client, sampleCallableName);
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
      { modifiers: itemSelectionModifiers() },
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
  await waitForCallablePresentation(client, sampleCallableName);
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
  await waitForCallablePresentation(client, sampleCallableName);
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
