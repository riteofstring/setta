import { useCallback, useMemo, useRef } from "react";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  getWorkspaceCodeSectionData,
  setWorkspaceCodeSectionData,
} from "./codeSectionActions";
import {
  getWorkspaceCodeSectionEditorLanguage,
  parseWorkspaceCodeSectionData,
  type WorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
  type WorkspaceGeneratedRegion,
} from "./codeSectionData";
import type { WorkspaceCodeSectionCompletionProvider } from "./codeSectionCompletion";
import {
  EDITABLE_SECTION_EDITOR_PRESENTATION,
  READ_ONLY_SECTION_EDITOR_PRESENTATION,
  type WorkspaceSectionEditorChange,
  type WorkspaceSectionEditorPresentation,
} from "./sectionEditorExtensions";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor";

function resolveEditorPresentation(
  generatedRegion: WorkspaceGeneratedRegion | null,
  isReadOnlyMode: boolean,
  isLocked: boolean,
): WorkspaceSectionEditorPresentation {
  if (generatedRegion !== null) {
    return {
      mode: "generated-document",
      outerEditable: !isLocked,
      region: generatedRegion,
    };
  }
  return isReadOnlyMode || isLocked
    ? READ_ONLY_SECTION_EDITOR_PRESENTATION
    : EDITABLE_SECTION_EDITOR_PRESENTATION;
}

function resolveEditorAriaLabel(
  sectionName: string,
  presentation: WorkspaceSectionEditorPresentation,
): string {
  if (presentation.mode === "generated-document") {
    return presentation.outerEditable
      ? `${sectionName} code editor, generated output read-only`
      : `${sectionName} generated code, read-only`;
  }
  if (presentation.mode === "read-only") {
    return `${sectionName} code, read-only`;
  }
  return `${sectionName} code editor`;
}

function nextCodeSectionData(
  liveData: WorkspaceCodeSectionData,
  change: WorkspaceSectionEditorChange,
): WorkspaceCodeSectionData | null {
  if (liveData.mode === "editable") {
    return liveData.code === change.text
      ? null
      : { ...liveData, code: change.text, diagnostics: [] };
  }
  if (
    liveData.mode !== "generated-document" ||
    change.generatedRegion === null
  ) {
    return null;
  }
  const region = change.generatedRegion;
  const held = liveData.generatedRegion;
  if (
    liveData.code === change.text &&
    held.from === region.from &&
    held.to === region.to
  ) {
    return null;
  }
  return {
    ...liveData,
    code: change.text,
    diagnostics: [],
    generatedRegion: region,
  };
}

type WorkspaceCodeSectionBodyProps = {
  section: WorkspaceSection;
  allowedLanguages: ReadonlyArray<WorkspaceCodeSectionLanguage>;
  completionProvider?: WorkspaceCodeSectionCompletionProvider;
  onSubmit?: (sectionId: string, data: WorkspaceCodeSectionData) => void;
};

export function WorkspaceCodeSectionBody({
  section,
  allowedLanguages,
  completionProvider,
  onSubmit,
}: WorkspaceCodeSectionBodyProps) {
  const host = useWorkspaceHost();
  const sectionId = section.id;
  const data = parseWorkspaceCodeSectionData(
    sectionId,
    section.data,
    allowedLanguages,
  );

  const isReadOnlyMode = data.mode === "read-only";
  const isLocked = section.positionAndSizeLocked;
  const regionFrom =
    data.mode === "generated-document" ? data.generatedRegion.from : null;
  const regionTo =
    data.mode === "generated-document" ? data.generatedRegion.to : null;
  const presentation = useMemo(
    () =>
      resolveEditorPresentation(
        regionFrom === null || regionTo === null
          ? null
          : { from: regionFrom, to: regionTo },
        isReadOnlyMode,
        isLocked,
      ),
    [isLocked, isReadOnlyMode, regionFrom, regionTo],
  );

  const diagnosticsSignature = JSON.stringify(data.diagnostics);
  const diagnosticsRef = useRef({
    signature: diagnosticsSignature,
    value: data.diagnostics,
  });
  if (diagnosticsRef.current.signature !== diagnosticsSignature) {
    diagnosticsRef.current = {
      signature: diagnosticsSignature,
      value: data.diagnostics,
    };
  }
  const diagnostics = diagnosticsRef.current.value;

  const onChange = useCallback(
    (change: WorkspaceSectionEditorChange) => {
      const liveSection = getSectionOrThrow(
        getWorkspaceDocumentStore(host).getState(),
        sectionId,
      );
      if (liveSection.positionAndSizeLocked) {
        return;
      }
      const liveData = getWorkspaceCodeSectionData(host, sectionId);
      const nextData = nextCodeSectionData(liveData, change);
      if (nextData !== null) {
        setWorkspaceCodeSectionData(host, sectionId, nextData);
      }
    },
    [host, sectionId],
  );

  const handleSubmit = useCallback(
    (change: WorkspaceSectionEditorChange) => {
      if (onSubmit === undefined) {
        return;
      }
      const liveSection = getSectionOrThrow(
        getWorkspaceDocumentStore(host).getState(),
        sectionId,
      );
      if (liveSection.positionAndSizeLocked) {
        return;
      }
      const liveData = getWorkspaceCodeSectionData(host, sectionId);
      const nextData = nextCodeSectionData(liveData, change) ?? liveData;
      if (nextData !== liveData) {
        setWorkspaceCodeSectionData(host, sectionId, nextData);
      }
      onSubmit(sectionId, nextData);
    },
    [host, onSubmit, sectionId],
  );

  return (
    <WorkspaceSectionEditor
      ariaLabel={resolveEditorAriaLabel(section.name, presentation)}
      completionLanguage={data.language}
      completionProvider={completionProvider}
      indentWidth={data.indentWidth}
      language={getWorkspaceCodeSectionEditorLanguage(data.language)}
      lineNumbers={data.lineNumbers}
      diagnostics={diagnostics}
      onChange={onChange}
      onSubmit={onSubmit === undefined ? undefined : handleSubmit}
      presentation={presentation}
      sectionId={sectionId}
      value={data.code}
      wrapLines={data.wrapLines}
    />
  );
}
