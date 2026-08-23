import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

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
  parameterDictionaryWorkspaceSectionId,
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

const sectionMoveAttemptLimit = 3;
const sectionMoveObservationTimeoutMs = 500;
const sectionMoveObservationPollIntervalMs = 50;
const sectionCanvasDropMarginPx = 16;
const sectionCanvasDropCollisionClearancePx = 8;
const workspaceCanvasPaneSelector =
  '.react-flow__pane[aria-label="Workspace canvas background"]';
export const sectionDragPointerHoldMs = 200;
export const sectionDragPointerMoveSteps = 14;

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

export function listNestedSectionSourceExpression(
  listId,
  expectedWorkspaceChildIds,
  sourceWorkspaceSectionId,
) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(listSectionSelector(listId))});
    const sectionWrapper = section?.parentElement;
    if (!(section instanceof HTMLElement) || !(sectionWrapper instanceof HTMLElement)) {
      return false;
    }
    const sortables = Array.from(
      sectionWrapper.querySelectorAll(${JSON.stringify(listNestedSortableSectionSelector)}),
    );
    const expected = ${JSON.stringify(expectedWorkspaceChildIds)};
    if (
      sortables.length !== expected.length ||
      sortables.some(
        (sortable, index) =>
          sortable.getAttribute("data-sortable-section-id") !== expected[index],
      )
    ) {
      return false;
    }
    const source = sortables.find(
      (sortable) =>
        sortable.getAttribute("data-sortable-section-id") ===
        ${JSON.stringify(sourceWorkspaceSectionId)},
    );
    return source instanceof HTMLElement &&
      source.querySelector(${JSON.stringify(`[data-section-id=${JSON.stringify(sourceWorkspaceSectionId)}] header.section-title`)}) instanceof HTMLElement;
  })()`;
}

export async function waitForListNestedSectionSource(
  client,
  listId,
  expectedWorkspaceChildIds,
  sourceWorkspaceSectionId,
) {
  await waitFor(
    client,
    "the List of Objects nested section drag source",
    listNestedSectionSourceExpression(
      listId,
      expectedWorkspaceChildIds,
      sourceWorkspaceSectionId,
    ),
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
  const dictionaryInListPredicate = (snapshot) =>
    sameListChildren(snapshot, outerList.id, [
      outerChildIds[0],
      dictionary.id,
      outerChildIds[1],
    ]);
  const dictionaryMoveFocus = await dragFreeSectionToSection(
    client,
    dictionarySelector,
    callableSectionSelector(outerChildIds[1]),
    "moving the Param Dict between the list children",
    0.25,
    async () =>
      dictionaryInListPredicate(await fetchCanonicalSnapshot(backendOrigin)),
    true,
  );
  const dictionaryInList = await waitForSnapshot(
    backendOrigin,
    "the Param Dict placed between list children",
    dictionaryInListPredicate,
  );
  assertRevisionIncremented(beforeDictionaryMove, dictionaryInList);
  await waitForListNestedSectionSource(
    client,
    outerList.id,
    [
      callableWorkspaceSectionId(outerChildIds[0]),
      parameterDictionaryWorkspaceSectionId(dictionary.id),
      callableWorkspaceSectionId(outerChildIds[1]),
    ],
    parameterDictionaryWorkspaceSectionId(dictionary.id),
  );
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
  const dictionaryFirstPredicate = (snapshot) =>
    sameListChildren(snapshot, outerList.id, [
      dictionary.id,
      outerChildIds[0],
      outerChildIds[1],
    ]);
  const dictionaryReorderFocus = await dragFreeSectionToSection(
    client,
    dictionarySelector,
    callableSectionSelector(outerChildIds[0]),
    "reordering the Param Dict to the front of the list",
    0.25,
    async () =>
      dictionaryFirstPredicate(await fetchCanonicalSnapshot(backendOrigin)),
    true,
  );
  const dictionaryFirst = await waitForSnapshot(
    backendOrigin,
    "the Param Dict reordered to the front of the list",
    dictionaryFirstPredicate,
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
  const callableAtTopLevelPredicate = (snapshot) =>
    snapshot.topLevelSectionIds.includes(outerChildIds[0]) &&
    sameListChildren(snapshot, outerList.id, [dictionary.id, outerChildIds[1]]);
  const callableTopLevelFocus = await dragFreeSectionToCanvas(
    client,
    callableSectionSelector(outerChildIds[0]),
    "moving a callable back to the top level",
    async () =>
      callableAtTopLevelPredicate(await fetchCanonicalSnapshot(backendOrigin)),
    true,
    { backendOrigin, sourceListId: outerList.id },
  );
  const callableAtTopLevel = await waitForSnapshot(
    backendOrigin,
    "the callable restored to the top level",
    callableAtTopLevelPredicate,
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
  const nestedListPlacedPredicate = (snapshot) =>
    sameListChildren(snapshot, outerList.id, [
      dictionary.id,
      nestedList.id,
      outerChildIds[1],
    ]);
  await dragFreeSectionToSection(
    client,
    listSectionSelector(nestedList.id),
    callableSectionSelector(outerChildIds[1]),
    "moving a nested list into the outer list",
    0.25,
    async () =>
      nestedListPlacedPredicate(await fetchCanonicalSnapshot(backendOrigin)),
  );
  const nestedListPlaced = await waitForSnapshot(
    backendOrigin,
    "the nested list inside the outer list",
    nestedListPlacedPredicate,
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
  await assertVerticalListPresentation(
    client,
    nestedList.id,
    nestedChildIds,
    topLevelCallableSize,
  );

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
  if (
    !expectedCallableFieldSize ||
    !Number.isFinite(expectedCallableFieldSize.width) ||
    !Number.isFinite(expectedCallableFieldSize.height)
  ) {
    throw new Error(
      "Harness contract error: assertVerticalListPresentation requires a measured callable field size.",
    );
  }
  const expectedWorkspaceChildIds = childIds.map(callableWorkspaceSectionId);
  await waitForListNestedChildOrder(client, listId, expectedWorkspaceChildIds);
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
  hasMoved,
  verifyFocusContext = false,
) {
  return dragSection(client, {
    description,
    hasMoved,
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
  hasMoved,
  verifyFocusContext = false,
  failureDiagnostics = null,
) {
  return dragSection(client, {
    description,
    describeFailure:
      failureDiagnostics === null
        ? undefined
        : ({ target }) =>
            describeSectionMoveFailure({
              client,
              sourceSelector,
              target,
              ...failureDiagnostics,
            }),
    hasMoved,
    mode: "free",
    sourceSelector,
    resolveTargetPoint: (source) =>
      visibleCanvasDropPointForSection(
        client,
        sourceSelector,
        source,
        `${description} target`,
      ),
    targetSelector: workspaceCanvasPaneSelector,
    targetRetryYOffset: 0,
    verifyFocusContext,
  });
}

async function dragSection(client, configuration) {
  const { sourceSelector } = configuration;
  let focusCapture = null;
  let attemptedTarget = null;
  return retrySectionMoveUntilObserved({
    description: configuration.description,
    describeFailure: configuration.describeFailure
      ? () => configuration.describeFailure({ target: attemptedTarget })
      : undefined,
    hasMoved: configuration.hasMoved,
    performGesture: async (attempt) => {
      await focusElement(
        client,
        sourceSelector,
        `${configuration.description} source`,
      );
      await prepareElementDrag(
        client,
        sourceSelector,
        configuration.targetSelector,
        configuration.description,
      );
      const source = await sectionDragStartPoint(
        client,
        sourceSelector,
        `${configuration.description} source`,
      );
      const target = configuration.resolveTargetPoint
        ? await configuration.resolveTargetPoint(source)
        : await visibleElementPoint(
            client,
            configuration.targetSelector,
            `${configuration.description} target`,
            configuration.targetYFraction,
            configuration.targetXFraction ?? null,
            configuration.targetPointOptions,
          );
      attemptedTarget = {
        x: target.x,
        y: target.y + attempt * (configuration.targetRetryYOffset ?? 2),
      };
      await tryMovingFreeSectionDrag(client, {
        description: configuration.description,
        source,
        sourceSelector,
        target: attemptedTarget,
        captureFocus: configuration.verifyFocusContext && focusCapture === null,
        onCaptureFocus: (capture) => {
          focusCapture = capture;
        },
      });
      return focusCapture;
    },
  });
}

// A pane drop is resolved from the dragged section's rectangle, not just its pointer. Pick an
// exposed pane pixel that leaves the whole translated rectangle in the visible pane and away from
// every live section collision surface. The call lives inside the retry gesture so a canonical
// projection that settled between attempts always contributes fresh geometry.
export async function visibleCanvasDropPointForSection(
  client,
  sourceSelector,
  sourcePoint,
  description,
) {
  const result = await evaluate(
    client,
    `(() => {
      const pane = document.querySelector(${JSON.stringify(workspaceCanvasPaneSelector)});
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      if (!(pane instanceof HTMLElement) || !(source instanceof HTMLElement)) {
        return { point: null, reason: "missing source or workspace canvas" };
      }

      const paneRect = pane.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const visiblePane = {
        bottom: Math.min(window.innerHeight, paneRect.bottom),
        left: Math.max(0, paneRect.left),
        right: Math.min(window.innerWidth, paneRect.right),
        top: Math.max(0, paneRect.top),
      };
      if (
        sourceRect.width <= 0 ||
        sourceRect.height <= 0 ||
        visiblePane.right <= visiblePane.left ||
        visiblePane.bottom <= visiblePane.top
      ) {
        return { point: null, reason: "source or canvas has no visible geometry" };
      }

      const sourcePoint = ${JSON.stringify(sourcePoint)};
      const sourceOffset = {
        x: sourcePoint.x - sourceRect.left,
        y: sourcePoint.y - sourceRect.top,
      };
      const minimum = {
        x: Math.ceil(visiblePane.left + ${sectionCanvasDropMarginPx} + sourceOffset.x),
        y: Math.ceil(visiblePane.top + ${sectionCanvasDropMarginPx} + sourceOffset.y),
      };
      const maximum = {
        x: Math.floor(
          visiblePane.right -
            ${sectionCanvasDropMarginPx} -
            (sourceRect.width - sourceOffset.x),
        ),
        y: Math.floor(
          visiblePane.bottom -
            ${sectionCanvasDropMarginPx} -
            (sourceRect.height - sourceOffset.y),
        ),
      };
      if (minimum.x > maximum.x || minimum.y > maximum.y) {
        return {
          point: null,
          reason: "source cannot fit inside the visible canvas",
          maximum,
          minimum,
          sourceRect: sourceRect.toJSON(),
          visiblePane,
        };
      }

      const sourceSortable = source.closest("[data-sortable-section-id]");
      const collisionRects = Array.from(
        document.querySelectorAll("[data-section-id], [data-sortable-section-id]"),
      )
        .filter((element) => element instanceof HTMLElement)
        .filter(
          (element) =>
            element !== source &&
            element !== sourceSortable &&
            !source.contains(element) &&
            !(sourceSortable instanceof HTMLElement && sourceSortable.contains(element)),
        )
        .map((element) => ({
          id:
            element.getAttribute("data-section-id") ??
            element.getAttribute("data-sortable-section-id") ??
            "unknown",
          rect: element.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0);

      function candidateAxis(min, max, fractions) {
        return [...new Set(
          fractions.map((fraction) =>
            Math.round(min + (max - min) * fraction),
          ),
        )];
      }

      function intersects(left, top, right, bottom, rect) {
        const clearance = ${sectionCanvasDropCollisionClearancePx};
        return (
          left < rect.right + clearance &&
          right > rect.left - clearance &&
          top < rect.bottom + clearance &&
          bottom > rect.top - clearance
        );
      }

      const xs = candidateAxis(minimum.x, maximum.x, [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0]);
      const ys = candidateAxis(minimum.y, maximum.y, [0.25, 0.5, 0.75, 0.125, 0.875, 0, 1]);
      for (const x of xs) {
        for (const y of ys) {
          const left = sourceRect.left + x - sourcePoint.x;
          const top = sourceRect.top + y - sourcePoint.y;
          const right = left + sourceRect.width;
          const bottom = top + sourceRect.height;
          if (
            left < visiblePane.left + ${sectionCanvasDropMarginPx} ||
            right > visiblePane.right - ${sectionCanvasDropMarginPx} ||
            top < visiblePane.top + ${sectionCanvasDropMarginPx} ||
            bottom > visiblePane.bottom - ${sectionCanvasDropMarginPx} ||
            collisionRects.some(({ rect }) => intersects(left, top, right, bottom, rect)) ||
            document.elementFromPoint(x, y) !== pane
          ) {
            continue;
          }
          return { point: { x, y } };
        }
      }

      return {
        point: null,
        collisionIds: collisionRects.map(({ id }) => id),
        maximum,
        minimum,
        reason: "no collision-clear exposed canvas target",
        sourceRect: sourceRect.toJSON(),
        visiblePane,
      };
    })()`,
  );
  if (result?.point === null || result?.point === undefined) {
    throw new Error(
      `${description} has no source-aware canvas drop point: ${JSON.stringify(result)}.`,
    );
  }
  return result.point;
}

export async function retrySectionMoveUntilObserved({
  description,
  describeFailure,
  hasMoved,
  observationPollIntervalMs = sectionMoveObservationPollIntervalMs,
  observationTimeoutMs = sectionMoveObservationTimeoutMs,
  performGesture,
}) {
  for (let attempt = 0; attempt < sectionMoveAttemptLimit; attempt += 1) {
    const result = await performGesture(attempt);
    if (
      await canonicalMoveObservedWithinWindow(
        hasMoved,
        observationTimeoutMs,
        observationPollIntervalMs,
      )
    ) {
      return result;
    }
  }

  const failureDetails = describeFailure ? await describeFailure() : null;
  throw new Error(
    `${description} did not produce its expected canonical move after ${sectionMoveAttemptLimit} completed moving-free drag attempts.${failureDetails === null ? "" : `\n${failureDetails}`}`,
  );
}

export async function describeSectionMoveFailure({
  backendOrigin,
  client,
  fetchSnapshot = fetchCanonicalSnapshot,
  sourceListId,
  sourceSelector,
  target,
}) {
  const snapshot = await fetchSnapshot(backendOrigin);
  const sourceList = snapshot.lists.find((list) => list.id === sourceListId);
  const dom = await evaluate(
    client,
    `(() => {
      function elementIdentity(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        return {
          ariaLabel: element.getAttribute("aria-label"),
          id: element.id || null,
          sectionId: element.getAttribute("data-section-id"),
          sortableSectionId: element.getAttribute("data-sortable-section-id"),
          tagName: element.tagName,
        };
      }

      function geometry(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      }

      function visibleText(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = (element.textContent ?? "").trim();
        if (
          text === "" ||
          rect.width <= 1 ||
          rect.height <= 1 ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          return null;
        }
        return text;
      }

      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      const list = document.querySelector(${JSON.stringify(listSectionSelector(sourceListId))});
      const listWrapper = list?.parentElement;
      const topLevelSectionIds = Array.from(
        document.querySelectorAll("[data-section-id]"),
      )
        .filter(
          (section) =>
            section instanceof HTMLElement &&
            section.closest("[data-sortable-section-id]") === null,
        )
        .map((section) => section.getAttribute("data-section-id"));
      const nestedSortableSectionIds =
        listWrapper instanceof HTMLElement
          ? Array.from(
              listWrapper.querySelectorAll(${JSON.stringify(listNestedSortableSectionSelector)}),
            ).map((section) => section.getAttribute("data-sortable-section-id"))
          : [];
      const visibleMutationErrorOrAlertTexts = Array.from(
        document.querySelectorAll("#python-canvas-mutation-error, [role=alert]"),
      ).flatMap((element) => {
        const text = visibleText(element);
        return text === null
          ? []
          : [
              {
                id: element.id || null,
                role: element.getAttribute("role"),
                text,
              },
            ];
      });
      const target = ${JSON.stringify(target)};
      const targetHit =
        target === null
          ? null
          : elementIdentity(document.elementFromPoint(target.x, target.y));
      return {
        nestedSortableSectionIds,
        source:
          source instanceof HTMLElement
            ? {
                ancestor: elementIdentity(source.parentElement),
                geometry: geometry(source),
                identity: elementIdentity(source),
              }
            : null,
        targetHit,
        topLevelSectionIds,
        visibleMutationErrorOrAlertTexts,
      };
    })()`,
  );

  return [
    `canonical top-level section IDs: ${JSON.stringify(snapshot.topLevelSectionIds)}`,
    `canonical source list ${JSON.stringify(sourceListId)} child section IDs: ${JSON.stringify(sourceList?.childSectionIds ?? null)}`,
    `DOM top-level section IDs: ${JSON.stringify(dom.topLevelSectionIds)}`,
    `DOM nested sortable section IDs under source list: ${JSON.stringify(dom.nestedSortableSectionIds)}`,
    `visible Python Canvas mutation error or alert text: ${JSON.stringify(dom.visibleMutationErrorOrAlertTexts)}`,
    `source current ancestor/geometry: ${JSON.stringify(dom.source)}`,
    `attempted target point: ${JSON.stringify(target)}`,
    `target elementFromPoint identity: ${JSON.stringify(dom.targetHit)}`,
  ].join("\n");
}

async function canonicalMoveObservedWithinWindow(
  hasMoved,
  timeoutMs,
  pollIntervalMs,
) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await hasMoved()) {
      return true;
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return false;
    }
    await delay(Math.min(pollIntervalMs, remainingMs));
  }
}

export async function tryMovingFreeSectionDrag(client, configuration) {
  const modifiers = sectionDragModifiers();
  let mousePressed = false;
  let pointer = configuration.source;
  await holdMovingFreeSectionDragMode(client);
  try {
    await waitFor(
      client,
      `${configuration.description} mode activation`,
      sectionDragModeExpression(configuration.sourceSelector),
    );
    if (configuration.captureFocus) {
      configuration.onCaptureFocus(
        await captureFocusBeforeSectionMove(
          client,
          configuration.sourceSelector,
        ),
      );
    }
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      buttons: 0,
      modifiers,
      type: "mouseMoved",
    });
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
    });
    mousePressed = true;
    await (configuration.sleep ?? delay)(sectionDragPointerHoldMs);
    for (let step = 1; step <= sectionDragPointerMoveSteps; step += 1) {
      pointer = {
        x:
          configuration.source.x +
          ((configuration.target.x - configuration.source.x) * step) /
            sectionDragPointerMoveSteps,
        y:
          configuration.source.y +
          ((configuration.target.y - configuration.source.y) * step) /
            sectionDragPointerMoveSteps,
      };
      await client.send("Input.dispatchMouseEvent", {
        ...pointer,
        button: "left",
        buttons: 1,
        modifiers,
        type: "mouseMoved",
      });
    }
    await nextAnimationFrame(client);
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      button: "left",
      buttons: 0,
      modifiers,
      type: "mouseReleased",
    });
    mousePressed = false;
  } finally {
    if (mousePressed) {
      await client.send("Input.dispatchMouseEvent", {
        ...pointer,
        button: "left",
        buttons: 0,
        modifiers,
        type: "mouseReleased",
      });
    }
    await releaseMovingFreeSectionDragMode(client);
    await waitForSectionDragModeRelease(client, configuration.sourceSelector);
    await nextAnimationFrame(client);
  }
}

export async function sectionDragStartPoint(
  client,
  sourceSelector,
  description,
) {
  return visibleElementPoint(
    client,
    `${sourceSelector} header.section-title`,
    `${description} title header`,
  );
}

export async function holdMovingFreeSectionDragMode(client) {
  await client.send("Input.dispatchKeyEvent", {
    code: "AltLeft",
    key: "Alt",
    modifiers: 1,
    type: "keyDown",
  });
}

export async function releaseMovingFreeSectionDragMode(client) {
  await client.send("Input.dispatchKeyEvent", {
    code: "AltLeft",
    key: "Alt",
    modifiers: 0,
    type: "keyUp",
  });
}

function sectionDragModeExpression(sourceSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sourceSelector)});
    return section?.parentElement?.classList.contains("nodrag") === true;
  })()`;
}

export async function waitForSectionDragModeRelease(client, sourceSelector) {
  await waitFor(
    client,
    "the previous section drag mode to deactivate",
    sectionDragModeReleaseExpression(sourceSelector),
  );
}

function sectionDragModeReleaseExpression(sourceSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sourceSelector)});
    return section instanceof HTMLElement &&
      section.parentElement?.classList.contains("nodrag") !== true;
  })()`;
}

function sectionDragModifiers() {
  return 1;
}

async function dispatchFocusedKey(client, code, key) {
  await client.send("Input.dispatchKeyEvent", { code, key, type: "keyDown" });
  await client.send("Input.dispatchKeyEvent", { code, key, type: "keyUp" });
}
