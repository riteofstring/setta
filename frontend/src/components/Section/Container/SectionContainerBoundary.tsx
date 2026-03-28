import React from "react";
import {
  SectionContainerSection,
  type SectionContainerSectionProps,
} from "./SectionContainerSection";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";

export type SectionContainerBoundaryProps = Omit<
  SectionContainerSectionProps,
  "isTopLevel"
>;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return (
    <SectionContainerSection
      {...props}
      isTopLevel={true}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
