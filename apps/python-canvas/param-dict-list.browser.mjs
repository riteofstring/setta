import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import {
  exerciseCallableCommitParity,
  waitForSnapshot,
} from "./callable-commit.browser.mjs";
import {
  assertDictionaryDiagnosticCleared,
  assertDictionaryDiagnosticPresentation,
  assertDictionaryTree,
  assertFocusNotStolenAfterSectionMove,
  assertGeneratedDictionary,
  assertGeneratedListOrder,
  assertNoGeneratedPythonDuplicate,
  assertRevisionIncremented,
  assertSectionFieldSize,
  assertSectionSize,
  captureFocusBeforeSectionMove,
  callableWorkspaceSectionId,
  createPaneSection,
  dictionaryRowHeight,
  findDictionaryEntry,
  itemRowSelector,
  callableSectionSelector,
  listSectionSelector,
  listChildCountSelector,
  parameterDictionarySectionSelector,
  requireCallable,
  requireDiagnostic,
  requireDictionary,
  requireList,
  sameListChildren,
  sectionFieldSize,
  sectionSize,
  snapshotCollection,
} from "./param-dict-list.browser-support.mjs";
import {
  activateAndSelectAllContentEditableTextBox,
  clickElementCenter,
  contentEditableTextBoxSelector,
  dragElementToElement,
  evaluate,
  focusElement,
  holdItemSelectionChord,
  insertText,
  itemSelectionModifiers,
  labeledSelector,
  nextAnimationFrame,
  prepareElementDrag,
  pressEnter,
  pressEscape,
  releaseItemSelectionChord,
  selectAll,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

const dictionaryEntryWorkspaceItemPrefix =
  "python-canvas:dictionary-entry-item:";

export const dictionaryEntryChildAdoptionDragTarget = Object.freeze({
  targetXFraction: 0.5,
  targetYFraction: 0.5,
});

export const listNestedSectionSurfaceSelector =
  ":scope > .flex.flex-col > .flex.items-stretch > .mt-2.flex.flex-col";

export const listNestedSortableSectionSelector = `${listNestedSectionSurfaceSelector} > [data-sortable-section-id]`;

export function listNestedChildOrderExpression(
  listId,
  expectedWorkspaceChildIds,
) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(listSectionSelector(listId))});
    const sectionWrapper = section?.parentElement;
    if (!(section instanceof HTMLElement) || !(sectionWrapper instanceof HTMLElement)) {
      return false;
    }
    const childIds = Array.from(
      sectionWrapper.querySelectorAll(${JSON.stringify(listNestedSortableSectionSelector)}),
    ).map((sortable) => sortable.getAttribute("data-sortable-section-id"));
    const expected = ${JSON.stringify(expectedWorkspaceChildIds)};
    return childIds.length === expected.length &&
      childIds.every((childId, index) => childId === expected[index]);
  })()`;
}

export async function waitForListNestedChildOrder(
  client,
  listId,
  expectedWorkspaceChildIds,
) {
  await waitFor(
    client,
    "the List of Objects direct child projection",
    listNestedChildOrderExpression(listId, expectedWorkspaceChildIds),
  );
}

export async function exerciseParamDictAndListSlice(
  client,
  backendOrigin,
  topLevelCallableId,
) {
  const dictionary = await createPaneSection(client, backendOrigin, {
    collection: "parameterDictionaries",
    defaultName: "New Param Dict",
    label: "Param Dict",
    sectionSelector: parameterDictionarySectionSelector,
  });
  const dictionarySelector = parameterDictionarySectionSelector(dictionary.id);
  const dictionarySize = await sectionSize(client, dictionarySelector);
  const topLevelCallableSize = await sectionFieldSize(
    client,
    callableSectionSelector(topLevelCallableId),
  );
  const radius = await addDictionaryEntry(client, dictionary.id);
  await setDictionaryEntryName(
    client,
    backendOrigin,
    dictionary.id,
    radius,
    "radius",
  );
  const rowHeight = await dictionaryRowHeight(client, radius.workspaceItemId);
  const unresolved = await setDictionaryEntryExpression(
    client,
    backendOrigin,
    dictionary.id,
    radius,
    "missing_radius",
  );
  const radiusDiagnostic = requireDiagnostic(unresolved, radius.id);
  await assertDictionaryDiagnosticPresentation(
    client,
    radius.workspaceItemId,
    radiusDiagnostic.message,
    rowHeight,
  );
  assertNoGeneratedPythonDuplicate(unresolved, radiusDiagnostic);
  assertGeneratedDictionary(unresolved, "missing_radius");

  const options = await addDictionaryEntry(client, dictionary.id);
  await setDictionaryEntryName(
    client,
    backendOrigin,
    dictionary.id,
    options,
    "options",
  );
  const scale = await addDictionaryEntry(client, dictionary.id);
  await setDictionaryEntryName(
    client,
    backendOrigin,
    dictionary.id,
    scale,
    "scale",
  );
  await setDictionaryEntryExpression(
    client,
    backendOrigin,
    dictionary.id,
    scale,
    "2",
  );
  const nestedDictionary = await moveDictionaryEntryUnder(
    client,
    backendOrigin,
    dictionary.id,
    scale,
    options,
  );
  assertDictionaryTree(
    nestedDictionary,
    dictionary.id,
    radius.id,
    options.id,
    scale.id,
  );
  await assertSectionSize(client, dictionarySelector, dictionarySize);
  assertGeneratedDictionary(nestedDictionary, "missing_radius");

  const correctedDictionary = await setDictionaryEntryExpression(
    client,
    backendOrigin,
    dictionary.id,
    radius,
    "4",
  );
  assert.equal(
    correctedDictionary.diagnostics.some(
      (diagnostic) => diagnostic.targetId === radius.id,
    ),
    false,
    "Correcting radius did not remove its canonical diagnostic.",
  );
  await assertDictionaryDiagnosticCleared(
    client,
    radius.workspaceItemId,
    rowHeight,
  );
  await assertSectionSize(client, dictionarySelector, dictionarySize);
  assertGeneratedDictionary(correctedDictionary, "4");

  const outerList = await createPaneSection(client, backendOrigin, {
    collection: "lists",
    defaultName: "New List of Objects",
    label: "List of Objects",
    sectionSelector: listSectionSelector,
  });
  await setListChildCountToTwo(client, outerList.id);
  const listWithChildren = await addListChildren(
    client,
    backendOrigin,
    outerList.id,
    2,
  );
  const outerChildIds = requireList(
    listWithChildren,
    outerList.id,
  ).childSectionIds;
  assert.equal(
    outerChildIds.length,
    2,
    "The list did not create exactly two callables.",
  );
  await assertVerticalListPresentation(
    client,
    outerList.id,
    outerChildIds,
    topLevelCallableSize,
  );

  const firstChild = requireCallable(listWithChildren, outerChildIds[0]);
  const renamedFirstChild = await renameCallable(
    client,
    backendOrigin,
    firstChild,
    "List child callable",
  );
  await exerciseChildCallableCommitParity(
    client,
    backendOrigin,
    renamedFirstChild,
    "New_List_of_Objects__0",
  );

  const beforeDictionaryMove = await fetchCanonicalSnapshot(backendOrigin);
  const dictionaryMoveFocus = await dragFreeSectionToSection(
    client,
    dictionarySelector,
    callableSectionSelector(outerChildIds[1]),
    "moving the Param Dict between the list children",
    0.25,
    true,
  );
  const dictionaryInList = await waitForSnapshot(
    backendOrigin,
    "the Param Dict placed between list children",
    (snapshot) =>
      sameListChildren(snapshot, outerList.id, [
        outerChildIds[0],
        dictionary.id,
        outerChildIds[1],
      ]),
  );
  assertRevisionIncremented(beforeDictionaryMove, dictionaryInList);
  await assertSectionSize(client, dictionarySelector, dictionarySize);
  await assertSectionFieldSize(
    client,
    callableSectionSelector(outerChildIds[0]),
    topLevelCallableSize,
  );
  await assertSectionFieldSize(
    client,
    callableSectionSelector(outerChildIds[1]),
    topLevelCallableSize,
  );
  await assertFocusNotStolenAfterSectionMove(client, dictionaryMoveFocus);
  assertGeneratedListOrder(dictionaryInList, 3);

  const beforeListReorder = dictionaryInList;
  const dictionaryReorderFocus = await dragFreeSectionToSection(
    client,
    dictionarySelector,
    callableSectionSelector(outerChildIds[0]),
    "reordering the Param Dict to the front of the list",
    0.25,
    true,
  );
  const dictionaryFirst = await waitForSnapshot(
    backendOrigin,
    "the Param Dict reordered to the front of the list",
    (snapshot) =>
      sameListChildren(snapshot, outerList.id, [
        dictionary.id,
        outerChildIds[0],
        outerChildIds[1],
      ]),
  );
  assertRevisionIncremented(beforeListReorder, dictionaryFirst);
  await assertSectionSize(client, dictionarySelector, dictionarySize);
  await assertSectionFieldSize(
    client,
    callableSectionSelector(outerChildIds[0]),
    topLevelCallableSize,
  );
  await assertSectionFieldSize(
    client,
    callableSectionSelector(outerChildIds[1]),
    topLevelCallableSize,
  );
  await assertFocusNotStolenAfterSectionMove(client, dictionaryReorderFocus);
  assertGeneratedListOrder(dictionaryFirst, 3);

  const beforeTopLevelMove = dictionaryFirst;
  const callableTopLevelFocus = await dragFreeSectionToCanvas(
    client,
    callableSectionSelector(outerChildIds[0]),
    "moving a callable back to the top level",
    true,
  );
  const callableAtTopLevel = await waitForSnapshot(
    backendOrigin,
    "the callable restored to the top level",
    (snapshot) =>
      snapshot.topLevelSectionIds.includes(outerChildIds[0]) &&
      sameListChildren(snapshot, outerList.id, [
        dictionary.id,
        outerChildIds[1],
      ]),
  );
  assertRevisionIncremented(beforeTopLevelMove, callableAtTopLevel);
  await assertSectionFieldSize(
    client,
    callableSectionSelector(outerChildIds[0]),
    topLevelCallableSize,
  );
  await assertSectionFieldSize(
    client,
    callableSectionSelector(outerChildIds[1]),
    topLevelCallableSize,
  );
  await assertFocusNotStolenAfterSectionMove(client, callableTopLevelFocus);
  assertGeneratedListOrder(callableAtTopLevel, 2);

  const nestedList = await createPaneSection(client, backendOrigin, {
    collection: "lists",
    defaultName: "New List of Objects 2",
    label: "List of Objects",
    sectionSelector: listSectionSelector,
  });
  const beforeNestedListMove = await fetchCanonicalSnapshot(backendOrigin);
  await dragFreeSectionToSection(
    client,
    listSectionSelector(nestedList.id),
    callableSectionSelector(outerChildIds[1]),
    "moving a nested list into the outer list",
    0.25,
  );
  const nestedListPlaced = await waitForSnapshot(
    backendOrigin,
    "the nested list inside the outer list",
    (snapshot) =>
      sameListChildren(snapshot, outerList.id, [
        dictionary.id,
        nestedList.id,
        outerChildIds[1],
      ]),
  );
  assertRevisionIncremented(beforeNestedListMove, nestedListPlaced);

  const nestedWithChild = await addListChildren(
    client,
    backendOrigin,
    nestedList.id,
    1,
  );
  const nestedChildIds = requireList(
    nestedWithChild,
    nestedList.id,
  ).childSectionIds;
  assert.equal(
    nestedChildIds.length,
    1,
    "The nested list did not add one callable.",
  );
  await assertVerticalListPresentation(client, nestedList.id, nestedChildIds);

  const nestedWithoutChild = await removeListChildren(
    client,
    backendOrigin,
    nestedList.id,
    1,
  );
  assert.deepEqual(
    requireList(nestedWithoutChild, nestedList.id).childSectionIds,
    [],
    "The nested list did not remove its child from the end.",
  );
  assert.equal(
    nestedWithoutChild.callables.some(
      (callable) => callable.id === nestedChildIds[0],
    ),
    false,
    "Removing the nested child left its callable in the canonical project.",
  );

  await clickElementCenter(
    client,
    `${listSectionSelector(nestedList.id)} ${labeledSelector("Delete section")}`,
    "the nested list delete control",
  );
  const afterNestedDelete = await waitForSnapshot(
    backendOrigin,
    "the deleted nested-list subtree",
    (snapshot) =>
      !snapshot.lists.some((list) => list.id === nestedList.id) &&
      !snapshot.callables.some(
        (callable) => callable.id === nestedChildIds[0],
      ) &&
      sameListChildren(snapshot, outerList.id, [
        dictionary.id,
        outerChildIds[1],
      ]),
  );
  assert.equal(
    afterNestedDelete.generatedCode.body.includes("New_List_of_Objects_2"),
    false,
    "Deleting the nested list left a dangling generated state lookup.",
  );
  assertGeneratedListOrder(afterNestedDelete, 2);

  return {
    dictionaryId: dictionary.id,
    listId: outerList.id,
  };
}

async function addDictionaryEntry(client, dictionaryId) {
  const section = parameterDictionarySectionSelector(dictionaryId);
  const before = await dictionaryWorkspaceItemIDs(client, dictionaryId);
  await clickElementCenter(
    client,
    `${section} ${labeledSelector("Add parameter")}`,
    "the Param Dict Add parameter control",
  );
  await waitFor(
    client,
    "the new Param Dict entry row",
    `Array.from(document.querySelectorAll(${JSON.stringify(`${section} [data-workspace-item-id]`)}))
      .some((row) => !${JSON.stringify(before)}.includes(row.getAttribute("data-workspace-item-id")))`,
  );
  const workspaceItemId = await evaluate(
    client,
    `Array.from(document.querySelectorAll(${JSON.stringify(`${section} [data-workspace-item-id]`)}))
      .map((row) => row.getAttribute("data-workspace-item-id"))
      .find((itemId) => typeof itemId === "string" && !${JSON.stringify(before)}.includes(itemId))`,
  );
  assert.equal(
    typeof workspaceItemId,
    "string",
    "The new dictionary row has no item ID.",
  );
  assert.ok(
    workspaceItemId.startsWith(dictionaryEntryWorkspaceItemPrefix),
    "The new dictionary row is not a dictionary entry.",
  );
  return {
    id: decodeURIComponent(
      workspaceItemId.slice(dictionaryEntryWorkspaceItemPrefix.length),
    ),
    workspaceItemId,
  };
}

async function dictionaryWorkspaceItemIDs(client, dictionaryId) {
  const values = await evaluate(
    client,
    `Array.from(document.querySelectorAll(${JSON.stringify(`${parameterDictionarySectionSelector(dictionaryId)} [data-workspace-item-id]`)}),
      (row) => row.getAttribute("data-workspace-item-id"))
      .filter((itemId) => typeof itemId === "string")`,
  );
  assert.ok(Array.isArray(values), "The Param Dict rows are not available.");
  return values;
}

async function setDictionaryEntryName(
  client,
  backendOrigin,
  dictionaryId,
  entry,
  name,
) {
  await activateAndSelectAllContentEditableTextBox(
    client,
    `${itemRowSelector(entry.workspaceItemId)} ${contentEditableTextBoxSelector("Item name")}`,
    `the ${name} dictionary entry name`,
  );
  await insertText(client, name);
  await pressEscape(client);
  return waitForSnapshot(
    backendOrigin,
    `the ${name} dictionary entry name`,
    (snapshot) =>
      findDictionaryEntry(snapshot, dictionaryId, entry.id)?.name === name,
  );
}

async function setDictionaryEntryExpression(
  client,
  backendOrigin,
  dictionaryId,
  entry,
  expression,
) {
  const current = findDictionaryEntry(
    await fetchCanonicalSnapshot(backendOrigin),
    dictionaryId,
    entry.id,
  );
  assert.ok(current, `The ${entry.id} dictionary entry is missing.`);
  await activateAndSelectAllContentEditableTextBox(
    client,
    `${itemRowSelector(entry.workspaceItemId)} ${contentEditableTextBoxSelector(`${current.name || "Unnamed entry"} expression`)}`,
    `the ${current.name} dictionary expression`,
  );
  await insertText(client, expression);
  await pressEscape(client);
  return waitForSnapshot(
    backendOrigin,
    `the ${current.name} dictionary expression`,
    (snapshot) => {
      const candidate = findDictionaryEntry(snapshot, dictionaryId, entry.id);
      return (
        candidate?.kind === "leaf" &&
        candidate.authoredExpression === expression
      );
    },
  );
}

async function moveDictionaryEntryUnder(
  client,
  backendOrigin,
  dictionaryId,
  source,
  target,
) {
  await activateSection(
    client,
    parameterDictionarySectionSelector(dictionaryId),
    "the Param Dict section",
  );
  await prepareElementDrag(
    client,
    itemRowSelector(source.workspaceItemId),
    itemRowSelector(target.workspaceItemId),
    "moving scale under options",
  );
  await holdItemSelectionChord(client);
  try {
    await waitForDictionarySelectionMode(client, source.workspaceItemId);
    await dragElementToElement(
      client,
      itemRowSelector(source.workspaceItemId),
      itemRowSelector(target.workspaceItemId),
      "moving scale under options",
      itemSelectionModifiers(),
      dictionaryEntryChildAdoptionDragTarget,
    );
  } finally {
    await releaseItemSelectionChord(client);
  }
  await waitForDictionarySelectionModeReleased(client, source.workspaceItemId);
  return waitForSnapshot(
    backendOrigin,
    "the nested Param Dict entry tree",
    (snapshot) => {
      const options = findDictionaryEntry(snapshot, dictionaryId, target.id);
      return (
        options?.kind === "parent" &&
        options.children.length === 1 &&
        options.children[0]?.id === source.id
      );
    },
  );
}

async function activateSection(client, selector, description) {
  await focusElement(client, selector, description);
  await pressEnter(client);
  await waitFor(
    client,
    `${description} active state`,
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute("data-section-active") === "true"`,
  );
}

