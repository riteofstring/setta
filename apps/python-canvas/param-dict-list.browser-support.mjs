import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import { waitForSnapshot } from "./callable-commit.browser.mjs";
import {
  dragBetweenPoints,
  evaluate,
  labeledSelector,
  rightClickPoint,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

const creationGateKey = "__pythonCanvasCreationResponseGate";

export async function createPaneSection(client, backendOrigin, configuration) {
  const existingIds = new Set(
    snapshotCollection(
      await fetchCanonicalSnapshot(backendOrigin),
      configuration.collection,
    ).map((section) => section.id),
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
    `the ${configuration.label} creation menu item`,
    creationMenuItemExpression(configuration.label),
  );
  await installCreationResponseGate(client);
  const clicked = await evaluate(
    client,
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Create a workspace section"))});
      const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(configuration.label)});
      if (!(item instanceof HTMLElement) || item.getAttribute("aria-disabled") === "true") {
        return false;
      }
      item.click();
      return true;
    })()`,
  );
  try {
    assert.equal(
      clicked,
      true,
      `The ${configuration.label} creation item is missing.`,
    );
    await assertPendingCreationHidden(
      client,
      configuration.pendingKind,
      configuration.label,
    );
  } finally {
    await releaseCreationResponseGate(client);
  }
  const snapshot = await waitForSnapshot(
    backendOrigin,
    `the canonical ${configuration.label} created from the pane menu`,
    (next) =>
      snapshotCollection(next, configuration.collection).some(
        (section) =>
          !existingIds.has(section.id) &&
          section.name === configuration.defaultName,
      ),
  );
  const created = snapshotCollection(snapshot, configuration.collection).find(
    (section) =>
      !existingIds.has(section.id) &&
      section.name === configuration.defaultName,
  );
  assert.ok(
    created,
    `The pane menu did not create one ${configuration.label}.`,
  );
  await waitFor(
    client,
    `the ${configuration.label} section`,
    `document.querySelector(${JSON.stringify(configuration.sectionSelector(created.id))}) instanceof HTMLElement`,
  );
  return created;
}

export async function installCreationResponseGate(client) {
  const installed = await evaluate(
    client,
    `(() => {
      if (globalThis[${JSON.stringify(creationGateKey)}] !== undefined) {
        return false;
      }
      const originalFetch = window.fetch;
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const gate = { intercepted: false, release };
      globalThis[${JSON.stringify(creationGateKey)}] = gate;
      window.fetch = async (...args) => {
        const request = args[0];
        const init = args[1];
        const method = String(
          init?.method ?? (request instanceof Request ? request.method : "GET"),
        ).toUpperCase();
        if (!gate.intercepted && method !== "GET" && method !== "HEAD") {
          gate.intercepted = true;
          await held;
          window.fetch = originalFetch;
        }
        return originalFetch(...args);
      };
      return true;
    })()`,
  );
  assert.equal(
    installed,
    true,
    "The creation response gate was already installed.",
  );
}

export async function assertPendingCreationHidden(client, pendingKind, label) {
  await waitFor(
    client,
    `the held ${label} creation request`,
    `globalThis[${JSON.stringify(creationGateKey)}]?.intercepted === true`,
  );
  await waitFor(
    client,
    `the hidden ${label} identity placeholder`,
    `document.querySelector(${JSON.stringify(`[data-section-type="${pendingKind}"]`)}) instanceof HTMLElement`,
  );
  const presentation = await evaluate(
    client,
    `(() => {
      const pending = document.querySelector(${JSON.stringify(`[data-section-type="${pendingKind}"]`)});
      if (!(pending instanceof HTMLElement)) {
        return null;
      }
      const style = getComputedStyle(pending);
      const rect = pending.getBoundingClientRect();
      return {
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0,
      };
    })()`,
  );
  assert.deepEqual(
    presentation,
    { visible: false },
    `Creating ${label} painted the optimistic lock state that main never shows.`,
  );
}

export async function releaseCreationResponseGate(client) {
  const released = await evaluate(
    client,
    `(() => {
      const gate = globalThis[${JSON.stringify(creationGateKey)}];
      if (gate === undefined) {
        return false;
      }
      gate.release();
      delete globalThis[${JSON.stringify(creationGateKey)}];
      return true;
    })()`,
  );
  assert.equal(released, true, "The creation response gate was unavailable.");
}

function creationMenuItemExpression(label) {
  return `(() => {
    const menu = document.querySelector(${JSON.stringify(labeledSelector("Create a workspace section"))});
    const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    return item instanceof HTMLElement && item.getAttribute("aria-disabled") !== "true";
  })()`;
}

export async function sectionSize(client, selector) {
  const size = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(selector)});
      if (!(section instanceof HTMLElement)) {
        return null;
      }
      const rect = section.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    })()`,
  );
  assert.ok(size, "The section has no measurable size.");
  return size;
}

