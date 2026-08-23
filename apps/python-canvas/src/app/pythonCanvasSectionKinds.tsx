import {
  WORKSPACE_CODE_SECTION_KIND,
  createWorkspaceCodeSection,
  registerSectionKinds,
  type WorkspaceCodeSectionCompletionProvider,
  type WorkspaceDocument,
  type WorkspaceHost,
} from "@setta/workspace";

import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readCallableSectionData,
} from "../sections/CallableSection";
import {
  ParameterDictionarySection,
  readDictionaryEntryItemData,
  readParameterDictionarySectionData,
} from "../sections/ParamDictSection";
import { ListSection, readListSectionData } from "../sections/ListSection";
import {
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_ID,
  GENERATED_PYTHON_SECTION_SIZE,
  LIST_SECTION_KIND,
  LIST_SECTION_SIZE,
  PENDING_CALLABLE_SECTION_KIND,
  PENDING_LIST_SECTION_KIND,
  PENDING_PARAMETER_DICTIONARY_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_SIZE,
  createCallableParameterItem,
  createParameterDictionaryEntryItem,
  readCallableParameterRows,
} from "./workspaceProjection";
import { PythonTargetCompletionBoundary } from "./PythonTargetCompletionBoundary";

const CALLABLE_SECTION_SIZE_CONSTRAINTS = {
  minHeight: 104,
  maxHeight: 100_000,
  minWidth: 200,
  maxWidth: 100_000,
} as const;

const PARAMETER_DICTIONARY_SECTION_SIZE_CONSTRAINTS = {
  minHeight: 78,
  maxHeight: 100_000,
  minWidth: 200,
  maxWidth: 100_000,
} as const;

const LIST_SECTION_SIZE_CONSTRAINTS = {
  minHeight: 50,
  maxHeight: 50,
  minWidth: 200,
  maxWidth: 100_000,
} as const;

function canNestInList(
  section: WorkspaceDocument["sections"][string],
): boolean {
  return (
    section.kind === CALLABLE_SECTION_KIND ||
    section.kind === PARAMETER_DICTIONARY_SECTION_KIND ||
    section.kind === LIST_SECTION_KIND
  );
}

export function registerPythonCanvasSectionKinds(
  host: WorkspaceHost,
  pythonTargetCompletionProvider?: WorkspaceCodeSectionCompletionProvider,
): void {
  const pythonTargetSection = createWorkspaceCodeSection({
    completionProvider: pythonTargetCompletionProvider,
    defaultSize: GENERATED_PYTHON_SECTION_SIZE,
    languages: ["python"],
  });
  const callableItemArea = {
    renderLeadingContent: (section: WorkspaceDocument["sections"][string]) => {
      const data = readCallableSectionData(section.data);
      return <CallableExpressionField data={data} sectionId={section.id} />;
    },
  };
  const callableSectionKind = {
    defaultSize: CALLABLE_SECTION_SIZE,
    sizeConstraints: CALLABLE_SECTION_SIZE_CONSTRAINTS,
    assertValidData: (section: WorkspaceDocument["sections"][string]) => {
      readCallableSectionData(section.data);
    },
    getItemSearchableText: (context: { item: { data?: unknown } }) =>
      parameterItemSearchableText(context.item),
    renderContent: (section: WorkspaceDocument["sections"][string]) => {
      const data = readCallableSectionData(section.data);
      return (
        <CallableSection
          data={data}
          parameters={readCallableParameterRows(section)}
          sectionId={section.id}
        />
      );
    },
  };
  const parameterDictionarySectionKind = {
    defaultSize: PARAMETER_DICTIONARY_SECTION_SIZE,
    sizeConstraints: PARAMETER_DICTIONARY_SECTION_SIZE_CONSTRAINTS,
    assertValidData: (section: WorkspaceDocument["sections"][string]) => {
      readParameterDictionarySectionData(section.data);
    },
    getItemSearchableText: (context: { item: { data?: unknown } }) =>
      readDictionaryEntryItemData(context.item.data).name,
    renderContent: (section: WorkspaceDocument["sections"][string]) => {
      const itemTree = section.itemTree;
      if (itemTree === undefined) {
        throw new Error("Parameter Dictionary section has no item tree.");
      }
      return (
        <ParameterDictionarySection
          data={readParameterDictionarySectionData(section.data)}
          itemTree={itemTree}
          sectionId={section.id}
        />
      );
    },
  };
  const listSectionKind = {
    contentClassName: "contents",
    defaultSize: LIST_SECTION_SIZE,
    sizeConstraints: LIST_SECTION_SIZE_CONSTRAINTS,
    nestedSections: "vertical" as const,
    canAcceptNestedSection: canNestInList,
    deleteActionLabel: "Delete list and all nested descendants",
    assertValidData: (section: WorkspaceDocument["sections"][string]) => {
      readListSectionData(section.data);
    },
    renderContent: (section: WorkspaceDocument["sections"][string]) => (
      <ListSection data={readListSectionData(section.data)} />
    ),
  };
  registerSectionKinds(host, {
    [CALLABLE_SECTION_KIND]: {
      ...callableSectionKind,
      itemArea: {
        ...callableItemArea,
        toolbar: "authoring-and-filter",
      },
      createItem: () => createCallableParameterItem(),
    },
    [PENDING_CALLABLE_SECTION_KIND]: {
      ...callableSectionKind,
      itemArea: {
        ...callableItemArea,
        toolbar: "filter-only",
      },
    },
    [PARAMETER_DICTIONARY_SECTION_KIND]: {
      ...parameterDictionarySectionKind,
      itemArea: {
        toolbar: "authoring-and-filter",
      },
      createItem: () => createParameterDictionaryEntryItem(),
    },
    [PENDING_PARAMETER_DICTIONARY_SECTION_KIND]: {
      ...parameterDictionarySectionKind,
      itemArea: {
        toolbar: "filter-only",
      },
    },
    [LIST_SECTION_KIND]: listSectionKind,
    [PENDING_LIST_SECTION_KIND]: listSectionKind,
    [WORKSPACE_CODE_SECTION_KIND]: {
      ...pythonTargetSection,
      renderContent: (section) =>
        section.id === GENERATED_PYTHON_SECTION_ID ? (
          <PythonTargetCompletionBoundary>
            {pythonTargetSection.renderContent(section)}
          </PythonTargetCompletionBoundary>
        ) : (
          pythonTargetSection.renderContent(section)
        ),
    },
  });
}
