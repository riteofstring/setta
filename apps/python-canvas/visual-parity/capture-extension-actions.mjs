import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { fetchCanonicalSnapshot } from "../browser-processes.mjs";
import { waitForSnapshot } from "../callable-commit.browser.mjs";
import {
  activateAndSelectAllContentEditableTextBox,
  activateContentEditableTextBox,
  clickElementCenter,
  contentEditableTextBoxSelector,
  evaluate,
  focusElement,
  holdItemSelectionChord,
  insertText,
  prepareElementDrag,
  pressEnter,
  releaseItemSelectionChord,
  rightClickPoint,
  visibleElementPoint,
  waitFor,
} from "../browser-page.mjs";
import {
  holdMovingFreeSectionDragMode,
  releaseMovingFreeSectionDragMode,
  sectionDragPointerHoldMs,
  sectionDragPointerMoveSteps,
  sectionDragStartPoint,
  visibleLeadingSortableSectionPoint,
  waitForSectionDragModeRelease,
} from "../param-dict-list.browser-drag.mjs";
import {
  assertPendingCreationHidden,
  callableSectionSelector,
  callableSortableSectionSelector,
  createPaneSection,
  installCreationResponseGate,
  itemRowSelector,
  listSectionSelector,
  parameterDictionarySectionSelector,
  releaseCreationResponseGate,
} from "../param-dict-list.browser-support.mjs";

const creationMenuSelector = '[aria-label="Create a workspace section"]';

export function createParityExtensionCaptureActions(context) {
  return Object.freeze({
    "callable-editing-diagnostic": (client, snapshot, backendOrigin) =>
      captureCallableEditingDiagnostic(
        context,
        client,
        snapshot,
        backendOrigin,
      ),
    "canonical-callable-replacement": (client, snapshot, backendOrigin) =>
      captureCanonicalCallableReplacement(
        context,
        client,
        snapshot,
        backendOrigin,
      ),
    "canonical-list-replacement": (client, snapshot, backendOrigin) =>
      captureCanonicalListReplacement(context, client, snapshot, backendOrigin),
    "canonical-param-dict-replacement": (client, snapshot, backendOrigin) =>
      captureCanonicalParamDictReplacement(
        context,
        client,
        snapshot,
        backendOrigin,
      ),
    "generated-python-protected-scrolled": (client) =>
      captureGeneratedPythonProtectedScrolled(context, client),
    "list-nested-drag-preview": (client, snapshot) =>
      captureListNestedDragPreview(context, client, snapshot),
    "list-nested-post-drop": (client, snapshot, backendOrigin) =>
      captureListNestedPostDrop(context, client, snapshot, backendOrigin),
    "parameter-dictionary-item-selected": (client, snapshot) =>
      captureParameterDictionaryItemSelected(context, client, snapshot),
    "pending-callable-placeholder": (client) =>
      capturePendingCreationPlaceholder(
        context,
        client,
        "Python callable",
        "python-canvas.callable-pending",
      ),
    "pending-list-placeholder": (client) =>
      capturePendingCreationPlaceholder(
        context,
        client,
        "List of Objects",
        "python-canvas.list-pending",
      ),
    "pending-param-dict-placeholder": (client) =>
      capturePendingCreationPlaceholder(
        context,
        client,
        "Param Dict",
        "python-canvas.parameter-dictionary-pending",
      ),
    "saved-views-shell-panes": (client, snapshot) =>
      captureSavedViewsShellPanes(context, client, snapshot),
  });
}

