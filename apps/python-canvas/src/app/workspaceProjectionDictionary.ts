import {
  commitWorkspaceDocument,
  setItemData,
  type WorkspaceHost,
  type WorkspaceItem,
  type WorkspaceItemDiagnostic,
  type WorkspaceSectionItemTree,
} from "@setta/workspace";

import {
  DIAGNOSTIC_SEVERITY_INFORMATION_V2,
  DICTIONARY_ENTRY_KIND_LEAF_V2,
  DICTIONARY_ENTRY_KIND_PARENT_V2,
  type DiagnosticV2,
  type DictionaryEntryV2,
  type ParameterDictionaryV2,
  type ProjectSnapshotV2,
} from "../backend/generatedContract";
import {
  type DictionaryEntryItemData,
  type ParameterDictionarySectionData,
  readDictionaryEntryItemData,
} from "../sections/ParamDictSection";

const dictionaryEntryWorkspaceItemPrefix =
  "python-canvas:dictionary-entry-item:";

export function parameterDictionarySectionID(dictionaryId: string): string {
  return `python-canvas:parameter-dictionary:${dictionaryId}`;
}

export function dictionaryEntryRootID(dictionaryId: string): string {
  return `${parameterDictionarySectionID(dictionaryId)}:entry-root`;
}

export function dictionaryEntryWorkspaceItemID(entryId: string): string {
  return `${dictionaryEntryWorkspaceItemPrefix}${encodeURIComponent(entryId)}`;
}

export function setDictionaryEntryExpression(
  host: WorkspaceHost,
  dictionaryId: string,
  entryItemId: string,
  authoredExpression: string,
): void {
  updateDictionaryEntryItem(host, dictionaryId, entryItemId, (data) => {
    if (data.kind !== DICTIONARY_ENTRY_KIND_LEAF_V2) {
      return null;
    }
    return data.authoredExpression === authoredExpression
      ? null
      : { ...data, authoredExpression };
  });
}

export function setDictionaryEntryName(
  host: WorkspaceHost,
  dictionaryId: string,
  entryItemId: string,
  name: string,
): void {
  updateDictionaryEntryItem(host, dictionaryId, entryItemId, (data) =>
    data.name === name ? null : { ...data, name },
  );
}

// The generic item tree intentionally owns only structural movement. Once a
// leaf owns a child, make its application data an explicit dictionary parent
// in the same local document transaction. That marker remains after its last
// child moves away, so an empty parent never turns back into a leaf expression.
export function promoteDictionaryEntryParents(
  host: WorkspaceHost,
  dictionaryId: string,
): boolean {
  const document = host.getSnapshot();
  const sectionId = parameterDictionarySectionID(dictionaryId);
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  if (section === undefined || itemTree === undefined) {
    return false;
  }
  let changed = false;
  const items: WorkspaceSectionItemTree["items"] = { ...itemTree.items };
  for (const [itemId, item] of Object.entries(itemTree.items)) {
    if (itemId === itemTree.rootId || item.children.length === 0) {
      continue;
    }
    const data = readDictionaryEntryItemData(item.data);
    if (data.kind === DICTIONARY_ENTRY_KIND_LEAF_V2) {
      items[itemId] = {
        ...item,
        data: {
          kind: DICTIONARY_ENTRY_KIND_PARENT_V2,
          name: data.name,
        } satisfies DictionaryEntryItemData,
      };
      changed = true;
    }
  }
  if (!changed) {
    return false;
  }
  commitWorkspaceDocument(host, {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: { ...itemTree, items },
      },
    },
  });
  return true;
}

export function createParameterDictionaryEntryItem(): WorkspaceItem {
  const entryId = `dictionary-entry:authored:${crypto.randomUUID()}`;
  return {
    id: dictionaryEntryWorkspaceItemID(entryId),
    children: [],
    data: {
      authoredExpression: "",
      kind: DICTIONARY_ENTRY_KIND_LEAF_V2,
      name: "",
    } satisfies DictionaryEntryItemData,
  };
}

export function readParameterDictionaryEntries(
  document: {
    sections: Record<string, { itemTree?: WorkspaceSectionItemTree }>;
  },
  dictionaryId: string,
): DictionaryEntryV2[] {
  const section = document.sections[parameterDictionarySectionID(dictionaryId)];
  if (section?.itemTree === undefined) {
    throw new Error(
      `Python Canvas parameter dictionary ${dictionaryId} is missing.`,
    );
  }
  return readDictionaryEntriesFromTree(section.itemTree);
}

