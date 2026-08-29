import type { ReactNode } from "react";
import {
  getRegisteredSectionKindOrThrow,
  getWorkspaceItemAreaPresentationOrThrow,
  type SectionKindDefinition,
} from "../../document/sectionKindRegistry";
import type { WorkspaceSection } from "../../document/types";
import { WorkspaceItemToolbar } from "../../items/WorkspaceItemToolbar";
import { WorkspaceItemFilterProvider } from "../../items/WorkspaceItemFilterContext";
import { SectionHeader } from "../header/SectionHeader";
import { CustomResizable } from "../resize/CustomResizable";
import { DEFAULT_SECTION_BG_COLOR } from "../sectionColors";
import { MetaControlChrome } from "./MetaControlChrome";
import type { WorkspaceHost } from "../../workspaceHost";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { WorkspaceSectionWindowPlaceholder } from "../../windowing/WorkspaceSectionWindowPlaceholder";
import {
  focusOrReopenWorkspaceWindow,
  getExternalWorkspaceSectionWindowBinding,
} from "../../windowing/workspaceSectionWindowing";
import { moveWorkspaceWindowToCanvasSection } from "../../windowing/windowingState";
import { useOptionalWorkspaceWindowing } from "../../windowing/workspaceWindowingContext";

// The reference's `SectionContainerCoreResizabe`, cut at the renderer seam: application area
// renderers, chat windowing, and section-window placeholders are replaced by registered content.
// The meta-control presentation restores its package-owned headerless chrome at that seam. An
// ordinary minimized section keeps its header and drops its body like the reference's `AreaSwitch`.
type SectionContainerContentProps = {
  section: WorkspaceSection;
  hasSectionStyleTheme: boolean;
};

type WorkspaceSectionBodyContentProps = {
  definition: SectionKindDefinition;
  section: WorkspaceSection;
  hasSectionStyleTheme: boolean;
};

export function SectionContainerContent({
  section,
  hasSectionStyleTheme,
}: SectionContainerContentProps) {
  const host = useWorkspaceHost();
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  const windowing = useOptionalWorkspaceWindowing();
  const externalWindow = windowing
    ? getExternalWorkspaceSectionWindowBinding(windowing.state, section.id)
    : null;
  const metaControlPresentation =
    definition.presentation?.type === "meta-control"
      ? definition.presentation
      : null;
  const isMetaControl = metaControlPresentation !== null;

  return (
    <CustomResizable
      sectionId={section.id}
      bgColor={isMetaControl ? "bg-transparent" : DEFAULT_SECTION_BG_COLOR}
      positionAndSizeLocked={section.positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      isMetaControl={isMetaControl}
    >
      {metaControlPresentation ? (
        <MetaControlChrome
          section={section}
          onEdit={metaControlPresentation.onEdit}
        />
      ) : (
        <SectionHeader
          sectionId={section.id}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      )}
      {externalWindow && windowing ? (
        <WorkspaceSectionWindowPlaceholder
          dataTestId="section-canvas-window-placeholder"
          layoutEditable={windowing.layoutEditable}
          onFocusWindow={(windowId) =>
            windowing.onStateChange(
              focusOrReopenWorkspaceWindow(windowing.state, windowId),
            )
          }
          onShowInCanvas={(windowId) =>
            windowing.onStateChange(
              moveWorkspaceWindowToCanvasSection(windowing.state, windowId, {
                layoutEditable: windowing.layoutEditable,
              }),
            )
          }
          sectionId={section.id}
          windowId={externalWindow.id}
        />
      ) : (
        <WorkspaceSectionBodyContent
          definition={definition}
          section={section}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      )}
    </CustomResizable>
  );
}

/**
 * The single registered section-body composition shared by canvas and window
 * surfaces. It deliberately excludes canvas geometry, refs, and DnD chrome.
 */
export function WorkspaceSectionBodyContent({
  definition,
  section,
  hasSectionStyleTheme,
}: WorkspaceSectionBodyContentProps) {
  const host = useWorkspaceHost();
  if (section.isMinimized) {
    return null;
  }
  const content = definition.renderContent(section);
  if (definition.presentation?.type === "meta-control") {
    return <>{content}</>;
  }
  const itemTreeClassName = section.itemTree ? " flex min-h-0 flex-col" : "";
  const bodySlotClassName = definition.contentClassName
    ? `section-full-no-title${itemTreeClassName} ${definition.contentClassName}`
    : `section-full-no-title${itemTreeClassName}`;
  return (
    <div className={bodySlotClassName}>
      {section.itemTree
        ? renderItemArea(host, section, content, hasSectionStyleTheme)
        : content}
    </div>
  );
}

// The one public item-area order: application leading content, the declared toolbar, then the
// registered item content — all inside the single package-owned item-filter provider.
function renderItemArea(
  host: WorkspaceHost,
  section: WorkspaceSection,
  content: ReactNode,
  hasSectionStyleTheme: boolean,
) {
  const itemArea = getWorkspaceItemAreaPresentationOrThrow(host, section);
  // The toolbar's compact spacing belongs to this composition rather than to the declared mode,
  // and the declared leading renderer is what selects it. The slot stays content-agnostic: its
  // return value is rendered and never inspected.
  return (
    <WorkspaceItemFilterProvider
      hasSectionStyleTheme={hasSectionStyleTheme}
      sectionId={section.id}
    >
      {itemArea.renderLeadingContent?.(section)}
      {itemArea.toolbar === "hidden" ? null : (
        <WorkspaceItemToolbar
          followsLeadingContent={itemArea.renderLeadingContent !== undefined}
          mode={itemArea.toolbar}
          sectionId={section.id}
        />
      )}
      {content}
    </WorkspaceItemFilterProvider>
  );
}