async function captureCallableEditingDiagnostic(
  context,
  client,
  snapshot,
  backendOrigin,
) {
  const callable = context.fixtureCallable(snapshot);
  const selector = callableSectionSelector(callable.id);
  const expressionSelector = `${selector} ${contentEditableTextBoxSelector("Callable expression")}`;
  const expression = "missing_parity_callable";
  await activateAndSelectAllContentEditableTextBox(
    client,
    expressionSelector,
    "the callable diagnostic expression",
  );
  await insertText(client, expression);
  await pressEnter(client);
  await waitForSnapshot(
    backendOrigin,
    "the callable diagnostic snapshot",
    (next) =>
      next.callables.some(
        (candidate) =>
          candidate.id === callable.id &&
          candidate.authoredExpression === expression,
      ) &&
      next.diagnostics.some(
        (diagnostic) => diagnostic.targetId === callable.id,
      ),
  );
  await activateContentEditableTextBox(
    client,
    expressionSelector,
    "the diagnosed callable expression editor",
  );
  await waitFor(
    client,
    "the editing callable diagnostic presentation",
    `(() => {
      const section = document.querySelector(${JSON.stringify(selector)});
      const field = section?.querySelector('[data-workspace-section-field="true"]');
      const editor = section?.querySelector(${JSON.stringify(contentEditableTextBoxSelector("Callable expression"))});
      return field?.getAttribute("data-diagnostic") === "true" &&
        editor?.getAttribute("contenteditable") === "true" &&
        editor?.getAttribute("aria-invalid") === "true";
    })()`,
  );
}

async function captureGeneratedPythonProtectedScrolled(context, client) {
  await context.captureGeneratedPythonFocused(client);
  await waitFor(
    client,
    "the protected Generated Python lines",
    `document.querySelectorAll(${JSON.stringify(`${context.generatedEditorSelector} [data-workspace-generated-line]`)}).length > 0`,
  );
  const scrolled = await evaluate(
    client,
    `(() => {
      const editor = document.querySelector(${JSON.stringify(context.generatedEditorSelector)});
      const scroller = editor?.querySelector(".cm-scroller");
      const protectedLine = editor?.querySelector("[data-workspace-generated-line]");
      if (!(scroller instanceof HTMLElement) || !(protectedLine instanceof HTMLElement)) {
        return false;
      }
      protectedLine.scrollIntoView({ block: "center", inline: "nearest" });
      scroller.scrollTop = Math.max(1, Math.min(scroller.scrollTop + 24, scroller.scrollHeight));
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      return scroller.scrollTop > 0;
    })()`,
  );
  assert.equal(
    scrolled,
    true,
    "The Generated Python editor does not expose a scrollable protected range.",
  );
}

async function captureParameterDictionaryItemSelected(
  context,
  client,
  snapshot,
) {
  const dictionary = context.fixtureDictionary(snapshot);
  const entry = dictionary.entries.find(
    (candidate) => candidate.kind === "leaf",
  );
  assert.ok(entry, "The parity fixture has no Parameter Dictionary leaf.");
  const sectionId = `python-canvas:parameter-dictionary:${dictionary.id}`;
  const workspaceItemId = `python-canvas:dictionary-entry-item:${encodeURIComponent(entry.id)}`;
  const rowSelector = itemRowSelector(workspaceItemId);
  await context.activateSection(
    client,
    sectionId,
    "the Parameter Dictionary item selection section",
  );
  await holdItemSelectionChord(client);
  try {
    await waitFor(
      client,
      "the Parameter Dictionary item selection mode",
      `document.querySelector(${JSON.stringify(rowSelector)})?.getAttribute("role") === "group"`,
    );
    const selected = await evaluate(
      client,
      `(() => {
        const row = document.querySelector(${JSON.stringify(rowSelector)});
        if (!(row instanceof HTMLElement)) return false;
        row.click();
        return true;
      })()`,
    );
    assert.equal(
      selected,
      true,
      "The Parameter Dictionary item row is unavailable.",
    );
    await waitFor(
      client,
      "the selected Parameter Dictionary item",
      `document.querySelector(${JSON.stringify(rowSelector)})?.getAttribute("aria-label")?.includes(", selected") === true`,
    );
  } finally {
    await releaseItemSelectionChord(client);
  }
  await waitFor(
    client,
    "the released Parameter Dictionary item selection mode",
    `document.querySelector(${JSON.stringify(rowSelector)})?.getAttribute("role") !== "group"`,
  );
}