async function waitForDictionarySelectionMode(client, workspaceItemId) {
  await waitFor(
    client,
    "the dictionary item selection mode",
    `(() => {
      const row = document.querySelector(${JSON.stringify(itemRowSelector(workspaceItemId))});
      return row?.getAttribute("role") === "group" &&
        row.getAttribute("aria-label")?.startsWith("Selectable item ") === true;
    })()`,
  );
}

async function waitForDictionarySelectionModeReleased(client, workspaceItemId) {
  await waitFor(
    client,
    "the released dictionary item selection mode",
    `document.querySelector(${JSON.stringify(itemRowSelector(workspaceItemId))})?.getAttribute("role") !== "group"`,
  );
}

async function setListChildCountToTwo(client, listId) {
  const selector = listChildCountSelector(listId);
  await clickElementCenter(
    client,
    selector,
    "the List of Objects child-count input",
  );
  await dispatchFocusedKey(client, "ArrowUp", "ArrowUp");
  await waitFor(
    client,
    "the List of Objects child count of two",
    `document.querySelector(${JSON.stringify(selector)})?.value === "2"`,
  );
}

async function addListChildren(client, backendOrigin, listId, count) {
  await clickElementCenter(
    client,
    `${listSectionSelector(listId)} ${labeledSelector("Add children")}`,
    "the List of Objects Add children control",
  );
  return waitForSnapshot(
    backendOrigin,
    `the ${String(count)} added List of Objects children`,
    (snapshot) =>
      requireList(snapshot, listId).childSectionIds.length === count,
  );
}

