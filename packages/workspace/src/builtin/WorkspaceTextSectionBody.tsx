import { useCallback } from "react";
import { getSectionOrThrow } from "../document/documentSelectors";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { useWorkspaceHost } from "../workspaceHostContext";
import {
  NO_DRAG_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction";
import { useIsScrollable } from "../useIsScrollable";
import {
  getWorkspaceTextSectionData,
  setWorkspaceTextSectionData,
} from "./textSectionActions";
import {
  getWorkspaceTextSectionEditorLanguage,
  parseWorkspaceTextSectionData,
  type WorkspaceTextSectionChoices,
  type WorkspaceTextSectionData,
} from "./textSectionData";
import {
  buildWorkspaceTextTypographyScale,
  getWorkspaceTextTypographyStyle,
} from "./textSectionTypography";
import { WorkspaceMarkdown } from "./WorkspaceMarkdown";
import { WorkspaceSectionEditor } from "./WorkspaceSectionEditor";

// The built-in Text section body: the reference's `TextBlock`, which renders either its Markdown
// surface or its plain-text block, and otherwise mounts the same section-scale editor the Code
// Editor section uses. Switching modes swaps the surface; it never rewrites the text, so a mode
// round trip is not a document change.

// The reference's rendered wrapper. Its `-mr-[13px] pr-4 ml-1` offsets sit inside a section grid
// whose gutters the package's body slot does not have, so the same painted inset is authored
// directly: the scroller starts one gutter plus the reference's `ml-1` in from the section edge,
// runs a pixel past the opposite edge, and keeps the reference's padding so its scrollbar rides
// in the padding rather than over the text.
const RENDERED_WRAPPER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} -mt-1 mb-3 ms-4 -me-px cursor-auto select-text overflow-y-scroll pe-4 [&_.setta-prose]:p-0`;

// The reference's plain-text branch: a `pre` that wraps instead of scrolling sideways, so long
// prose lines stay readable while the authored whitespace survives.
const PLAIN_TEXT_CLASS_NAME =
  "overflow-x-clip whitespace-pre-wrap break-words text-setta-700 dark:text-setta-300";

// The reference's in-section Markdown editor wraps its lines and indents by four, and neither is
// authored: prose has no column to preserve, and the reference reaches the same width through
// `basicSetup.tabSize`. Its gutters are the ones `basicSetup` mounts by default.
const EDITOR_INDENT_WIDTH = 4;

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
  // The rendered surface takes wheel ownership only once it can actually scroll, so a short
  // text block still pans and zooms the canvas under the pointer.
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
  // Locking a section locks its content too, so a locked text section reads and scrolls but
  // cannot be edited.
  const isReadOnly = data.readOnly || section.positionAndSizeLocked;

  const onChange = useCallback(
    (nextText: string) => {
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
      ariaLabel={`${section.name} text editor`}
      indentWidth={EDITOR_INDENT_WIDTH}
      isReadOnly={isReadOnly}
      language={getWorkspaceTextSectionEditorLanguage(data.format)}
      lineNumbers
      onChange={onChange}
      sectionId={sectionId}
      value={data.text}
      wrapLines
    />
  );
}