export async function assertSectionSize(client, selector, expected) {
  const actual = await sectionSize(client, selector);
  assert.ok(
    Math.abs(actual.width - expected.width) < 0.5 &&
      Math.abs(actual.height - expected.height) < 0.5,
    "Moving the Param Dict changed its section dimensions.",
  );
}

export async function assertListRootFixedHeight(
  client,
  listId,
  description = "The List of Objects root",
) {
  const actual = await evaluate(
    client,
    `(() => {
      const shell = document.querySelector(${JSON.stringify(listSectionSelector(listId))});
      const resizable = shell?.querySelector('[id$="-CustomResizable"]');
      if (!(resizable instanceof HTMLElement)) return null;
      const rect = resizable.getBoundingClientRect();
      const style = getComputedStyle(resizable);
      return {
        height: Number.parseFloat(style.height),
        renderedHeight: rect.height,
        renderedWidth: rect.width,
        width: Number.parseFloat(style.width),
      };
    })()`,
  );
  assert.ok(actual, `${description} resizable surface is not mounted.`);
  assert.ok(
    Math.abs(actual.height - 50) < 0.5,
    `${description} height was ${String(actual.height)}px instead of the fixed 50px.`,
  );
  return actual;
}

// A fixed-height List intentionally exposes only its right resize handle. Drive
// that real handle diagonally so the browser attempts a large vertical resize
// while the horizontal component still proves that width remains editable.
export async function resizeListRootHorizontallyWhileAttemptingVerticalResize(
  client,
  listId,
) {
  const selector = listSectionSelector(listId);
  const before = await assertListRootFixedHeight(
    client,
    listId,
    "The List of Objects root before its resize attempt",
  );
  const geometry = await evaluate(
    client,
    `(() => {
      const shell = document.querySelector(${JSON.stringify(selector)});
      const resizable = shell?.querySelector('[id$="-CustomResizable"]');
      const right = resizable?.querySelector(".section-resize-handle-right");
      const bottom = resizable?.querySelector(".section-resize-handle-bottom");
      const bottomRight = resizable?.querySelector(".section-resize-handle-bottom-right");
      if (!(resizable instanceof HTMLElement) || !(right instanceof HTMLElement)) {
        return null;
      }
      resizable.scrollIntoView({ block: "center", inline: "center" });
      const rect = resizable.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      if (rightRect.width <= 0 || rightRect.height <= 0) {
        return null;
      }
      const start = {
        x: Math.max(12, Math.min(window.innerWidth - 12, rightRect.left + rightRect.width / 2)),
        y: Math.max(12, Math.min(window.innerHeight - 12, rightRect.top + rightRect.height / 2)),
      };
      const end = {
        x: Math.min(window.innerWidth - 24, start.x + 128),
        y: Math.min(window.innerHeight - 24, start.y + 256),
      };
      return {
        bottomPresent: bottom instanceof HTMLElement,
        bottomRightPresent: bottomRight instanceof HTMLElement,
        end,
        section: { height: rect.height, width: rect.width },
        start,
      };
    })()`,
  );
  assert.ok(
    geometry,
    "The List of Objects right resize handle is not mounted.",
  );
  assert.equal(
    geometry.bottomPresent,
    false,
    "The fixed-height List of Objects still exposes a bottom resize handle.",
  );
  assert.equal(
    geometry.bottomRightPresent,
    false,
    "The fixed-height List of Objects still exposes a bottom-right resize handle.",
  );
  assert.ok(
    geometry.end.x - geometry.start.x >= 64,
    "The List of Objects horizontal resize attempt was too small to prove width remains editable.",
  );
  assert.ok(
    geometry.end.y - geometry.start.y >= 160,
    "The List of Objects vertical resize attempt was not large enough.",
  );

  await dragBetweenPoints(client, geometry.start, geometry.end);
  await waitFor(
    client,
    "the List of Objects horizontal resize",
    `(() => {
      const shell = document.querySelector(${JSON.stringify(selector)});
      const resizable = shell?.querySelector('[id$="-CustomResizable"]');
      return resizable instanceof HTMLElement &&
        Number.parseFloat(getComputedStyle(resizable).width) > ${String(before.width + 32)};
    })()`,
  );
  const after = await assertListRootFixedHeight(
    client,
    listId,
    "The List of Objects root after its vertical resize attempt",
  );
  assert.ok(
    after.width > before.width + 32,
    "The fixed-height List of Objects did not remain horizontally resizable.",
  );
  assert.ok(
    Math.abs(after.renderedHeight - before.renderedHeight) < 0.5,
    "The List of Objects outer height changed during its vertical resize attempt.",
  );
  return { after, before };
}

