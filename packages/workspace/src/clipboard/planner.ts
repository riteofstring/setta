import {
  cloneFrozenWorkspaceClipboardJsonValue,
  cloneWorkspaceClipboardJsonValue,
} from "./json";
import { parseWorkspaceLocalClipboardPayload } from "./localPayload";
import type {
  JsonValue,
  WorkspaceClipboardIdMaps,
  WorkspaceClipboardItemDataCloneContext,
  WorkspaceClipboardItemIdMaps,
  WorkspaceClipboardLocalPastePlan,
  WorkspaceClipboardLocalPastePlanInput,
  WorkspaceClipboardSectionDataCloneContext,
} from "./types";
import type {
  WorkspaceItem,
  WorkspaceItemPresentation,
  WorkspaceSection,
  WorkspaceSectionData,
  WorkspaceSectionItemTree,
} from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";

function assertStableAllocatedIdentifier(value: string, role: string): void {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim()
  ) {
    throw new Error(`${role} must allocate a nonblank trimmed identifier.`);
  }
}

function collectSectionIds(
  fragment: WorkspaceClipboardLocalPastePlanInput["fragment"],
): Array<string> {
  const ids: Array<string> = [];
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const visit = (sectionId: string): void => {
    if (visiting.has(sectionId) || seen.has(sectionId)) {
      throw new Error(
        `Clipboard fragment duplicates or cycles section ${sectionId}.`,
      );
    }
    const section = fragment.sections[sectionId];
    if (!section) {
      throw new Error(`Clipboard fragment is missing section ${sectionId}.`);
    }
    visiting.add(sectionId);
    ids.push(sectionId);
    for (const childId of section.children) {
      visit(childId);
    }
    visiting.delete(sectionId);
    seen.add(sectionId);
  };
  for (const rootId of fragment.roots) {
    visit(rootId);
  }
  if (seen.size !== Object.keys(fragment.sections).length) {
    throw new Error("Clipboard fragment contains unreachable sections.");
  }
  return ids;
}

function collectItemIds(itemTree: WorkspaceSectionItemTree): Array<string> {
  const ids: Array<string> = [];
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const visit = (itemId: string): void => {
    if (visiting.has(itemId) || seen.has(itemId)) {
      throw new Error(
        `Clipboard item tree duplicates or cycles item ${itemId}.`,
      );
    }
    const item = itemTree.items[itemId];
    if (!item) {
      throw new Error(`Clipboard item tree is missing item ${itemId}.`);
    }
    visiting.add(itemId);
    ids.push(itemId);
    for (const childId of item.children) {
      visit(childId);
    }
    visiting.delete(itemId);
    seen.add(itemId);
  };
  visit(itemTree.rootId);
  if (seen.size !== Object.keys(itemTree.items).length) {
    throw new Error("Clipboard item tree contains unreachable items.");
  }
  return ids;
}

function allocateSectionIds(
  input: WorkspaceClipboardLocalPastePlanInput,
  sourceSectionIds: ReadonlyArray<string>,
): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  const occupied = new Set<string>(Object.keys(input.document.sections));
  for (const sourceSectionId of sourceSectionIds) {
    const destinationSectionId =
      input.allocator.allocateSectionId(sourceSectionId);
    assertStableAllocatedIdentifier(
      destinationSectionId,
      "Clipboard section id allocator",
    );
    if (occupied.has(destinationSectionId)) {
      throw new Error(
        `Clipboard section id allocator produced duplicate id ${destinationSectionId}.`,
      );
    }
    occupied.add(destinationSectionId);
    ids.set(sourceSectionId, destinationSectionId);
  }
  return ids;
}

function allocateItemIds(
  input: WorkspaceClipboardLocalPastePlanInput,
  sourceSectionIds: ReadonlyArray<string>,
): WorkspaceClipboardItemIdMaps {
  const sections = new Map<string, ReadonlyMap<string, string>>();
  for (const sourceSectionId of sourceSectionIds) {
    const itemTree = input.payload.sections[sourceSectionId]?.itemTree;
    const itemIds = new Map<string, string>();
    sections.set(sourceSectionId, itemIds);
    if (!itemTree) {
      continue;
    }
    const occupied = new Set<string>();
    for (const sourceItemId of collectItemIds(itemTree)) {
      const destinationItemId = input.allocator.allocateItemId(
        sourceSectionId,
        sourceItemId,
      );
      assertStableAllocatedIdentifier(
        destinationItemId,
        "Clipboard item id allocator",
      );
      if (occupied.has(destinationItemId)) {
        throw new Error(
          `Clipboard item id allocator produced duplicate id ${destinationItemId} in section ${sourceSectionId}.`,
        );
      }
      occupied.add(destinationItemId);
      itemIds.set(sourceItemId, destinationItemId);
    }
  }
  return sections;
}

