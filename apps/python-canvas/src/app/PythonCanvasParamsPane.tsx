import {
  WorkspaceParameterConfigurationView,
  useWorkspaceDocumentSnapshot,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "@riteofstring/setta";

import {
  CALLABLE_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_KIND,
} from "./workspaceProjection";

type PythonCanvasParamsPaneModel = {
  section: WorkspaceSection;
};

export function getPythonCanvasParamsPaneModel(
  document: WorkspaceDocument,
): PythonCanvasParamsPaneModel | null {
  if (document.activeIds.length !== 1) {
    return null;
  }
  const activeSectionId = document.activeIds[0];
  if (activeSectionId === undefined) {
    return null;
  }
  const section = document.sections[activeSectionId];
  if (
    section === undefined ||
    section.itemTree === undefined ||
    (section.kind !== CALLABLE_SECTION_KIND &&
      section.kind !== PARAMETER_DICTIONARY_SECTION_KIND)
  ) {
    return null;
  }
  return { section };
}

export function PythonCanvasParamsPane() {
  const document = useWorkspaceDocumentSnapshot();
  const model = getPythonCanvasParamsPaneModel(document);
  if (model === null) {
    return null;
  }
  return <WorkspaceParameterConfigurationView sectionId={model.section.id} />;
}