export async function sectionFieldSize(client, selector) {
  const size = await evaluate(
    client,
    `(() => {
      const field = document.querySelector(${JSON.stringify(`${selector} [data-workspace-section-field="true"]`)});
      if (!(field instanceof HTMLElement)) {
        return null;
      }
      const rect = field.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    })()`,
  );
  assert.ok(size, "The callable field has no measurable size.");
  return size;
}

export async function assertSectionFieldSize(client, selector, expected) {
  const actual = await sectionFieldSize(client, selector);
  assert.ok(
    Math.abs(actual.width - expected.width) < 0.5 &&
      Math.abs(actual.height - expected.height) < 0.5,
    "A list-child callable editor changed dimensions during section movement.",
  );
}

export function focusNotStolenAfterSectionMoveExpression(
  captureKey,
  movedSectionSelector,
) {
  return `(() => {
    const previouslyFocused = globalThis[${JSON.stringify(captureKey)}];
    const focused = document.activeElement;
    const movedSection = document.querySelector(${JSON.stringify(movedSectionSelector)});
    const retainedSameElement =
      previouslyFocused instanceof HTMLElement &&
      previouslyFocused.isConnected &&
      focused === previouslyFocused;
    const focusedWithinMovedSection =
      movedSection instanceof HTMLElement &&
      focused instanceof Node &&
      movedSection.contains(focused);
    const sourceRemounted =
      !(previouslyFocused instanceof HTMLElement) || !previouslyFocused.isConnected;
    const documentOrCanvasFallback =
      sourceRemounted &&
      (focused === document.body ||
        focused === document.documentElement ||
        (focused instanceof HTMLElement &&
          (focused.matches('[role="region"][aria-label="Workspace canvas"]') ||
            focused.matches('.react-flow__pane[aria-label="Workspace canvas background"]'))));
    return retainedSameElement ||
      focusedWithinMovedSection ||
      documentOrCanvasFallback;
  })()`;
}

function captureFocusBeforeSectionMoveExpression(captureKey, sourceSelector) {
  return `(() => {
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      const focused = document.activeElement;
      if (!(source instanceof HTMLElement) ||
        !(focused instanceof HTMLElement) ||
        !source.contains(focused)) {
        return false;
      }
      globalThis[${JSON.stringify(captureKey)}] = focused;
      return true;
    })()`;
}

export async function captureFocusBeforeSectionMove(client, sourceSelector) {
  const captureKey = `__pythonCanvasSectionFocus${crypto.randomUUID()}`;
  const captured = await evaluate(
    client,
    captureFocusBeforeSectionMoveExpression(captureKey, sourceSelector),
  );
  assert.equal(
    captured,
    true,
    "The section drag did not begin with focus in its source section.",
  );
  return { captureKey, movedSectionSelector: sourceSelector };
}

export async function assertFocusNotStolenAfterSectionMove(client, capture) {
  try {
    await waitFor(
      client,
      "the section move preserving its focus context",
      focusNotStolenAfterSectionMoveExpression(
        capture.captureKey,
        capture.movedSectionSelector,
      ),
    );
  } finally {
    await evaluate(
      client,
      `delete globalThis[${JSON.stringify(capture.captureKey)}]`,
    );
  }
}

export async function dictionaryRowHeight(client, workspaceItemId) {
  const height = await evaluate(
    client,
    `document.querySelector(${JSON.stringify(itemRowSelector(workspaceItemId))})?.getBoundingClientRect().height ?? null`,
  );
  assert.equal(typeof height, "number", "The dictionary row has no height.");
  return height;
}

