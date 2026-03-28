import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import { SortableSectionSection } from "./SortableSectionSection";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

export const renderDefaultSectionContainerCoreBody: SectionContainerCoreBodyRenderer =
  (props) => <SectionContainerCoreCanvasBody {...props} />;

export function renderDefaultSectionContainerNestedSections(
  props: SectionContainerNestedSectionsProps,
) {
  return (
    <SectionContainerNestedSections
      {...props}
      SectionBoundary={SortableSectionSection}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}