function nextSectionName(snapshot, collection, baseName) {
  const names = new Set(snapshot[collection].map((section) => section.name));
  for (let ordinal = 1; ; ordinal += 1) {
    const candidate =
      ordinal === 1 ? baseName : `${baseName} ${String(ordinal)}`;
    if (!names.has(candidate)) {
      return candidate;
    }
  }
}

function creationMenuItemExpression(label) {
  return `(() => {
    const menu = document.querySelector(${JSON.stringify(creationMenuSelector)});
    const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    return item instanceof HTMLElement && item.getAttribute("aria-disabled") !== "true";
  })()`;
}

async function openCreationMenu(context, client, label) {
  await rightClickPoint(
    client,
    await visibleElementPoint(
      client,
      context.workspaceCanvasPaneSelector,
      "the blank workspace pane",
    ),
  );
  await waitFor(
    client,
    `the ${label} creation menu item`,
    creationMenuItemExpression(label),
  );
}

async function chooseCreationMenuItem(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const menu = document.querySelector(${JSON.stringify(creationMenuSelector)});
      const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      if (!(item instanceof HTMLElement) || item.getAttribute("aria-disabled") === "true") {
        return false;
      }
      item.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `The ${label} creation item is missing.`);
}

async function capturePendingCreationPlaceholder(
  context,
  client,
  label,
  pendingKind,
) {
  await openCreationMenu(context, client, label);
  await installCreationResponseGate(client);
  try {
    await chooseCreationMenuItem(client, label);
    await assertPendingCreationHidden(client, pendingKind, label);
  } catch (error) {
    await releaseCreationResponseGate(client);
    throw error;
  }
}

async function captureCanonicalCallableReplacement(
  context,
  client,
  snapshot,
  backendOrigin,
) {
  const created = await createPaneSection(client, backendOrigin, {
    collection: "callables",
    defaultName: nextSectionName(snapshot, "callables", "New callable"),
    label: "Python callable",
    pendingKind: "python-canvas.callable-pending",
    sectionSelector: callableSectionSelector,
  });
  await waitFor(
    client,
    "the canonical Python callable replacement",
    `document.querySelector(${JSON.stringify(callableSectionSelector(created.id))})?.getAttribute("data-section-type") === "python-canvas.callable"`,
  );
}

async function captureCanonicalListReplacement(
  context,
  client,
  snapshot,
  backendOrigin,
) {
  const created = await createPaneSection(client, backendOrigin, {
    collection: "lists",
    defaultName: nextSectionName(snapshot, "lists", "New List of Objects"),
    label: "List of Objects",
    pendingKind: "python-canvas.list-pending",
    sectionSelector: listSectionSelector,
  });
  await waitFor(
    client,
    "the canonical List of Objects replacement",
    `document.querySelector(${JSON.stringify(listSectionSelector(created.id))})?.getAttribute("data-section-type") === "python-canvas.list"`,
  );
}

async function captureCanonicalParamDictReplacement(
  context,
  client,
  snapshot,
  backendOrigin,
) {
  const defaultName = nextSectionName(
    snapshot,
    "parameterDictionaries",
    "New Param Dict",
  );
  const created = await createPaneSection(client, backendOrigin, {
    collection: "parameterDictionaries",
    defaultName,
    label: "Param Dict",
    pendingKind: "python-canvas.parameter-dictionary-pending",
    sectionSelector: parameterDictionarySectionSelector,
  });
  await waitFor(
    client,
    "the canonical Parameter Dictionary replacement",
    `document.querySelector(${JSON.stringify(parameterDictionarySectionSelector(created.id))})?.getAttribute("data-section-type") === "python-canvas.parameter-dictionary"`,
  );
}