export async function assertDictionaryDiagnosticPresentation(
  client,
  workspaceItemId,
  message,
  height,
) {
  await waitFor(
    client,
    "the radius dictionary diagnostic presentation",
    `(() => {
      const row = document.querySelector(${JSON.stringify(itemRowSelector(workspaceItemId))});
      const marker = row?.querySelector('[data-setta-workspace-item-diagnostic-marker="true"]');
      const description = row?.querySelector('[data-setta-workspace-item-quick-info-description="true"]');
      const editor = row?.querySelector('[role="textbox"]');
      return marker?.getAttribute("data-setta-workspace-item-diagnostic-severity") === "error" &&
        description?.textContent?.includes(${JSON.stringify(message)}) === true &&
        editor?.getAttribute("aria-disabled") !== "true";
    })()`,
  );
  const presentation = await evaluate(
    client,
    `(() => {
      const row = document.querySelector(${JSON.stringify(itemRowSelector(workspaceItemId))});
      const visibleAlert = Array.from(document.querySelectorAll('[role="alert"]')).some((alert) => {
        const rect = alert.getBoundingClientRect();
        return (alert.textContent ?? "").trim() !== "" && rect.width > 1 && rect.height > 1;
      });
      return {
        busy: row?.closest("[data-section-id]")?.getAttribute("aria-busy") === "true",
        height: row?.getBoundingClientRect().height ?? null,
        spinner: row?.querySelector('[role="progressbar"], .animate-spin') !== null,
        visibleAlert,
      };
    })()`,
  );
  assert.equal(
    presentation.busy,
    false,
    "The diagnostic locked the dictionary section.",
  );
  assert.equal(
    presentation.spinner,
    false,
    "The diagnostic replaced the row with a spinner.",
  );
  assert.equal(
    presentation.visibleAlert,
    false,
    "The diagnostic rendered a giant error panel.",
  );
  assert.ok(
    typeof presentation.height === "number" &&
      Math.abs(presentation.height - height) < 0.5,
    "The dictionary diagnostic changed the row height.",
  );
}

export async function assertDictionaryDiagnosticCleared(
  client,
  workspaceItemId,
  height,
) {
  await waitFor(
    client,
    "the corrected radius dictionary presentation",
    `(() => {
      const row = document.querySelector(${JSON.stringify(itemRowSelector(workspaceItemId))});
      return row instanceof HTMLElement &&
        row.querySelector('[data-setta-workspace-item-diagnostic-marker="true"]') === null &&
        row.querySelector('[role="textbox"]')?.getAttribute("aria-disabled") !== "true";
    })()`,
  );
  assert.ok(
    Math.abs((await dictionaryRowHeight(client, workspaceItemId)) - height) <
      0.5,
    "Clearing the dictionary diagnostic changed the row height.",
  );
}

export function assertDictionaryTree(
  snapshot,
  dictionaryId,
  radiusId,
  optionsId,
  scaleId,
) {
  const dictionary = requireDictionary(snapshot, dictionaryId);
  assert.deepEqual(
    dictionary.entries.map((entry) => entry.id),
    [radiusId, optionsId],
    "The dictionary entries lost their authored order.",
  );
  const options = dictionary.entries[1];
  assert.equal(
    options?.kind,
    "parent",
    "Dropping scale did not promote options to a parent.",
  );
  assert.deepEqual(
    options?.kind === "parent" ? options.children.map((entry) => entry.id) : [],
    [scaleId],
    "The nested scale entry is not ordered under options.",
  );
}

export function assertGeneratedDictionary(snapshot, radiusExpression) {
  const body = snapshot.generatedCode.body;
  const radius = `state.New_Param_Dict__radius = ${radiusExpression}`;
  const scale = "state.New_Param_Dict__options__scale = 2";
  const options =
    'state.New_Param_Dict__options = {"scale": state.New_Param_Dict__options__scale}';
  const dictionary =
    'state.New_Param_Dict = {"radius": state.New_Param_Dict__radius, "options": state.New_Param_Dict__options}';
  assert.ok(
    body.includes(radius),
    "Generated Python is missing the dictionary radius path.",
  );
  if (body.includes(scale)) {
    assert.ok(
      body.indexOf(radius) < body.indexOf(scale) &&
        body.indexOf(scale) < body.indexOf(options) &&
        body.indexOf(options) < body.indexOf(dictionary),
      "Generated Python did not preserve the dictionary dependency order.",
    );
  }
}

export function assertNoGeneratedPythonDuplicate(snapshot, diagnostic) {
  assert.equal(
    snapshot.diagnostics.some(
      (candidate) =>
        candidate.targetId === null && candidate.message === diagnostic.message,
    ),
    false,
    "The dictionary row diagnostic was duplicated in Generated Python.",
  );
}

