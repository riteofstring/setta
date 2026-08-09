import { useSectionContentRenderer } from "../../canvas/sectionContentContext";
import type { WorkspaceSection } from "../../document/types";
import { SectionHeader } from "../header/SectionHeader";
import { CustomResizable } from "../resize/CustomResizable";
import { DEFAULT_SECTION_BG_COLOR } from "../sectionColors";

// The reference's `SectionContainerCoreResizabe`, cut at the renderer seam: the twenty-two
// application area renderers, chat windowing, section-window placeholders, and meta-control
// chrome are replaced by the host-supplied section content renderer. A minimized section keeps
// its header and drops its body, exactly like the reference's `AreaSwitch`.
type SectionContainerContentProps = {
  section: WorkspaceSection;
  hasSectionStyleTheme: boolean;
};

export function SectionContainerContent({
  section,
  hasSectionStyleTheme,
}: SectionContainerContentProps) {
  const renderSectionContent = useSectionContentRenderer();

  return (
    <CustomResizable
      sectionId={section.id}
      bgColor={DEFAULT_SECTION_BG_COLOR}
      positionAndSizeLocked={section.positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
    >
      <SectionHeader sectionId={section.id} hasSectionStyleTheme={hasSectionStyleTheme} />
      {!section.isMinimized && renderSectionContent(section)}
    </CustomResizable>
  );
}
