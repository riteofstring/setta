import React from "react";
import {
  SectionContainerSection,
  type SectionContainerSectionBoundaryProps,
} from "./SectionContainerSection";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";

export type SectionContainerSectionBoundaryOnlyProps = Omit<
  SectionContainerSectionBoundaryProps,
  "renderCoreBody" | "renderNestedSections"
>;

function _SectionContainerSectionBoundary(
  props: SectionContainerSectionBoundaryOnlyProps,
) {
  return (
    <SectionContainerSection
      {...props}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerSectionBoundary = React.memo(
  _SectionContainerSectionBoundary,
);
