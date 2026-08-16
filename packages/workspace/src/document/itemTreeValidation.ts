import { assertNoReservedItemDndTokens } from "../dnd/itemDndState";
import { assertWorkspaceItemPresentationBoundary } from "./itemPresentation";
import type {
  WorkspaceItem,
  WorkspaceSectionData,
  WorkspaceSectionItemTree,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function assertRecord(
  value: unknown,
  owner: string,
): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} must be an object.`);
  }
}

function assertKnownFields(
  record: UnknownRecord,
  owner: string,
  fields: ReadonlyArray<string>,
) {
  const knownFields = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!knownFields.has(field)) {
      throw new Error(`${owner} contains the unknown field ${field}.`);
    }
  }
}

function assertString(value: unknown, owner: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${owner} must be a string.`);
  }
}

function assertStringArray(
  value: unknown,
  owner: string,
): asserts value is Array<string> {
  if (!Array.isArray(value)) {
    throw new Error(`${owner} must be an array.`);
  }
  for (const [index, entry] of value.entries()) {
    assertString(entry, `${owner}[${index}]`);
  }
}

function assertSerializableItemArray(
  value: Array<unknown>,
  owner: string,
  ancestors: Set<object>,
): void {
  for (const [index, entry] of value.entries()) {
    assertSerializableItemData(entry, `${owner}[${index}]`, ancestors);
  }
}