async function captureListNestedDragPreview(context, client, snapshot) {
  const dragContext = nestedListDragTargets(context, snapshot);
  for (let index = 0; index < 3; index += 1) {
    await context.zoomIn(client);
  }
  await focusElement(
    client,
    dragContext.sourceSelector,
    "the nested list drag source",
  );
  await prepareElementDrag(
    client,
    dragContext.sourceSelector,
    dragContext.targetSortableSelector,
    "the nested list drag preview",
  );
  const source = await sectionDragStartPoint(
    client,
    dragContext.sourceSelector,
    "the nested list drag source",
  );
  const target = await visibleLeadingSortableSectionPoint(
    client,
    dragContext.targetSortableSelector,
    "the nested list drag preview target",
    0.25,
  );
  await holdMovingFreeSectionDragMode(client);
  await waitFor(
    client,
    "the nested list drag mode",
    `document.querySelector(${JSON.stringify(dragContext.sourceSelector)})?.parentElement?.classList.contains("nodrag") === true`,
  );
  await client.send("Input.dispatchMouseEvent", {
    ...source,
    buttons: 0,
    modifiers: 1,
    type: "mouseMoved",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...source,
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers: 1,
    type: "mousePressed",
  });
  await delay(sectionDragPointerHoldMs);
  for (let step = 1; step <= sectionDragPointerMoveSteps; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      modifiers: 1,
      type: "mouseMoved",
      x:
        source.x + ((target.x - source.x) * step) / sectionDragPointerMoveSteps,
      y:
        source.y + ((target.y - source.y) * step) / sectionDragPointerMoveSteps,
    });
  }
  await waitFor(
    client,
    "the nested list drag preview",
    "document.querySelector('[data-dnd-placeholder=\"true\"]') instanceof HTMLElement",
  );
}

async function captureListNestedPostDrop(
  context,
  client,
  snapshot,
  backendOrigin,
) {
  const dragContext = nestedListDragTargets(context, snapshot);
  const hasMoved = async () => {
    const next = await fetchCanonicalSnapshot(backendOrigin);
    const list = next.lists.find(
      (candidate) => candidate.id === dragContext.listId,
    );
    const sourceIndex =
      list?.childSectionIds.indexOf(dragContext.sourceId) ?? -1;
    const targetIndex =
      list?.childSectionIds.indexOf(dragContext.targetId) ?? -1;
    return sourceIndex >= 0 && targetIndex >= 0 && sourceIndex < targetIndex;
  };
  await dropNestedListChild(client, dragContext, hasMoved);
  await waitForSnapshot(
    backendOrigin,
    "the nested List of Objects post-drop order",
    hasMoved,
  );
}

function nestedListDragTargets(context, snapshot) {
  const dragContext = context.nestedListDragContext(snapshot);
  return {
    ...dragContext,
    sourceSelector: callableSectionSelector(dragContext.sourceId),
    targetSortableSelector: callableSortableSectionSelector(
      dragContext.targetId,
    ),
  };
}

async function dropNestedListChild(client, dragContext, hasMoved) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await focusElement(
      client,
      dragContext.sourceSelector,
      "the nested list post-drop source",
    );
    await prepareElementDrag(
      client,
      dragContext.sourceSelector,
      dragContext.targetSortableSelector,
      "the nested list post-drop",
    );
    const source = await sectionDragStartPoint(
      client,
      dragContext.sourceSelector,
      "the nested list post-drop source",
    );
    const target = await visibleLeadingSortableSectionPoint(
      client,
      dragContext.targetSortableSelector,
      "the nested list post-drop target",
      0.25,
    );
    await moveNestedListChild(
      client,
      dragContext.sourceSelector,
      source,
      target,
    );
    await delay(500);
    if (await hasMoved()) {
      return;
    }
  }
  throw new Error(
    "The nested List of Objects child did not move after three drags.",
  );
}

