import {
  getRegisteredSectionKindOrThrow,
  type SectionKindDefinition,
} from "../../document/sectionKindRegistry";
import type { WorkspaceSection } from "../../document/types";
import { WorkspaceItemAuthoringToolbar } from "../../items/WorkspaceItemAuthoringToolbar";
import { WorkspaceItemFilterProvider } from "../../items/WorkspaceItemFilterContext";
import { SectionHeader } from "../header/SectionHeader";
import { CustomResizable } from "../resize/CustomResizable";
import { DEFAULT_SECTION_BG_COLOR } from "../sectionColors";
import { MetaControlChrome } from "./MetaControlChrome";

// The reference's `SectionContainerCoreResizabe`, cut at the renderer seam: application area
// renderers, chat windowing, and section-window placeholders are replaced by registered content.
// The meta-control presentation restores its package-owned headerless chrome at that seam. An
// ordinary minimized section keeps its header and drops its body like the reference's `AreaSwitch`.
type SectionContainerContentProps = {
  section: WorkspaceSection;
  hasSectionStyleTheme: boolean;
};

export function SectionContainerContent({
  section,
  hasSectionStyleTheme,
}: SectionContainerContentProps) {
  const definition = getRegisteredSectionKindOrThrow(section.kind);
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
      {!section.isMinimized &&
        renderRegisteredContent(definition, section, hasSectionStyleTheme)}
    </CustomResizable>
  );
}

function renderRegisteredContent(
  definition: SectionKindDefinition,
  section: WorkspaceSection,
  hasSectionStyleTheme: boolean,
) {
  if (definition.presentation?.type === "meta-control") {
    return definition.renderContent(section);
  }
  const itemTreeClassName = section.itemTree ? " flex min-h-0 flex-col" : "";
  const bodySlotClassName = definition.contentClassName
    ? `section-full-no-title${itemTreeClassName} ${definition.contentClassName}`
    : `section-full-no-title${itemTreeClassName}`;
  const content = definition.renderContent(section);
  return (
    <div className={bodySlotClassName}>
      {section.itemTree ? (
        <WorkspaceItemFilterProvider
          hasSectionStyleTheme={hasSectionStyleTheme}
          sectionId={section.id}
        >
          <WorkspaceItemAuthoringToolbar sectionId={section.id} />
          {content}
        </WorkspaceItemFilterProvider>
      ) : (
        content
      )}
    </div>
  );
}
