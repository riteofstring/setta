import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import { waitForSnapshot } from "./callable-commit.browser.mjs";
import {
  evaluate,
  labeledSelector,
  rightClickPoint,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

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
  assert.equal(
    clicked,
    true,
    `The ${configuration.label} creation item is missing.`,
  );
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

export async function assertFocusedSection(client, selector) {
  await waitFor(
    client,
    "the moved section retaining focus",
    `(() => {
      const section = document.querySelector(${JSON.stringify(selector)});
      return section instanceof HTMLElement && section.contains(document.activeElement);
    })()`,
  );
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

export function assertGeneratedListOrder(snapshot, count) {
  const values = Array.from(
    { length: count },
    (_, index) => `state.New_List_of_Objects__${String(index)}`,
  );
  assert.ok(
    snapshot.generatedCode.body.includes(
      `state.New_List_of_Objects = [${values.join(", ")}]`,
    ),
    "Generated Python does not use the canonical list index paths and order.",
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

export function callableSectionSelector(callableId) {
  return sectionSelector(`python-canvas:callable:${callableId}`);
}

export function parameterDictionarySectionSelector(dictionaryId) {
  return sectionSelector(`python-canvas:parameter-dictionary:${dictionaryId}`);
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
  return `input[id=${JSON.stringify(`list-child-count:${listId}`)}]`;
}
