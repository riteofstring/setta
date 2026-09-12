import {
  ItemDndContext,
  WorkspaceItemList,
  type WorkspaceItem,
  type WorkspaceItemDiagnostic,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceSectionItemTree,
} from "@setta/workspace";

import {
  DICTIONARY_ENTRY_KIND_LEAF_V2,
  DICTIONARY_ENTRY_KIND_PARENT_V2,
  type DictionaryEntryKindV2,
} from "../backend/generatedContract";
const DICTIONARY_ITEM_LIST_KEY = "python-canvas-parameter-dictionary";

export type ParameterDictionarySectionData = {
  dictionary: {
    id: string;
    name: string;
  };
  entryDiagnostics: Record<string, Array<WorkspaceItemDiagnostic>>;
};

type DictionaryEntryItemData =
  | {
      authoredExpression: string;
      kind: typeof DICTIONARY_ENTRY_KIND_LEAF_V2;
      name: string;
    }
  | {
      kind: typeof DICTIONARY_ENTRY_KIND_PARENT_V2;
      name: string;
    };

export function readParameterDictionarySectionData(
  value: unknown,
): ParameterDictionarySectionData {
  const record = readRecord(value, "Parameter Dictionary section data");
  requireExactFields(record, ["dictionary", "entryDiagnostics"]);
  const dictionary = readRecord(
    record.dictionary,
    "Parameter Dictionary section dictionary",
  );
  requireExactFields(dictionary, ["id", "name"]);
  return {
    dictionary: {
      id: readStableId(dictionary.id, "dictionary.id"),
      name: readNonBlankString(dictionary.name, "dictionary.name"),
    },
    entryDiagnostics: readEntryDiagnostics(record.entryDiagnostics),
  };
}

export function readDictionaryEntryItemData(
  value: unknown,
): DictionaryEntryItemData {
  const record = readRecord(value, "Parameter Dictionary entry item data");
  const kind = readDictionaryEntryKind(record.kind);
  if (kind === DICTIONARY_ENTRY_KIND_LEAF_V2) {
    requireExactFields(record, ["authoredExpression", "kind", "name"]);
    return {
      authoredExpression: readString(
        record.authoredExpression,
        "dictionary entry authoredExpression",
      ),
      kind,
      name: readString(record.name, "dictionary entry name"),
    };
  }
  requireExactFields(record, ["kind", "name"]);
  return {
    kind,
    name: readString(record.name, "dictionary entry name"),
  };
}

export function readDictionaryEntryItem(
  item: WorkspaceItem,
): DictionaryEntryItemData {
  const presentation = item.presentation;
  if (presentation === undefined) {
    throw new Error("Parameter Dictionary entry presentation is missing.");
  }
  if (presentation.control.kind === "group") {
    return {
      kind: DICTIONARY_ENTRY_KIND_PARENT_V2,
      name: presentation.label,
    };
  }
  return {
    authoredExpression: presentation.control.value,
    kind: DICTIONARY_ENTRY_KIND_LEAF_V2,
    name: presentation.label,
  };
}

export function ParameterDictionarySection({
  data,
  itemTree,
  sectionId,
}: {
  data: ParameterDictionarySectionData;
  itemTree: WorkspaceSectionItemTree;
  sectionId: string;
}) {
  const root = itemTree.items[itemTree.rootId];
  if (root === undefined) {
    throw new Error("The Parameter Dictionary item root is missing.");
  }
  const entryNameErrors = dictionaryEntryNameErrors(itemTree);
  const itemDiagnostics = entryDiagnosticRegistry(data, entryNameErrors);

  return (
    <div className="python-canvas-parameter-dictionary-section">
      <ItemDndContext>
        <WorkspaceItemList
          itemDiagnostics={itemDiagnostics}
          listKey={`${DICTIONARY_ITEM_LIST_KEY}:${data.dictionary.id}`}
          sectionId={sectionId}
          topLevelItemIds={root.children}
        />
      </ItemDndContext>
    </div>
  );
}

export function dictionaryEntryNameErrors(
  itemTree: WorkspaceSectionItemTree,
): Record<string, string> {
  const errors: Record<string, string> = {};
  collectDictionaryEntryNameErrors(itemTree, itemTree.rootId, errors);
  return errors;
}

function collectDictionaryEntryNameErrors(
  itemTree: WorkspaceSectionItemTree,
  parentId: string,
  errors: Record<string, string>,
): void {
  const children = dictionaryEntryChildren(itemTree, parentId);
  const siblingNames = dictionaryEntryNameCounts(children);
  for (const child of children) {
    const error = dictionaryEntryNameError(child.item, siblingNames);
    if (error !== null) {
      errors[child.id] = error;
    }
    collectDictionaryEntryNameErrors(itemTree, child.id, errors);
  }
}

