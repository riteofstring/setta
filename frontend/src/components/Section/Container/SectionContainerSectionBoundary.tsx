import React from "react";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";
import {
  SectionContainerSection,
  type SectionContainerSectionBoundaryProps,
} from "./SectionContainerSection";
import { SortableSectionSection } from "./SortableSectionSection";

export type SectionContainerSectionBoundaryOnlyProps = Omit<
  SectionContainerSectionBoundaryProps,
  "SectionBoundary" | "renderCoreBody" | "renderNestedSections"
>;

function _SectionContainerSectionBoundary(
  props: SectionContainerSectionBoundaryOnlyProps,
) {
  return (
    <SectionContainerSection
      {...props}
      SectionBoundary={SortableSectionSection}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerSectionBoundary = React.memo(
  _SectionContainerSectionBoundary,
);
