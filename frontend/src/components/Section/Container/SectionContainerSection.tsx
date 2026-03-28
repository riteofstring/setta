import React, { type ComponentProps } from "react";
import { SectionContainer } from "./SectionContainer";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

export type SectionContainerSectionProps = Pick<
  ComponentProps<typeof SectionContainer>,
  "dragListeners" | "isTopLevel" | "sectionId"
>;
export type SectionContainerSectionBoundaryProps =
  SectionContainerSectionProps &
    Pick<
      SortableSectionBodySectionBoundaryProps,
      "renderCoreBody" | "renderNestedSections"
    >;

function _SectionContainerSection({
  renderCoreBody,
  renderNestedSections,
  ...props
}: SectionContainerSectionBoundaryProps) {
  return (
    <SectionContainer
      {...props}
      SectionBoundary={SectionContainerSection}
      renderCoreBody={renderCoreBody}
      renderNestedSections={renderNestedSections}
    />
  );
}

export const SectionContainerSection = React.memo(_SectionContainerSection);
