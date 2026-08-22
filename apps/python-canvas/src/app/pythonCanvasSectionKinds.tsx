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
    defaultSize: LIST_SECTION_SIZE,
    nestedSections: "vertical" as const,
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
