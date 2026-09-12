import type { WorkspaceDocument } from "@setta/workspace";

import projectSnapshotFixture from "@setta/python-canvas/project-snapshot-v2.json";
import type {
  DictionaryEntryV2,
  ParameterV2,
} from "../backend/generatedContract";
import { parseProjectSnapshotV2 } from "../backend/runtimeContract";
import {
  callableSectionID,
  dictionaryEntryWorkspaceItemID,
  parameterDictionarySectionID,
  parameterWorkspaceItemID,
  readCallableParameterItems,
} from "./workspaceProjection";

export const CODE_UI = {
  type: "CodeParam",
  configuration: {
    disabled: false,
    language: "python",
    placeholder: null,
    singleLine: true,
    wrapLines: true,
  },
} as const;

export function callableSnapshot(
  revision: number,
  parameters: Array<ParameterV2>,
  authoredExpression = "fixture.initial",
  name = "One callable",
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: [
      {
        authoredExpression,
        id: "callable:one",
        name,
        parameters,
      },
    ],
    topLevelSectionIds: ["callable:one"],
    project: { ...projectSnapshotFixture.project, revision },
  });
}

export function dictionarySnapshot(
  revision: number,
  entries: DictionaryEntryV2[],
) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    parameterDictionaries: [
      { entries, id: "dictionary:options", name: "Options" },
    ],
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds: ["dictionary:options"],
  });
}

export function listSnapshot(revision: number, childSectionIds: string[]) {
  return parseProjectSnapshotV2({
    ...projectSnapshotFixture,
    callables: childSectionIds.map((id) => ({
      authoredExpression: "",
      id,
      name: "New callable",
      parameters: [],
    })),
    lists: [{ childSectionIds, id: "list:objects", name: "Objects" }],
    project: { ...projectSnapshotFixture.project, revision },
    topLevelSectionIds: ["list:objects"],
  });
}

export function providerParameter(id: string, authoredExpression: string) {
  return {
    authoredExpression,
    default: null,
    id,
    name: "value",
    nameEditable: false,
    passingStyle: "positional_or_keyword" as const,
    providerOrdinal: 0,
    typeAnnotation: "float",
    ui: CODE_UI,
  };
}

export function authoredParameter(
  id: string,
  name: string,
  authoredExpression: string,
) {
  return {
    authoredExpression,
    default: null,
    id,
    name,
    nameEditable: true,
    passingStyle: "positional_or_keyword" as const,
    providerOrdinal: null,
    typeAnnotation: null,
    ui: CODE_UI,
  };
}

export function changeParameterExpression(
  document: WorkspaceDocument,
  callableId: string,
  parameterId: string,
  authoredExpression: string,
): WorkspaceDocument {
  const sectionId = callableSectionID(callableId);
  const itemId = parameterWorkspaceItemID(parameterId);
  const section = document.sections[sectionId];
  const item = section?.itemTree?.items[itemId];
  if (section?.itemTree === undefined || item === undefined) {
    throw new Error(`Missing parameter ${parameterId}.`);
  }
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...section.itemTree,
          items: {
            ...section.itemTree.items,
            [itemId]: {
              ...item,
              presentation: {
                ...item.presentation!,
                control: {
                  ...(item.presentation!.control as Exclude<
                    NonNullable<typeof item.presentation>["control"],
                    { kind: "group" }
                  >),
                  value: authoredExpression,
                },
              },
            },
          },
        },
      },
    },
  };
}

export function appendParameter(
  document: WorkspaceDocument,
  callableId: string,
  parameter: ReturnType<typeof authoredParameter>,
): WorkspaceDocument {
  const sectionId = callableSectionID(callableId);
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  const root = itemTree?.items[itemTree.rootId];
  if (section === undefined || itemTree === undefined || root === undefined) {
    throw new Error(`Missing parameter list for ${callableId}.`);
  }
  const { id } = parameter;
  const itemId = parameterWorkspaceItemID(id);
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: {
            ...itemTree.items,
            [root.id]: {
              ...root,
              children: [...root.children, itemId],
            },
            [itemId]: {
              children: [],
              id: itemId,
              presentation: {
                control: {
                  kind: "code",
                  value: parameter.authoredExpression,
                  configuration: {
                    ...CODE_UI.configuration,
                    autocomplete: "off",
                  },
                },
                label: parameter.name,
                labelEditable: true,
              },
            },
          },
        },
      },
    },
  };
}

export function appendDictionaryEntry(
  document: WorkspaceDocument,
  dictionaryId: string,
  entry: DictionaryEntryV2,
): WorkspaceDocument {
  const sectionId = parameterDictionarySectionID(dictionaryId);
  const section = document.sections[sectionId];
  const itemTree = section?.itemTree;
  const root = itemTree?.items[itemTree.rootId];
  if (section === undefined || itemTree === undefined || root === undefined) {
    throw new Error(`Missing dictionary entry list for ${dictionaryId}.`);
  }
  if (entry.kind !== "leaf") {
    throw new Error("This test helper accepts only dictionary leaf entries.");
  }
  const itemId = dictionaryEntryWorkspaceItemID(entry.id);
  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: {
            ...itemTree.items,
            [root.id]: { ...root, children: [...root.children, itemId] },
            [itemId]: {
              children: [],
              presentation: {
                control: {
                  kind: "code",
                  value: entry.authoredExpression,
                  configuration: {
                    ...CODE_UI.configuration,
                    autocomplete: "off",
                  },
                },
                label: entry.name,
                labelEditable: true,
              },
              id: itemId,
            },
          },
        },
      },
    },
  };
}

export function parameterIds(document: WorkspaceDocument, callableId: string) {
  return readCallableParameterItems(document, callableId).map(
    (parameter) => parameter.id,
  );
}

export function pushedCallableSnapshots() {
  const created = parseProjectSnapshotV2({
    ...callableSnapshot(2, [], "", "CLI live demo"),
    diagnosticsRevision: 2,
  });
  const committed = parseProjectSnapshotV2({
    ...created,
    callables: [
      {
        ...created.callables[0],
        authoredExpression: "math.fabs",
      },
    ],
    diagnostics: [
      {
        end: 9,
        id: "diagnostic:callable-warning",
        message: "The callable has not resolved yet.",
        severity: "warning",
        start: 0,
        targetId: "callable:one",
      },
    ],
    diagnosticsRevision: 3,
    project: { ...created.project, revision: 3 },
  });
  const refreshed = parseProjectSnapshotV2({
    ...committed,
    callables: [
      {
        ...committed.callables[0],
        parameters: [
          {
            ...providerParameter("parameter:x", ""),
            name: "x",
          },
        ],
      },
    ],
    diagnostics: [
      {
        end: 1,
        id: "diagnostic:required-x",
        message: "Value is required.",
        severity: "error",
        start: 0,
        targetId: "parameter:x",
      },
    ],
    diagnosticsRevision: 4,
    project: { ...committed.project, revision: 4 },
  });
  const parameter = refreshed.callables[0]?.parameters[0];
  if (parameter === undefined) {
    throw new Error("The pushed callable fixture has no refreshed parameter.");
  }
  const completed = parseProjectSnapshotV2({
    ...refreshed,
    callables: [
      {
        ...refreshed.callables[0],
        parameters: [{ ...parameter, authoredExpression: "-12.5" }],
      },
    ],
    diagnostics: [],
    diagnosticsRevision: 5,
    project: { ...refreshed.project, revision: 5 },
  });
  return { committed, completed, created, refreshed };
}
