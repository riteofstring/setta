import { WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT } from "./types.js";
import { assertWorkspaceClipboardJsonValue } from "./json.js";
import type {
  JsonValue,
  WorkspaceClipboardFragment,
  WorkspaceClipboardLocalPayloadParseResult,
  WorkspaceClipboardLocalSectionContent,
  WorkspaceLocalClipboardPayload,
} from "./types.js";
import type {
  WorkspaceItem,
  WorkspaceItemPresentation,
  WorkspaceSectionData,
  WorkspaceSectionItemTree,
} from "../document/types.js";

type UnknownRecord = Record<string, unknown>;

class WorkspaceLocalClipboardPayloadValidationError extends Error {}

function fail(): never {
  throw new WorkspaceLocalClipboardPayloadValidationError();
}

function assertRecord(value: unknown): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail();
  }
}

function assertKnownFields(
  value: UnknownRecord,
  fields: ReadonlyArray<string>,
): void {
  const known = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!known.has(field)) {
      fail();
    }
  }
}

function readStableIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim() ||
    value === "__proto__" ||
    value === "constructor" ||
    value === "prototype"
  ) {
    fail();
  }
  return value;
}

function readStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    fail();
  }
  const values: Array<string> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const identifier = readStableIdentifier(entry);
    if (seen.has(identifier)) {
      fail();
    }
    seen.add(identifier);
    values.push(identifier);
  }
  return values;
}

function readJsonValue(value: unknown): JsonValue {
  try {
    assertWorkspaceClipboardJsonValue(value);
  } catch {
    fail();
  }
  return value;
}

function readItem(value: unknown, recordId: string): WorkspaceItem {
  assertRecord(value);
  assertKnownFields(value, ["children", "data", "id", "presentation"]);
  const id = readStableIdentifier(value["id"]);
  if (id !== recordId) {
    fail();
  }
  let presentation: WorkspaceItemPresentation | undefined;
  if (Object.hasOwn(value, "presentation")) {
    assertRecord(value["presentation"]);
    presentation = readJsonValue(
      value["presentation"],
    ) as WorkspaceItemPresentation;
  }
  let data: WorkspaceSectionData | undefined;
  if (Object.hasOwn(value, "data")) {
    data = readJsonValue(value["data"]) as WorkspaceSectionData;
  }
  return {
    children: readStringArray(value["children"]),
    ...(data === undefined ? {} : { data }),
    id,
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function assertValidItemParentClaims(tree: WorkspaceSectionItemTree): void {
  const parents = new Map<string, string>();
  for (const [itemId, item] of Object.entries(tree.items)) {
    for (const childId of item.children) {
      if (
        !tree.items[childId] ||
        childId === tree.rootId ||
        parents.has(childId)
      ) {
        fail();
      }
      parents.set(childId, itemId);
    }
  }
}

function assertAllItemsReachable(tree: WorkspaceSectionItemTree): void {
  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const visit = (itemId: string): void => {
    if (visiting.has(itemId)) {
      fail();
    }
    if (reachable.has(itemId)) {
      return;
    }
    const item = tree.items[itemId];
    if (!item) {
      fail();
    }
    visiting.add(itemId);
    for (const childId of item.children) {
      visit(childId);
    }
    visiting.delete(itemId);
    reachable.add(itemId);
  };
  visit(tree.rootId);
  if (reachable.size !== Object.keys(tree.items).length) {
    fail();
  }
}

function assertValidSelectedItems(tree: WorkspaceSectionItemTree): void {
  for (const selectedItemId of tree.selectedItemIds) {
    if (!tree.items[selectedItemId] || selectedItemId === tree.rootId) {
      fail();
    }
  }
}

function assertValidItemTree(tree: WorkspaceSectionItemTree): void {
  assertValidItemParentClaims(tree);
  assertAllItemsReachable(tree);
  assertValidSelectedItems(tree);
}

function readItemTree(
  value: unknown,
  itemCount: { value: number },
): WorkspaceSectionItemTree {
  assertRecord(value);
  assertKnownFields(value, [
    "itemColumnWidth",
    "items",
    "rootId",
    "selectedItemIds",
  ]);
  const rootId = readStableIdentifier(value["rootId"]);
  assertRecord(value["items"]);
  const items: Record<string, WorkspaceItem> = Object.create(null) as Record<
    string,
    WorkspaceItem
  >;
  for (const [recordId, item] of Object.entries(value["items"])) {
    readStableIdentifier(recordId);
    itemCount.value += 1;
    if (itemCount.value > WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT) {
      fail();
    }
    items[recordId] = readItem(item, recordId);
  }
  if (!items[rootId]) {
    fail();
  }
  const selectedItemIds = readStringArray(value["selectedItemIds"]);
  let itemColumnWidth: number | undefined;
  if (Object.hasOwn(value, "itemColumnWidth")) {
    if (
      typeof value["itemColumnWidth"] !== "number" ||
      !Number.isFinite(value["itemColumnWidth"])
    ) {
      fail();
    }
    itemColumnWidth = value["itemColumnWidth"];
  }
  const tree: WorkspaceSectionItemTree = {
    ...(itemColumnWidth === undefined ? {} : { itemColumnWidth }),
    items,
    rootId,
    selectedItemIds,
  };
  assertValidItemTree(tree);
  return tree;
}

function readLocalSectionContent(
  value: unknown,
  itemCount: { value: number },
): WorkspaceClipboardLocalSectionContent {
  assertRecord(value);
  assertKnownFields(value, ["data", "itemTree"]);
  const data = Object.hasOwn(value, "data")
    ? (readJsonValue(value["data"]) as WorkspaceSectionData)
    : undefined;
  const itemTree = Object.hasOwn(value, "itemTree")
    ? readItemTree(value["itemTree"], itemCount)
    : undefined;
  return {
    ...(data === undefined ? {} : { data }),
    ...(itemTree === undefined ? {} : { itemTree }),
  };
}

function assertPayloadSectionIds(
  rawSections: UnknownRecord,
  fragment: WorkspaceClipboardFragment,
): Array<string> {
  const sourceIds = Object.keys(fragment.sections);
  const payloadIds = Object.keys(rawSections);
  if (payloadIds.length !== sourceIds.length) {
    fail();
  }
  for (const sectionId of payloadIds) {
    if (!fragment.sections[sectionId]) {
      fail();
    }
  }
  return sourceIds;
}

function readLocalPayload(
  value: unknown,
  fragment: WorkspaceClipboardFragment,
): WorkspaceLocalClipboardPayload {
  assertRecord(value);
  assertKnownFields(value, ["sections"]);
  assertRecord(value["sections"]);
  const rawSections = value["sections"];
  const sourceIds = assertPayloadSectionIds(rawSections, fragment);
  const itemCount = { value: 0 };
  const sections: Record<string, WorkspaceClipboardLocalSectionContent> =
    Object.create(null) as Record<
      string,
      WorkspaceClipboardLocalSectionContent
    >;
  for (const sectionId of sourceIds) {
    const rawSection = rawSections[sectionId];
    if (!rawSection) {
      fail();
    }
    sections[sectionId] = readLocalSectionContent(rawSection, itemCount);
  }
  return { sections };
}

export function parseWorkspaceLocalClipboardPayload(
  value: unknown,
  fragment: WorkspaceClipboardFragment,
): WorkspaceClipboardLocalPayloadParseResult {
  try {
    return { ok: true, payload: readLocalPayload(value, fragment) };
  } catch (error) {
    if (error instanceof WorkspaceLocalClipboardPayloadValidationError) {
      return { code: "invalid-local-payload", ok: false };
    }
    throw error;
  }
}