function dictionaryEntryChildren(
  itemTree: WorkspaceSectionItemTree,
  parentId: string,
): Array<{ id: string; item: WorkspaceItem }> {
  const parent = requireDictionaryEntryItem(itemTree, parentId);
  return parent.children.map((childId) => ({
    id: childId,
    item: requireDictionaryEntryItem(itemTree, childId),
  }));
}

function requireDictionaryEntryItem(
  itemTree: WorkspaceSectionItemTree,
  itemId: string,
): WorkspaceItem {
  const item = itemTree.items[itemId];
  if (item === undefined) {
    throw new Error(`Parameter Dictionary item ${itemId} is missing.`);
  }
  return item;
}

function dictionaryEntryNameCounts(
  children: ReadonlyArray<{ item: WorkspaceItem }>,
): ReadonlyMap<string, number> {
  const names = new Map<string, number>();
  for (const { item } of children) {
    const name = readDictionaryEntryItem(item).name.trim();
    if (name !== "") {
      names.set(name, (names.get(name) ?? 0) + 1);
    }
  }
  return names;
}

function dictionaryEntryNameError(
  item: WorkspaceItem,
  siblingNames: ReadonlyMap<string, number>,
): string | null {
  const name = readDictionaryEntryItem(item).name;
  const normalized = name.trim();
  if (normalized === "") {
    return "Dictionary entry name is required.";
  }
  if (normalized !== name) {
    return "Dictionary entry name cannot include surrounding whitespace.";
  }
  return (siblingNames.get(normalized) ?? 0) > 1
    ? `Dictionary entry name "${normalized}" already exists under this parent.`
    : null;
}

function entryDiagnosticRegistry(
  data: ParameterDictionarySectionData,
  nameErrors: Readonly<Record<string, string>>,
): WorkspaceItemDiagnosticRegistry | undefined {
  const diagnostics: Record<string, Array<WorkspaceItemDiagnostic>> = {
    ...data.entryDiagnostics,
  };
  for (const [itemId, message] of Object.entries(nameErrors)) {
    diagnostics[itemId] = [
      ...(diagnostics[itemId] ?? []),
      { message, severity: "error" },
    ];
  }
  return Object.keys(diagnostics).length === 0 ? undefined : diagnostics;
}

function readEntryDiagnostics(
  value: unknown,
): ParameterDictionarySectionData["entryDiagnostics"] {
  const record = readRecord(value, "Parameter Dictionary entryDiagnostics");
  const diagnostics: ParameterDictionarySectionData["entryDiagnostics"] = {};
  for (const [entryId, entries] of Object.entries(record)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `Parameter Dictionary entryDiagnostics[${entryId}] must be an array.`,
      );
    }
    diagnostics[readStableId(entryId, "entryDiagnostics key")] = entries.map(
      (entry, index) => readWorkspaceDiagnostic(entry, index),
    );
  }
  return diagnostics;
}

function readWorkspaceDiagnostic(
  value: unknown,
  index: number,
): WorkspaceItemDiagnostic {
  const record = readRecord(
    value,
    `Parameter Dictionary entry diagnostic ${String(index)}`,
  );
  requireExactFields(record, ["message", "severity"]);
  if (
    record.severity !== "error" &&
    record.severity !== "warning" &&
    record.severity !== "info"
  ) {
    throw new Error(
      `Parameter Dictionary entry diagnostic ${String(index)} has an unsupported severity.`,
    );
  }
  return {
    message: readNonBlankString(
      record.message,
      `entryDiagnostics[${String(index)}].message`,
    ),
    severity: record.severity,
  };
}

function readDictionaryEntryKind(value: unknown): DictionaryEntryKindV2 {
  if (
    value === DICTIONARY_ENTRY_KIND_LEAF_V2 ||
    value === DICTIONARY_ENTRY_KIND_PARENT_V2
  ) {
    return value;
  }
  throw new Error("Parameter Dictionary entry has an unsupported kind.");
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactFields(
  value: Record<string, unknown>,
  fields: ReadonlyArray<string>,
): void {
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !keys.includes(field))
  ) {
    throw new Error(
      "Parameter Dictionary section data contains unexpected fields.",
    );
  }
}

function readStableId(value: unknown, field: string): string {
  const id = readNonBlankString(value, field);
  if (id !== id.trim()) {
    throw new Error(`${field} must not include surrounding whitespace.`);
  }
  return id;
}

function readNonBlankString(value: unknown, field: string): string {
  const text = readString(value, field);
  if (text.trim() === "") {
    throw new Error(`${field} must not be empty.`);
  }
  return text;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}