async function moveNestedListChild(client, sourceSelector, source, target) {
  let mousePressed = false;
  let pointer = source;
  await holdMovingFreeSectionDragMode(client);
  try {
    await waitFor(
      client,
      "the nested list post-drop drag mode",
      `document.querySelector(${JSON.stringify(sourceSelector)})?.parentElement?.classList.contains("nodrag") === true`,
    );
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      buttons: 0,
      modifiers: 1,
      type: "mouseMoved",
    });
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers: 1,
      type: "mousePressed",
    });
    mousePressed = true;
    await delay(sectionDragPointerHoldMs);
    for (let step = 1; step <= sectionDragPointerMoveSteps; step += 1) {
      pointer = {
        x:
          source.x +
          ((target.x - source.x) * step) / sectionDragPointerMoveSteps,
        y:
          source.y +
          ((target.y - source.y) * step) / sectionDragPointerMoveSteps,
      };
      await client.send("Input.dispatchMouseEvent", {
        ...pointer,
        button: "left",
        buttons: 1,
        modifiers: 1,
        type: "mouseMoved",
      });
    }
    await client.send("Input.dispatchMouseEvent", {
      ...pointer,
      button: "left",
      buttons: 0,
      modifiers: 1,
      type: "mouseReleased",
    });
    mousePressed = false;
  } finally {
    if (mousePressed) {
      await client.send("Input.dispatchMouseEvent", {
        ...pointer,
        button: "left",
        buttons: 0,
        modifiers: 1,
        type: "mouseReleased",
      });
    }
    await releaseMovingFreeSectionDragMode(client);
    await waitForSectionDragModeRelease(client, sourceSelector);
  }
}

async function captureSavedViewsShellPanes(context, client, snapshot) {
  await clickElementCenter(
    client,
    context.savedViewsTabSelector,
    "the Saved Views workspace rail tab",
  );
  await waitFor(
    client,
    "the Saved Views workspace pane",
    `(() => {
      const pane = document.querySelector(${JSON.stringify(context.savedViewsPaneSelector)});
      const leading = document.querySelector('[data-pane="leading"]');
      return pane instanceof HTMLElement && leading?.getAttribute("data-visible") === "true" &&
        pane.querySelector('[aria-label="Create view"]') instanceof HTMLButtonElement;
    })()`,
  );
  const viewCount = await evaluate(
    client,
    `document.querySelectorAll(${JSON.stringify(`${context.savedViewsPaneSelector} [data-workspace-saved-view-id]`)}).length`,
  );
  assert.equal(typeof viewCount, "number", "Saved Views did not expose rows.");
  await clickElementCenter(
    client,
    `${context.savedViewsPaneSelector} [aria-label="Create view"]`,
    "the Saved Views Create view control",
  );
  await waitFor(
    client,
    "the created Saved View",
    `document.querySelectorAll(${JSON.stringify(`${context.savedViewsPaneSelector} [data-workspace-saved-view-id]`)}).length > ${String(viewCount)}`,
  );
  await context.activateSection(
    client,
    context.fixtureSectionIds(snapshot).callable,
    "the Saved Views shell callable section",
  );
  await clickElementCenter(
    client,
    context.sectionTabSelector,
    "the Section workspace rail tab",
  );
  await waitFor(
    client,
    "the Saved Views and Section workspace panes",
    `(() => {
      const leading = document.querySelector('[data-pane="leading"]');
      const trailing = document.querySelector('[data-pane="trailing"]');
      const savedViews = document.querySelector(${JSON.stringify(context.savedViewsPaneSelector)});
      const inspector = document.querySelector('[data-inspector-branch="section"]');
      const leadingRect = leading?.getBoundingClientRect();
      const trailingRect = trailing?.getBoundingClientRect();
      const savedViewsRect = savedViews?.getBoundingClientRect();
      return leading?.getAttribute("data-visible") === "true" &&
        trailing?.getAttribute("data-visible") === "true" &&
        savedViews instanceof HTMLElement && inspector instanceof HTMLElement &&
        leadingRect !== undefined && leadingRect.left >= -1 &&
        trailingRect !== undefined && trailingRect.right <= window.innerWidth + 1 &&
        savedViewsRect !== undefined && savedViewsRect.left >= -1;
    })()`,
  );
}
