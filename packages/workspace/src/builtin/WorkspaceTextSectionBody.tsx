import { useCallback } from "react";
import { getSectionOrThrow } from "../document/documentSelectors.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import type { WorkspaceSection } from "../document/types.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import {
  NO_DRAG_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction.js";
import { useIsScrollable } from "../useIsScrollable.js";
import {
  getWorkspaceTextSectionData,
  setWorkspaceTextSectionData,
} from "./textSectionActions.js";
import {
  getWorkspaceTextSectionEditorLanguage,
  parseWorkspaceTextSectionData,
  type WorkspaceTextSectionChoices,
  type WorkspaceTextSectionData,
} from "./textSectionData.js";
import {
  buildWorkspaceTextTypographyScale,
  getWorkspaceTextTypographyStyle,
} from "./textSectionTypography.js";
import {
  EDITABLE_SECTION_EDITOR_PRESENTATION,
  READ_ONLY_SECTION_EDITOR_PRESENTATION,
  type WorkspaceSectionEditorChange,
} from "./sectionEditorExtensions.js";
import { WorkspaceMarkdown } from "./WorkspaceMarkdown.js";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor.js";

const RENDERED_WRAPPER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} -mt-1 mb-3 ms-4 -me-px cursor-auto select-text overflow-y-scroll pe-4 [&_.setta-prose]:p-0`;

const PLAIN_TEXT_CLASS_NAME =
  "overflow-x-clip whitespace-pre-wrap break-words text-setta-700 dark:text-setta-300";

const EDITOR_INDENT_WIDTH = 4;

const NO_EDITOR_DIAGNOSTICS = [] as const;

type WorkspaceTextSectionBodyProps = {
  section: WorkspaceSection;
  choices: WorkspaceTextSectionChoices;
};

export function WorkspaceTextSectionBody({
  section,
  choices,
}: WorkspaceTextSectionBodyProps) {
  const host = useWorkspaceHost();
  const data = parseWorkspaceTextSectionData(section.id, section.data, choices);
  return data.displayMode === "render" ? (
    <RenderedText data={data} />
  ) : (
    <TextSectionEditor data={data} host={host} section={section} />
  );
}

function RenderedText({ data }: { data: WorkspaceTextSectionData }) {
  const { ref, isScrollable } = useIsScrollable();
  const typographyStyle = getWorkspaceTextTypographyStyle(
    buildWorkspaceTextTypographyScale(data.fontSizePx),
  );

  const className = `${RENDERED_WRAPPER_CLASS_NAME} ${isScrollable ? NO_WHEEL_CLASS_NAME : ""}`;

  if (data.format === "markdown") {
    return (
      <div className={className} ref={ref} style={typographyStyle}>
        <WorkspaceMarkdown text={data.text} />
      </div>
    );
  }

  return (
    <div className={className} ref={ref} style={typographyStyle}>
      <pre
        className={PLAIN_TEXT_CLASS_NAME}
        style={{ fontSize: "var(--setta-workspace-text-body-size)" }}
      >
        {data.text}
      </pre>
    </div>
  );
}

function TextSectionEditor({
  data,
  host,
  section,
}: {
  data: WorkspaceTextSectionData;
  host: ReturnType<typeof useWorkspaceHost>;
  section: WorkspaceSection;
}) {
  const sectionId = section.id;

  const isReadOnly = data.readOnly || section.positionAndSizeLocked;
  const presentation = isReadOnly
    ? READ_ONLY_SECTION_EDITOR_PRESENTATION
    : EDITABLE_SECTION_EDITOR_PRESENTATION;

  const onChange = useCallback(
    ({ text: nextText }: WorkspaceSectionEditorChange) => {
      const liveSection = getSectionOrThrow(
        getWorkspaceDocumentStore(host).getState(),
        sectionId,
      );
      const liveData = getWorkspaceTextSectionData(host, sectionId);
      if (
        liveData.readOnly ||
        liveSection.positionAndSizeLocked ||
        liveData.text === nextText
      ) {
        return;
      }
      setWorkspaceTextSectionData(host, sectionId, {
        ...liveData,
        text: nextText,
      });
    },
    [host, sectionId],
  );

  return (
    <WorkspaceSectionEditor
      ariaLabel={
        isReadOnly
          ? `${section.name} text, read-only`
          : `${section.name} text editor`
      }
      diagnostics={NO_EDITOR_DIAGNOSTICS}
      indentWidth={EDITOR_INDENT_WIDTH}
      language={getWorkspaceTextSectionEditorLanguage(data.format)}
      lineNumbers
      onChange={onChange}
      presentation={presentation}
      sectionId={sectionId}
      value={data.text}
      wrapLines
    />
  );
}