class DetachedReadonlyMap<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #values: Map<Key, Value>;

  constructor(values: ReadonlyMap<Key, Value>) {
    this.#values = new Map(values);
  }

  get size(): number {
    return this.#values.size;
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.#values[Symbol.iterator]();
  }

  entries(): MapIterator<[Key, Value]> {
    return this.#values.entries();
  }

  forEach(
    callbackfn: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown,
  ): void {
    this.#values.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }

  get(key: Key): Value | undefined {
    return this.#values.get(key);
  }

  has(key: Key): boolean {
    return this.#values.has(key);
  }

  keys(): MapIterator<Key> {
    return this.#values.keys();
  }

  values(): MapIterator<Value> {
    return this.#values.values();
  }
}

function createDetachedReadonlyMap<Key, Value>(
  values: ReadonlyMap<Key, Value>,
): ReadonlyMap<Key, Value> {
  return Object.freeze(new DetachedReadonlyMap(values));
}

function createDetachedClipboardIdMaps(
  maps: WorkspaceClipboardIdMaps,
): WorkspaceClipboardIdMaps {
  const itemIdsBySection = new Map<string, ReadonlyMap<string, string>>();
  for (const [sectionId, itemIds] of maps.itemIdsBySection) {
    itemIdsBySection.set(sectionId, createDetachedReadonlyMap(itemIds));
  }
  return Object.freeze({
    itemIdsBySection: createDetachedReadonlyMap(itemIdsBySection),
    sectionIds: createDetachedReadonlyMap(maps.sectionIds),
  });
}

function createSectionDataCloneContext(
  maps: WorkspaceClipboardIdMaps,
  sourceSectionId: string,
): WorkspaceClipboardSectionDataCloneContext {
  return Object.freeze({
    ...createDetachedClipboardIdMaps(maps),
    sourceSectionId,
  });
}

function createItemDataCloneContext(
  maps: WorkspaceClipboardIdMaps,
  sourceSectionId: string,
  sourceItemId: string,
): WorkspaceClipboardItemDataCloneContext {
  return Object.freeze({
    ...createDetachedClipboardIdMaps(maps),
    sourceItemId,
    sourceSectionId,
  });
}

function getMappedIdentifier(
  ids: ReadonlyMap<string, string>,
  sourceId: string,
  role: string,
): string {
  const mapped = ids.get(sourceId);
  if (!mapped) {
    throw new Error(
      `Clipboard plan is missing ${role} mapping for ${sourceId}.`,
    );
  }
  return mapped;
}

function cloneSectionData(
  input: WorkspaceClipboardLocalPastePlanInput,
  value: WorkspaceSectionData,
  sourceSectionId: string,
  maps: WorkspaceClipboardIdMaps,
): WorkspaceSectionData {
  const source = cloneFrozenWorkspaceClipboardJsonValue(
    value,
  ) as unknown as WorkspaceSnapshot<WorkspaceSectionData>;
  const context = createSectionDataCloneContext(maps, sourceSectionId);
  const cloned = input.authority.cloneSectionData
    ? input.authority.cloneSectionData(source, context)
    : source;
  return cloneWorkspaceClipboardJsonValue(
    cloned as unknown as JsonValue,
  ) as WorkspaceSectionData;
}

function cloneItemData(
  input: WorkspaceClipboardLocalPastePlanInput,
  value: WorkspaceSectionData,
  sourceSectionId: string,
  sourceItemId: string,
  maps: WorkspaceClipboardIdMaps,
): WorkspaceSectionData {
  const source = cloneFrozenWorkspaceClipboardJsonValue(
    value,
  ) as unknown as WorkspaceSnapshot<WorkspaceSectionData>;
  const context = createItemDataCloneContext(
    maps,
    sourceSectionId,
    sourceItemId,
  );
  const cloned = input.authority.cloneItemData
    ? input.authority.cloneItemData(source, context)
    : source;
  return cloneWorkspaceClipboardJsonValue(
    cloned as unknown as JsonValue,
  ) as WorkspaceSectionData;
}

function cloneItemPresentation(
  presentation: WorkspaceItemPresentation | undefined,
): WorkspaceItemPresentation | undefined {
  if (presentation === undefined) {
    return undefined;
  }
  return cloneWorkspaceClipboardJsonValue(
    presentation as unknown as JsonValue,
  ) as WorkspaceItemPresentation;
}