async function removeListChildren(
  client,
  backendOrigin,
  listId,
  expectedCount,
) {
  await clickElementCenter(
    client,
    `${listSectionSelector(listId)} ${labeledSelector("Remove children")}`,
    "the List of Objects Remove children control",
  );
  return waitForSnapshot(
    backendOrigin,
    "the removed List of Objects children",
    (snapshot) =>
      requireList(snapshot, listId).childSectionIds.length === expectedCount,
  );
}

async function assertVerticalListPresentation(
  client,
  listId,
  childIds,
  expectedCallableFieldSize,
) {
  const expectedWorkspaceChildIds = childIds.map(callableWorkspaceSectionId);
  await waitForListNestedChildOrder(
    client,
    listId,
    expectedWorkspaceChildIds,
  );
  const presentation = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(listSectionSelector(listId))});
      const sectionWrapper = section?.parentElement;
      if (!(section instanceof HTMLElement) || !(sectionWrapper instanceof HTMLElement)) {
        return null;
      }
      const sortables = Array.from(sectionWrapper.querySelectorAll(${JSON.stringify(listNestedSortableSectionSelector)}));
      const fields = sortables.map((sortable) => sortable.querySelector('[data-workspace-section-field="true"]'));
      return {
        childIds: sortables.map((sortable) => sortable.getAttribute("data-sortable-section-id")),
        dimensions: fields.map((field) => {
          if (!(field instanceof HTMLElement)) {
            return null;
          }
          const rect = field.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        }),
        vertical: sectionWrapper.querySelector(${JSON.stringify(listNestedSectionSurfaceSelector)}) instanceof HTMLElement,
      };
    })()`,
  );
  assert.ok(presentation, "The List of Objects section is not mounted.");
  assert.deepEqual(
    presentation.childIds,
    expectedWorkspaceChildIds,
    "The list does not present its canonical child order.",
  );
  assert.equal(
    presentation.vertical,
    true,
    "The List of Objects children are not vertically presented.",
  );
  assert.equal(
    presentation.dimensions.length,
    childIds.length,
    "A list child has no callable field.",
  );
  assert.ok(
    presentation.dimensions.every(
      (dimension) =>
        dimension !== null &&
        Math.abs(dimension.width - expectedCallableFieldSize.width) < 0.5 &&
        Math.abs(dimension.height - expectedCallableFieldSize.height) < 0.5,
    ),
    "List child callable editors do not match the top-level Callable dimensions.",
  );
}

async function renameCallable(client, backendOrigin, callable, name) {
  const selector = callableSectionSelector(callable.id);
  const titleSelector = `${selector} [role="button"][aria-label=${JSON.stringify(`${callable.name}, edit section title`)}]`;
  await focusElement(
    client,
    titleSelector,
    `the ${callable.name} list-child title`,
  );
  await pressEnter(client);
  const inputSelector = `${selector} input[aria-label="Section title"]`;
  await waitFor(
    client,
    "the editable list-child title",
    `document.activeElement === document.querySelector(${JSON.stringify(inputSelector)})`,
  );
  await selectAll(client);
  await insertText(client, name);
  await pressEnter(client);
  const snapshot = await waitForSnapshot(
    backendOrigin,
    `the ${name} list-child callable`,
    (next) =>
      next.callables.some(
        (candidate) => candidate.id === callable.id && candidate.name === name,
      ),
  );
  return requireCallable(snapshot, callable.id);
}

async function exerciseChildCallableCommitParity(
  client,
  backendOrigin,
  callable,
  expectedGeneratedPath,
) {
  const harness = {
    callableSectionSelector: () => callableSectionSelector(callable.id),
    findCallable: (snapshot) =>
      snapshot.callables.find((candidate) => candidate.id === callable.id) ??
      null,
    findRequiredCallable: (snapshot) => requireCallable(snapshot, callable.id),
  };
  await exerciseCallableCommitParity(
    client,
    backendOrigin,
    callable.name,
    expectedGeneratedPath,
    harness,
  );
}

async function dragFreeSectionToSection(
  client,
  sourceSelector,
  targetSelector,
  description,
  targetYFraction,
  verifyFocusContext = false,
) {
  return dragSection(client, {
    description,
    mode: "free",
    sourceSelector,
    targetSelector,
    targetYFraction,
    verifyFocusContext,
  });
}

async function dragFreeSectionToCanvas(
  client,
  sourceSelector,
  description,
  verifyFocusContext = false,
) {
  return dragSection(client, {
    description,
    mode: "free",
    sourceSelector,
    targetSelector:
      '.react-flow__pane[aria-label="Workspace canvas background"]',
    targetYFraction: 0.25,
    verifyFocusContext,
  });
}

async function dragSection(client, configuration) {
  const { sourceSelector } = configuration;
  await focusElement(
    client,
    sourceSelector,
    `${configuration.description} source`,
  );
  let focusCapture = null;
  await prepareElementDrag(
    client,
    sourceSelector,
    configuration.targetSelector,
    configuration.description,
  );
  const source = await visibleElementPoint(
    client,
    sourceSelector,
    `${configuration.description} source`,
  );
  const target = await visibleElementPoint(
    client,
    configuration.targetSelector,
    `${configuration.description} target`,
    configuration.targetYFraction,
  );
  await holdSectionDragMode(client, sourceSelector, configuration.mode);
  const modifiers = sectionDragModifiers(configuration.mode);
  try {
    await waitFor(
      client,
      `${configuration.description} mode activation`,
      sectionDragModeExpression(sourceSelector),
    );
    if (configuration.verifyFocusContext) {
      focusCapture = await captureFocusBeforeSectionMove(client, sourceSelector);
    }
    await client.send("Input.dispatchMouseEvent", {
      ...source,
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
    });
    await nextAnimationFrame(client);
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      modifiers,
      type: "mouseMoved",
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2,
    });
    await nextAnimationFrame(client);
    await waitFor(
      client,
      `${configuration.description} drag activation`,
      sectionDragActivationExpression(sourceSelector),
    );
    await client.send("Input.dispatchMouseEvent", {
      ...target,
      button: "left",
      buttons: 1,
      modifiers,
      type: "mouseMoved",
    });
    await nextAnimationFrame(client);
    await client.send("Input.dispatchMouseEvent", {
      ...target,
      button: "left",
      buttons: 0,
      modifiers,
      type: "mouseReleased",
    });
  } finally {
    await releaseSectionDragMode(client, sourceSelector, configuration.mode);
  }
  await nextAnimationFrame(client);
  return focusCapture;
}

async function holdSectionDragMode(client, sourceSelector, mode) {
  const modifier = platformModifier();
  const modifierProperty = modifier === "Meta" ? "metaKey" : "ctrlKey";
  const activated = await evaluate(
    client,
    `(() => {
      window.dispatchEvent(new Event("blur"));
      const target = document.querySelector(${JSON.stringify(sourceSelector)});
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      target.dispatchEvent(new KeyboardEvent("keydown", {
        altKey: true,
        bubbles: true,
        cancelable: true,
        code: "AltLeft",
        key: "Alt",
      }));
      ${
        mode === "sorting"
          ? `target.dispatchEvent(new KeyboardEvent("keydown", {
        altKey: true,
        bubbles: true,
        cancelable: true,
        code: ${JSON.stringify(modifier === "Meta" ? "MetaLeft" : "ControlLeft")},
        key: ${JSON.stringify(modifier)},
        ${modifierProperty}: true,
      }));`
          : ""
      }
      return true;
    })()`,
  );
  assert.equal(
    activated,
    true,
    "The section drag source is not on the canvas.",
  );
}

async function releaseSectionDragMode(client, sourceSelector, mode) {
  const modifier = platformModifier();
  const modifierProperty = modifier === "Meta" ? "metaKey" : "ctrlKey";
  await evaluate(
    client,
    `(() => {
      const target = document.querySelector(${JSON.stringify(sourceSelector)}) ??
        document.querySelector('[role="region"][aria-label="Workspace canvas"]');
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      ${
        mode === "sorting"
          ? `target.dispatchEvent(new KeyboardEvent("keyup", {
        altKey: true,
        bubbles: true,
        cancelable: true,
        code: ${JSON.stringify(modifier === "Meta" ? "MetaLeft" : "ControlLeft")},
        key: ${JSON.stringify(modifier)},
        ${modifierProperty}: false,
      }));`
          : ""
      }
      target.dispatchEvent(new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: "AltLeft",
        key: "Alt",
      }));
      window.dispatchEvent(new Event("blur"));
      return true;
    })()`,
  );
}

function sectionDragModeExpression(sourceSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sourceSelector)});
    return section?.parentElement?.classList.contains("nodrag") === true;
  })()`;
}

function sectionDragActivationExpression(sourceSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sourceSelector)});
    const container = section?.parentElement;
    return container instanceof HTMLElement &&
      Number.parseFloat(getComputedStyle(container).opacity) < 1;
  })()`;
}

function sectionDragModifiers(mode) {
  return mode === "sorting" ? 1 | platformModifierBit() : 1;
}

function platformModifier() {
  return process.platform === "darwin" ? "Meta" : "Control";
}

function platformModifierBit() {
  return process.platform === "darwin" ? 4 : 2;
}

async function dispatchFocusedKey(client, code, key) {
  await client.send("Input.dispatchKeyEvent", { code, key, type: "keyDown" });
  await client.send("Input.dispatchKeyEvent", { code, key, type: "keyUp" });
}