export function assertGeneratedMultilineCollection(
  snapshot,
  { closing, description, itemCount, prefix },
) {
  const body = snapshot.generatedCode.body;
  const start = body.indexOf(`${prefix}\n`);
  assert.notEqual(start, -1, `${description} did not start on a new line.`);
  const itemStart = start + prefix.length + 1;
  const end = body.indexOf(`\n        ${closing}`, itemStart);
  assert.notEqual(end, -1, `${description} closing delimiter is not aligned.`);
  const lines = body.slice(itemStart, end).split("\n");
  assert.equal(
    lines.length,
    itemCount,
    `${description} did not render ${String(itemCount)} items.`,
  );
  assert.ok(
    lines.every(
      (line) =>
        line.startsWith("            ") &&
        line.endsWith(",") &&
        line.trim().length > 1,
    ),
    `${description} items are not indented with trailing commas.`,
  );
  return lines.map((line) => line.trim().slice(0, -1));
}

export function assertGeneratedListOrder(
  snapshot,
  count,
  path = "New_List_of_Objects",
) {
  const values = Array.from(
    { length: count },
    (_, index) => `state.${path}__${String(index)}`,
  );
  const collection = `[${values.join(", ")}]`;
  const multiline =
    `state.${path} = [\n` +
    values.map((value) => `            ${value},`).join("\n") +
    "\n        ]";
  const inline = `state.${path} = ${collection}`;
  const expected = count >= 4 || collection.length > 88 ? multiline : inline;
  assert.ok(
    snapshot.generatedCode.body.includes(expected),
    "Generated Python does not use the required collection layout, index paths, and order.",
  );
}

export function assertRevisionIncremented(before, after) {
  assert.equal(
    after.project.revision,
    before.project.revision + 1,
    "A section drag did not persist exactly one forest mutation.",
  );
}

export function requireDiagnostic(snapshot, targetId) {
  const diagnostic = snapshot.diagnostics.find(
    (candidate) =>
      candidate.targetId === targetId && candidate.severity === "error",
  );
  assert.ok(diagnostic, `Basedpyright did not report an error on ${targetId}.`);
  return diagnostic;
}

export function findDictionaryEntry(snapshot, dictionaryId, entryId) {
  const dictionary = snapshot.parameterDictionaries.find(
    (candidate) => candidate.id === dictionaryId,
  );
  return findEntry(dictionary?.entries ?? [], entryId);
}

function findEntry(entries, entryId) {
  for (const entry of entries) {
    if (entry.id === entryId) {
      return entry;
    }
    if (entry.kind === "parent") {
      const nested = findEntry(entry.children, entryId);
      if (nested !== null) {
        return nested;
      }
    }
  }
  return null;
}

export function requireDictionary(snapshot, dictionaryId) {
  const dictionary = snapshot.parameterDictionaries.find(
    (candidate) => candidate.id === dictionaryId,
  );
  assert.ok(dictionary, `The ${dictionaryId} Param Dict is missing.`);
  return dictionary;
}

export function requireList(snapshot, listId) {
  const list = snapshot.lists.find((candidate) => candidate.id === listId);
  assert.ok(list, `The ${listId} List of Objects is missing.`);
  return list;
}

export function requireCallable(snapshot, callableId) {
  const callable = snapshot.callables.find(
    (candidate) => candidate.id === callableId,
  );
  assert.ok(callable, `The ${callableId} callable is missing.`);
  return callable;
}

export function sameListChildren(snapshot, listId, expected) {
  const list = snapshot.lists.find((candidate) => candidate.id === listId);
  return (
    list !== undefined &&
    list.childSectionIds.length === expected.length &&
    list.childSectionIds.every((id, index) => id === expected[index])
  );
}

export function snapshotCollection(snapshot, name) {
  const value = snapshot[name];
  assert.ok(
    Array.isArray(value),
    `Snapshot collection ${name} is not an array.`,
  );
  return value;
}

export function callableWorkspaceSectionId(callableId) {
  return `python-canvas:callable:${callableId}`;
}

export function callableSectionSelector(callableId) {
  return sectionSelector(callableWorkspaceSectionId(callableId));
}

export function parameterDictionaryWorkspaceSectionId(dictionaryId) {
  return `python-canvas:parameter-dictionary:${dictionaryId}`;
}

export function parameterDictionarySectionSelector(dictionaryId) {
  return sectionSelector(parameterDictionaryWorkspaceSectionId(dictionaryId));
}

export function listSectionSelector(listId) {
  return sectionSelector(`python-canvas:list:${listId}`);
}

function sectionSelector(workspaceSectionId) {
  return `[data-section-id=${JSON.stringify(workspaceSectionId)}]`;
}

export function itemRowSelector(workspaceItemId) {
  return `[data-workspace-item-id=${JSON.stringify(workspaceItemId)}]`;
}

export function listChildCountSelector(listId) {
  return `${listSectionSelector(listId)} input[name="children"]`;
}