function cloneItemTree(
  input: WorkspaceClipboardLocalPastePlanInput,
  sourceSectionId: string,
  source: WorkspaceSectionItemTree,
  maps: WorkspaceClipboardIdMaps,
): WorkspaceSectionItemTree {
  const sourceItemIds = maps.itemIdsBySection.get(sourceSectionId);
  if (!sourceItemIds) {
    throw new Error(
      `Clipboard plan is missing item ids for section ${sourceSectionId}.`,
    );
  }
  const items: Record<string, WorkspaceItem> = Object.create(null) as Record<
    string,
    WorkspaceItem
  >;
  for (const sourceItemId of collectItemIds(source)) {
    const sourceItem = source.items[sourceItemId];
    if (!sourceItem) {
      throw new Error(`Clipboard item tree is missing item ${sourceItemId}.`);
    }
    const destinationItemId = getMappedIdentifier(
      sourceItemIds,
      sourceItemId,
      "item",
    );
    const data =
      sourceItem.data === undefined
        ? undefined
        : cloneItemData(
            input,
            sourceItem.data,
            sourceSectionId,
            sourceItemId,
            maps,
          );
    const presentation = cloneItemPresentation(sourceItem.presentation);
    items[destinationItemId] = {
      children: sourceItem.children.map((childId) =>
        getMappedIdentifier(sourceItemIds, childId, "item"),
      ),
      ...(data === undefined ? {} : { data }),
      id: destinationItemId,
      ...(presentation === undefined ? {} : { presentation }),
    };
  }
  return {
    ...(source.itemColumnWidth === undefined
      ? {}
      : { itemColumnWidth: source.itemColumnWidth }),
    items,
    rootId: getMappedIdentifier(sourceItemIds, source.rootId, "item"),
    selectedItemIds: source.selectedItemIds.map((itemId) =>
      getMappedIdentifier(sourceItemIds, itemId, "item"),
    ),
  };
}

function cloneSection(
  input: WorkspaceClipboardLocalPastePlanInput,
  sourceSectionId: string,
  maps: WorkspaceClipboardIdMaps,
): WorkspaceSection {
  const source = input.fragment.sections[sourceSectionId];
  const sourceContent = input.payload.sections[sourceSectionId];
  if (!source || !sourceContent) {
    throw new Error(`Clipboard plan is missing section ${sourceSectionId}.`);
  }
  const data =
    sourceContent.data === undefined
      ? undefined
      : cloneSectionData(input, sourceContent.data, sourceSectionId, maps);
  const itemTree =
    sourceContent.itemTree === undefined
      ? undefined
      : cloneItemTree(input, sourceSectionId, sourceContent.itemTree, maps);
  return {
    children: source.children.map((childId) =>
      getMappedIdentifier(maps.sectionIds, childId, "section"),
    ),
    ...(data === undefined ? {} : { data }),
    id: getMappedIdentifier(maps.sectionIds, sourceSectionId, "section"),
    isHorizontalOrientation: source.isHorizontalOrientation,
    isMinimized: source.isMinimized,
    ...(itemTree === undefined ? {} : { itemTree }),
    kind: source.kind,
    name: source.name,
    overflowMode: source.overflowMode,
    positionAndSizeLocked: source.positionAndSizeLocked,
    size: { ...source.size },
    styleColor: source.styleColor,
    tagColor: source.tagColor,
  };
}

function assertPlacement(
  placement: WorkspaceClipboardLocalPastePlanInput["placement"],
): void {
  if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) {
    throw new Error("Clipboard paste placement must be finite.");
  }
}

function getMaximumZIndex(
  document: WorkspaceClipboardLocalPastePlanInput["document"],
): number {
  let maximum = -1;
  for (const layout of Object.values(document.topLevelSections)) {
    if (!Number.isFinite(layout.zIndex)) {
      throw new Error(
        "Clipboard paste requires finite existing z-index values.",
      );
    }
    maximum = Math.max(maximum, layout.zIndex);
  }
  return maximum;
}

export function planWorkspaceLocalClipboardPaste(
  input: WorkspaceClipboardLocalPastePlanInput,
): WorkspaceClipboardLocalPastePlan {
  assertPlacement(input.placement);
  const parsedPayload = parseWorkspaceLocalClipboardPayload(
    input.payload,
    input.fragment,
  );
  if (!parsedPayload.ok) {
    throw new Error("Clipboard local payload is invalid.");
  }
  const sourceSectionIds = collectSectionIds(input.fragment);
  const sectionIds = allocateSectionIds(input, sourceSectionIds);
  const itemIdsBySection = allocateItemIds(input, sourceSectionIds);
  const maps: WorkspaceClipboardIdMaps = { itemIdsBySection, sectionIds };
  const sections = { ...input.document.sections };
  for (const sourceSectionId of sourceSectionIds) {
    const destination = cloneSection(input, sourceSectionId, maps);
    sections[destination.id] = destination;
  }
  const topLevelSections = { ...input.document.topLevelSections };
  let zIndex = getMaximumZIndex(input.document);
  const rootIds = input.fragment.roots.map((sourceRootId) => {
    const sourceLayout = input.fragment.topLevelLayouts[sourceRootId];
    if (!sourceLayout) {
      throw new Error(
        `Clipboard fragment is missing root layout ${sourceRootId}.`,
      );
    }
    const destinationRootId = getMappedIdentifier(
      sectionIds,
      sourceRootId,
      "section",
    );
    zIndex += 1;
    topLevelSections[destinationRootId] = {
      h: sourceLayout.h,
      w: sourceLayout.w,
      x: input.placement.x + sourceLayout.x,
      y: input.placement.y + sourceLayout.y,
      zIndex,
    };
    return destinationRootId;
  });
  return {
    itemIdsBySection,
    nextDocument: {
      activeIds: rootIds,
      sections,
      topLevelSections,
      viewport: input.document.viewport,
      savedViews: input.document.savedViews,
    },
    rootIds,
    sectionIds,
  };
}
