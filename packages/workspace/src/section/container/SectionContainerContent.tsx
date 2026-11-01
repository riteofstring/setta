import type { ReactNode } from "react";
import {
  getRegisteredSectionKindOrThrow,
  getWorkspaceItemAreaPresentationOrThrow,
  type SectionKindDefinition,
} from "../../document/sectionKindRegistry.js";
import type { WorkspaceSection } from "../../document/types.js";
import { WorkspaceItemToolbar } from "../../items/WorkspaceItemToolbar.js";
import { WorkspaceItemFilterProvider } from "../../items/WorkspaceItemFilterContext.js";
import { SectionHeader } from "../header/SectionHeader.js";
import { CustomResizable } from "../resize/CustomResizable.js";
import { DEFAULT_SECTION_BG_COLOR } from "../sectionColors.js";
import { MetaControlChrome } from "./MetaControlChrome.js";
import type { WorkspaceHost } from "../../workspaceHost.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import { WorkspaceSectionWindowPlaceholder } from "../../windowing/WorkspaceSectionWindowPlaceholder.js";
import {
  focusOrReopenWorkspaceWindow,
  getExternalWorkspaceSectionWindowBinding,
} from "../../windowing/workspaceSectionWindowing.js";
import { moveWorkspaceWindowToCanvasSection } from "../../windowing/windowingState.js";
import { useOptionalWorkspaceWindowing } from "../../windowing/workspaceWindowingContext.js";

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

function renderItemArea(
  host: WorkspaceHost,
  section: WorkspaceSection,
  content: ReactNode,
  hasSectionStyleTheme: boolean,
) {
  const itemArea = getWorkspaceItemAreaPresentationOrThrow(host, section);

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
