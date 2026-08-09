import { isDenseArray, isEnumerableDataProperty } from "./runtime-option-validation.js";
import type { SortableItemTree } from "./sortable-item-tree-contract.js";

export type SortableItemTreeValidationCode =
  | "cycle"
  | "duplicate-item"
  | "duplicate-placement"
  | "invalid-item"
  | "invalid-tree"
  | "root-placement"
  | "unknown-item"
  | "unknown-parent"
  | "unreachable-item";

export class SortableItemTreeValidationError extends TypeError {
  readonly code: SortableItemTreeValidationCode;
  readonly path: string;

  constructor(code: SortableItemTreeValidationCode, path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "SortableItemTreeValidationError";
    this.code = code;
    this.path = path;
  }
}

export type SortableItemTreeIndex = Readonly<{
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  itemOrder: readonly string[];
  parentByItem: ReadonlyMap<string, string>;
  rootId: string;
}>;

type UnknownRecord = Record<string, unknown>;

const treeKeys = ["childrenByParent", "itemIds", "rootId"] as const;

function fail(code: SortableItemTreeValidationCode, path: string, detail: string): never {
  throw new SortableItemTreeValidationError(code, path, detail);
}

function recordAt(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid-tree", path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    fail("invalid-tree", path, "expected a plain object");
  }
  return value as UnknownRecord;
}

function enumerableStringKeys(record: UnknownRecord, path: string): readonly string[] {
  const keys = Reflect.ownKeys(record);
  const invalidKey = keys.find(
    (key) => typeof key !== "string" || !isEnumerableDataProperty(record, key),
  );
  if (invalidKey !== undefined) {
    fail("invalid-tree", path, "fields must be enumerable string data properties");
  }
  return keys as string[];
}

function exactTreeKeys(tree: UnknownRecord): void {
  const keys = enumerableStringKeys(tree, "$");
  const expected = new Set<string>(treeKeys);
  const unexpected = keys.find((key) => !expected.has(key));
  if (unexpected) {
    fail("invalid-tree", `$.${unexpected}`, "unexpected field");
  }
  const missing = treeKeys.find((key) => !Object.hasOwn(tree, key));
  if (missing) {
    fail("invalid-tree", `$.${missing}`, "missing required field");
  }
}

function itemIdAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("invalid-item", path, "item IDs must be non-empty strings");
  }
  return value;
}

function arrayAt(value: unknown, path: string): readonly unknown[] {
  if (!isDenseArray(value)) {
    fail("invalid-tree", path, "expected a dense array without extra fields");
  }
  return value;
}

function itemIdsAt(value: unknown, rootId: string): readonly string[] {
  const values = arrayAt(value, "$.itemIds");
  const itemIds: string[] = [];
  const seen = new Set<string>();
  values.forEach((candidate, index) => {
    const path = `$.itemIds[${String(index)}]`;
    const itemId = itemIdAt(candidate, path);
    if (itemId === rootId) {
      fail("root-placement", path, "the non-rendered root cannot also be an item");
    }
    if (seen.has(itemId)) {
      fail("duplicate-item", path, `item "${itemId}" is listed more than once`);
    }
    seen.add(itemId);
    itemIds.push(itemId);
  });
  return itemIds;
}

type PlacementSnapshot = Readonly<{
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  parentByItem: ReadonlyMap<string, string>;
  placementPathByItem: ReadonlyMap<string, string>;
}>;

function placementSnapshot(
  value: unknown,
  rootId: string,
  itemIds: readonly string[],
): PlacementSnapshot {
  const record = recordAt(value, "$.childrenByParent");
  const itemSet = new Set(itemIds);
  const childrenByParent = new Map<string, readonly string[]>();
  const parentByItem = new Map<string, string>();
  const placementPathByItem = new Map<string, string>();
  for (const parentId of enumerableStringKeys(record, "$.childrenByParent")) {
    const parentPath = `$.childrenByParent[${JSON.stringify(parentId)}]`;
    if (parentId !== rootId && !itemSet.has(parentId)) {
      fail("unknown-parent", parentPath, `parent "${parentId}" is not the root or a known item`);
    }
    const children = arrayAt(record[parentId], parentPath).map((candidate, index) => {
      const childPath = `${parentPath}[${String(index)}]`;
      const childId = itemIdAt(candidate, childPath);
      validateChildPlacement(childId, childPath, rootId, itemSet, parentByItem);
      parentByItem.set(childId, parentId);
      placementPathByItem.set(childId, childPath);
      return childId;
    });
    childrenByParent.set(parentId, Object.freeze(children));
  }
  return { childrenByParent, parentByItem, placementPathByItem };
}

