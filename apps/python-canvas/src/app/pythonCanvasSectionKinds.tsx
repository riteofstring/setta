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
  CALLABLE_SECTION_KIND,
  CALLABLE_SECTION_SIZE,
  GENERATED_PYTHON_SECTION_ID,
  GENERATED_PYTHON_SECTION_SIZE,
  PENDING_CALLABLE_SECTION_KIND,
  createCallableParameterItem,
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