function assertSerializableItemRecord(
  value: object,
  owner: string,
  ancestors: Set<object>,
): void {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${owner} must contain only plain JSON objects.`);
  }
  for (const [field, entry] of Object.entries(value as UnknownRecord)) {
    assertSerializableItemData(entry, `${owner}.${field}`, ancestors);
  }
}

function assertSerializableItemContainer(
  value: unknown,
  owner: string,
  ancestors: Set<object>,
): void {
  if (value === null || typeof value !== "object") {
    throw new Error(`${owner} must contain only JSON values.`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${owner} must not contain a cycle.`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertSerializableItemArray(value, owner, ancestors);
    } else {
      assertSerializableItemRecord(value, owner, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function assertSerializableItemData(
  value: unknown,
  owner: string,
  ancestors = new Set<object>(),
): asserts value is WorkspaceSectionData {
  if (value === null) {
    return;
  }
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return;
  }
  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${owner} must contain only finite numbers.`);
    }
    return;
  }
  assertSerializableItemContainer(value, owner, ancestors);
}

function assertWorkspaceItemRecord(
  sectionId: string,
  itemId: string,
  value: unknown,
): asserts value is WorkspaceItem {
  const owner = `Section ${sectionId} item ${itemId}`;
  assertRecord(value, owner);
  assertKnownFields(value, owner, ["children", "data", "id", "presentation"]);
  assertString(value["id"], `${owner}.id`);
  if (value["id"].trim() === "" || value["id"] !== value["id"].trim()) {
    throw new Error(`${owner}.id must be nonblank and trimmed.`);
  }
  assertStringArray(value["children"], `${owner}.children`);
  if (Object.hasOwn(value, "data")) {
    if (value["data"] === undefined) {
      throw new Error(`${owner}.data must be omitted instead of undefined.`);
    }
    assertSerializableItemData(value["data"], `${owner}.data`);
  }
  if (
    Object.hasOwn(value, "presentation") &&
    value["presentation"] === undefined
  ) {
    throw new Error(
      `${owner}.presentation must be omitted instead of undefined.`,
    );
  }
}

function assertValidItemChildClaims(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
) {
  const parentByChild: Record<string, string> = {};
  for (const [itemId, candidate] of Object.entries(itemTree.items)) {
    assertWorkspaceItemRecord(sectionId, itemId, candidate);
    const item = candidate;
    if (item.id !== itemId) {
      throw new Error(
        `Section ${sectionId} item record key ${itemId} does not match item id ${item.id}.`,
      );
    }
    assertNoReservedItemDndTokens(itemId, `Section ${sectionId} item id`);
    for (const childId of item.children) {
      if (!Object.hasOwn(itemTree.items, childId)) {
        throw new Error(
          `Section ${sectionId} item ${itemId} lists unknown child ${childId}.`,
        );
      }
      if (childId === itemTree.rootId) {
        throw new Error(
          `Section ${sectionId} item ${itemId} claims the root item as a child.`,
        );
      }
      const existingParentId = parentByChild[childId];
      if (existingParentId !== undefined) {
        throw new Error(
          `Section ${sectionId} item ${childId} is claimed by parents ${existingParentId} and ${itemId}.`,
        );
      }
      parentByChild[childId] = itemId;
    }
  }
}

function assertItemsReachableFromRoot(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
) {
  const reachable = new Set<string>([itemTree.rootId]);
  const queue = [itemTree.rootId];
  let currentId = queue.pop();
  while (currentId !== undefined) {
    for (const childId of itemTree.items[currentId]?.children ?? []) {
      if (!reachable.has(childId)) {
        reachable.add(childId);
        queue.push(childId);
      }
    }
    currentId = queue.pop();
  }
  for (const itemId of Object.keys(itemTree.items)) {
    if (!reachable.has(itemId)) {
      throw new Error(
        `Section ${sectionId} item ${itemId} is not reachable from root ${itemTree.rootId}.`,
      );
    }
  }
}

function assertValidItemSelection(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
) {
  const selectedSet = new Set<string>();
  for (const selectedId of itemTree.selectedItemIds) {
    if (!Object.hasOwn(itemTree.items, selectedId)) {
      throw new Error(
        `Section ${sectionId} selects unknown item ${selectedId}.`,
      );
    }
    if (selectedId === itemTree.rootId) {
      throw new Error(
        `Section ${sectionId} selects its root item ${itemTree.rootId}.`,
      );
    }
    if (selectedSet.has(selectedId)) {
      throw new Error(`Section ${sectionId} selects item ${selectedId} twice.`);
    }
    selectedSet.add(selectedId);
  }
}

// A section's item tree is exactly one tree rooted at `rootId`: every child claim is unique,
// every item is reachable, row content is serializable and valid, and selection names only real
// non-root items. Insertion reuses this complete load-boundary validator before committing.
export function assertValidWorkspaceSectionItemTree(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
): void {
  assertRecord(itemTree, `Section ${sectionId} item tree`);
  assertKnownFields(itemTree, `Section ${sectionId} item tree`, [
    "itemColumnWidth",
    "items",
    "rootId",
    "selectedItemIds",
  ]);
  assertString(itemTree.rootId, `Section ${sectionId} item tree rootId`);
  if (
    itemTree.rootId.trim() === "" ||
    itemTree.rootId !== itemTree.rootId.trim()
  ) {
    throw new Error(
      `Section ${sectionId} item tree rootId must be nonblank and trimmed.`,
    );
  }
  assertRecord(itemTree.items, `Section ${sectionId} item tree items`);
  assertStringArray(
    itemTree.selectedItemIds,
    `Section ${sectionId} selected item ids`,
  );
  if (!Object.hasOwn(itemTree.items, itemTree.rootId)) {
    throw new Error(
      `Section ${sectionId} item tree is missing its root item ${itemTree.rootId}.`,
    );
  }
  if (Object.hasOwn(itemTree, "itemColumnWidth")) {
    if (itemTree.itemColumnWidth === undefined) {
      throw new Error(
        `Section ${sectionId} item column width must be omitted instead of undefined.`,
      );
    }
    if (!Number.isFinite(itemTree.itemColumnWidth)) {
      throw new Error(`Section ${sectionId} item column width must be finite.`);
    }
  }
  assertValidItemChildClaims(sectionId, itemTree);
  for (const item of Object.values(itemTree.items)) {
    assertWorkspaceItemPresentationBoundary(sectionId, item, itemTree.rootId);
  }
  assertItemsReachableFromRoot(sectionId, itemTree);
  assertValidItemSelection(sectionId, itemTree);
}