export function projectCanonicalDictionaryEntries(
  previous: WorkspaceSectionItemTree | undefined,
  dictionary: ParameterDictionaryV2,
): WorkspaceSectionItemTree {
  const rootId = dictionaryEntryRootID(dictionary.id);
  const items: Record<string, WorkspaceItem> = {
    [rootId]: { id: rootId, children: [] },
  };

  function projectEntries(
    parentId: string,
    entries: ReadonlyArray<DictionaryEntryV2>,
  ) {
    const parent = items[parentId];
    if (parent === undefined) {
      throw new Error(`Python Canvas dictionary entry ${parentId} is missing.`);
    }
    const childIds = entries.map((entry) =>
      dictionaryEntryWorkspaceItemID(entry.id),
    );
    items[parentId] = { ...parent, children: childIds };
    for (const entry of entries) {
      const itemId = dictionaryEntryWorkspaceItemID(entry.id);
      items[itemId] = {
        children:
          entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2
            ? entry.children.map((child) =>
                dictionaryEntryWorkspaceItemID(child.id),
              )
            : [],
        data: projectDictionaryEntryItemData(entry),
        id: itemId,
      };
      if (entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
        projectEntries(itemId, entry.children);
      }
    }
  }

  projectEntries(rootId, dictionary.entries);
  const itemIds = new Set(Object.keys(items));
  return {
    rootId,
    items,
    selectedItemIds:
      previous?.selectedItemIds.filter((id) => itemIds.has(id)) ?? [],
  };
}

export function projectParameterDictionarySectionData(
  snapshot: ProjectSnapshotV2,
  dictionary: ParameterDictionaryV2,
): ParameterDictionarySectionData {
  const entryIDs = new Set<string>();
  collectDictionaryEntryIDs(dictionary.entries, entryIDs);
  const entryDiagnostics: ParameterDictionarySectionData["entryDiagnostics"] =
    {};
  for (const diagnostic of snapshot.diagnostics) {
    if (diagnostic.targetId !== null && entryIDs.has(diagnostic.targetId)) {
      const itemId = dictionaryEntryWorkspaceItemID(diagnostic.targetId);
      entryDiagnostics[itemId] = [
        ...(entryDiagnostics[itemId] ?? []),
        projectItemDiagnostic(diagnostic),
      ];
    }
  }
  return {
    dictionary: { id: dictionary.id, name: dictionary.name },
    entryDiagnostics,
  };
}

function updateDictionaryEntryItem(
  host: WorkspaceHost,
  dictionaryId: string,
  entryItemId: string,
  next: (data: DictionaryEntryItemData) => DictionaryEntryItemData | null,
): void {
  const sectionId = parameterDictionarySectionID(dictionaryId);
  const item =
    host.getSnapshot().sections[sectionId]?.itemTree?.items[entryItemId];
  if (item === undefined) {
    return;
  }
  const data = next(readDictionaryEntryItemData(item.data));
  if (data !== null) {
    setItemData(host, sectionId, entryItemId, data);
  }
}

function readDictionaryEntriesFromTree(
  itemTree: WorkspaceSectionItemTree,
): DictionaryEntryV2[] {
  function readEntries(parentId: string): DictionaryEntryV2[] {
    const parent = itemTree.items[parentId];
    if (parent === undefined) {
      throw new Error(`Python Canvas dictionary entry ${parentId} is missing.`);
    }
    return parent.children.map((itemId) => {
      const item = itemTree.items[itemId];
      if (item === undefined) {
        throw new Error(`Python Canvas dictionary entry ${itemId} is missing.`);
      }
      const data = readDictionaryEntryItemData(item.data);
      const id = canonicalDictionaryEntryID(item.id);
      if (
        data.kind === DICTIONARY_ENTRY_KIND_PARENT_V2 ||
        item.children.length > 0
      ) {
        return {
          children: readEntries(item.id),
          id,
          kind: DICTIONARY_ENTRY_KIND_PARENT_V2,
          name: data.name,
        };
      }
      return {
        authoredExpression: data.authoredExpression,
        id,
        kind: DICTIONARY_ENTRY_KIND_LEAF_V2,
        name: data.name,
      };
    });
  }
  return readEntries(itemTree.rootId);
}

function canonicalDictionaryEntryID(itemId: string): string {
  return canonicalWorkspaceItemID(
    itemId,
    dictionaryEntryWorkspaceItemPrefix,
    "dictionary entry",
  );
}

function canonicalWorkspaceItemID(
  itemId: string,
  prefix: string,
  kind: string,
): string {
  if (!itemId.startsWith(prefix)) {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  const encoded = itemId.slice(prefix.length);
  let id: string;
  try {
    id = decodeURIComponent(encoded);
  } catch {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  if (id === "" || `${prefix}${encodeURIComponent(id)}` !== itemId) {
    throw new Error(`Python Canvas ${kind} item ${itemId} is invalid.`);
  }
  return id;
}

function collectDictionaryEntryIDs(
  entries: ReadonlyArray<DictionaryEntryV2>,
  entryIDs: Set<string>,
): void {
  for (const entry of entries) {
    entryIDs.add(entry.id);
    if (entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
      collectDictionaryEntryIDs(entry.children, entryIDs);
    }
  }
}

function projectDictionaryEntryItemData(
  entry: DictionaryEntryV2,
): DictionaryEntryItemData {
  if (entry.kind === DICTIONARY_ENTRY_KIND_PARENT_V2) {
    return { kind: entry.kind, name: entry.name };
  }
  return {
    authoredExpression: entry.authoredExpression,
    kind: entry.kind,
    name: entry.name,
  };
}

function projectItemDiagnostic(
  diagnostic: DiagnosticV2,
): WorkspaceItemDiagnostic {
  return {
    message: diagnostic.message,
    severity:
      diagnostic.severity === DIAGNOSTIC_SEVERITY_INFORMATION_V2
        ? "info"
        : diagnostic.severity,
  };
}
