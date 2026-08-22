import {
  ItemDndContext,
  ItemNameEditor,
  TextValueEditor,
  WorkspaceItemList,
  type ItemRowRenderContext,
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
import { usePythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";

const DICTIONARY_ITEM_LIST_KEY = "python-canvas-parameter-dictionary";
const unnamedEntryLabel = "Unnamed entry";

export type ParameterDictionarySectionData = {
  dictionary: {
    id: string;
    name: string;
  };
  entryDiagnostics: Record<string, Array<WorkspaceItemDiagnostic>>;
};

export type DictionaryEntryItemData =
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

  return (
    <div className="python-canvas-parameter-dictionary-section">
      <ItemDndContext>
        <WorkspaceItemList
          isGroupItem={isDictionaryEntryGroup}
          itemDiagnostics={entryDiagnosticRegistry(data)}
          listKey={`${DICTIONARY_ITEM_LIST_KEY}:${data.dictionary.id}`}
          renderItem={(context) => (
            <DictionaryEntryRow
              context={context}
              dictionaryId={data.dictionary.id}
              nameError={entryNameErrors[context.item.id] ?? ""}
            />
          )}
          sectionId={sectionId}
          topLevelItemIds={root.children}
        />
      </ItemDndContext>
    </div>
  );
}

function DictionaryEntryRow({
  context,
  dictionaryId,
  nameError,
}: {
  context: ItemRowRenderContext;
  dictionaryId: string;
  nameError: string;
}) {
  const mutation = usePythonCanvasMutationContext();
  const data = readDictionaryEntryItemData(context.item.data);
  const isParent = isDictionaryEntryGroup(context.item);
  const label = data.name === "" ? unnamedEntryLabel : data.name;

  return (
    <>
      <ItemNameEditor
        errorMessage={nameError}
        hasChildren={isParent}
        itemId={context.item.id}
        language="python"
        name={data.name}
        onNameChange={(name) =>
          mutation.onDictionaryEntryNameChange(
            dictionaryId,
            context.item.id,
            name,
          )
        }
        sectionId={context.sectionId}
      />
      {isParent ? null : (
        <TextValueEditor
          ariaLabel={`${label} expression`}
          controlId={context.item.id}
          language="python"
          onValueChange={(value) =>
            mutation.onDictionaryEntryExpressionChange(
              dictionaryId,
              context.item.id,
              value,
            )
          }
          presentation="item-row"
          sectionId={context.sectionId}
          singleLine
          value={
            data.kind === DICTIONARY_ENTRY_KIND_LEAF_V2
              ? data.authoredExpression
              : ""
          }
          wrapLines={false}
        />
      )}
    </>
  );
}

export function dictionaryEntryNameErrors(
  itemTree: WorkspaceSectionItemTree,
): Record<string, string> {
  const errors: Record<string, string> = {};

  function visit(parentId: string) {
    const parent = itemTree.items[parentId];
    if (parent === undefined) {
      throw new Error(`Parameter Dictionary item ${parentId} is missing.`);
    }
    const names = new Map<string, number>();
    for (const childId of parent.children) {
      const child = itemTree.items[childId];
      if (child === undefined) {
        throw new Error(`Parameter Dictionary item ${childId} is missing.`);
      }
      const name = readDictionaryEntryItemData(child.data).name.trim();
      if (name !== "") {
        names.set(name, (names.get(name) ?? 0) + 1);
      }
    }
    for (const childId of parent.children) {
      const child = itemTree.items[childId];
      if (child === undefined) {
        throw new Error(`Parameter Dictionary item ${childId} is missing.`);
      }
      const name = readDictionaryEntryItemData(child.data).name;
      const normalized = name.trim();
      if (normalized === "") {
        errors[childId] = "Dictionary entry name is required.";
      } else if (normalized !== name) {
        errors[childId] =
          "Dictionary entry name cannot include surrounding whitespace.";
      } else if ((names.get(normalized) ?? 0) > 1) {
        errors[childId] = `Dictionary entry name "${normalized}" already exists under this parent.`;
      }
      visit(childId);
    }
  }

  visit(itemTree.rootId);
  return errors;
}

export function isDictionaryEntryGroup(item: WorkspaceItem): boolean {
  return (
    item.children.length > 0 ||
    readDictionaryEntryItemData(item.data).kind ===
      DICTIONARY_ENTRY_KIND_PARENT_V2
  );
}

function entryDiagnosticRegistry(
  data: ParameterDictionarySectionData,
): WorkspaceItemDiagnosticRegistry | undefined {
  return Object.keys(data.entryDiagnostics).length === 0
    ? undefined
    : data.entryDiagnostics;
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
    throw new Error("Parameter Dictionary section data contains unexpected fields.");
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