function validateChildPlacement(
  childId: string,
  path: string,
  rootId: string,
  itemIds: ReadonlySet<string>,
  parentByItem: ReadonlyMap<string, string>,
): void {
  if (childId === rootId) {
    fail("root-placement", path, "the non-rendered root cannot be placed as a child");
  }
  if (!itemIds.has(childId)) {
    fail("unknown-item", path, `child "${childId}" is not a known item`);
  }
  if (parentByItem.has(childId)) {
    fail("duplicate-placement", path, `item "${childId}" is placed more than once`);
  }
}

function validateReachability(
  itemIds: readonly string[],
  parentByItem: ReadonlyMap<string, string>,
) {
  for (const itemId of itemIds) {
    if (!parentByItem.has(itemId)) {
      fail(
        "unreachable-item",
        `$.itemIds[${String(itemIds.indexOf(itemId))}]`,
        `item "${itemId}" is not placed in the tree`,
      );
    }
  }
}

function validateAcyclic(
  itemIds: readonly string[],
  rootId: string,
  parentByItem: ReadonlyMap<string, string>,
  placementPathByItem: ReadonlyMap<string, string>,
): void {
  const resolved = new Set([rootId]);
  for (const itemId of itemIds) {
    const path: string[] = [];
    const pathSet = new Set<string>();
    let currentId = itemId;
    while (!resolved.has(currentId)) {
      if (pathSet.has(currentId)) {
        fail(
          "cycle",
          placementPathByItem.get(currentId) ?? "$.childrenByParent",
          `item ancestry contains a cycle at "${currentId}"`,
        );
      }
      path.push(currentId);
      pathSet.add(currentId);
      const parentId = parentByItem.get(currentId);
      if (parentId === undefined) {
        break;
      }
      currentId = parentId;
    }
    path.forEach((id) => resolved.add(id));
  }
}

function preorder(
  rootId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const order: string[] = [];
  const stack = [...(childrenByParent.get(rootId) ?? [])].reverse();
  while (stack.length > 0) {
    const itemId = stack.pop();
    if (itemId === undefined) {
      break;
    }
    order.push(itemId);
    const children = childrenByParent.get(itemId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId !== undefined) {
        stack.push(childId);
      }
    }
  }
  return Object.freeze(order);
}

export function createSortableItemTreeIndex(value: SortableItemTree): SortableItemTreeIndex {
  const tree = recordAt(value, "$");
  exactTreeKeys(tree);
  const rootId = itemIdAt(tree.rootId, "$.rootId");
  const itemIds = itemIdsAt(tree.itemIds, rootId);
  const placements = placementSnapshot(tree.childrenByParent, rootId, itemIds);
  validateReachability(itemIds, placements.parentByItem);
  validateAcyclic(itemIds, rootId, placements.parentByItem, placements.placementPathByItem);
  return Object.freeze({
    childrenByParent: placements.childrenByParent,
    itemOrder: preorder(rootId, placements.childrenByParent),
    parentByItem: placements.parentByItem,
    rootId,
  });
}

export function validateSortableItemTree(value: unknown): asserts value is SortableItemTree {
  createSortableItemTreeIndex(value as SortableItemTree);
}

export function deriveSortableItemParentLookup(
  tree: SortableItemTree,
): ReadonlyMap<string, string> {
  const index = createSortableItemTreeIndex(tree);
  const parents = new Map<string, string>();
  for (const itemId of index.itemOrder) {
    const parentId = index.parentByItem.get(itemId);
    if (parentId !== undefined) {
      parents.set(itemId, parentId);
    }
  }
  return parents;
}

export function getSortableItemOrder(tree: SortableItemTree): readonly string[] {
  return createSortableItemTreeIndex(tree).itemOrder;
}
