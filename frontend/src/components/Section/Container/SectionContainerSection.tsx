import React, { type ComponentProps } from "react";
import { SectionContainer } from "./SectionContainer";
import type {
  SortableSectionBodySectionBoundary,
  SortableSectionBodySectionBoundaryProps,
} from "./sortableSectionBodyView";

export type SectionContainerSectionProps = Pick<
  ComponentProps<typeof SectionContainer>,
  "dragListeners" | "isTopLevel" | "sectionId"
>;
export type SectionContainerSectionBoundaryProps =
  SectionContainerSectionProps &
    Pick<
      SortableSectionBodySectionBoundaryProps,
      "renderCoreBody" | "renderNestedSections"
    > & {
      SectionBoundary: SortableSectionBodySectionBoundary;
    };

function _SectionContainerSection({
  SectionBoundary,
  renderCoreBody,
  renderNestedSections,
  ...props
}: SectionContainerSectionBoundaryProps) {
  return (
    <SectionContainer
      {...props}
      SectionBoundary={SectionBoundary}
      renderCoreBody={renderCoreBody}
      renderNestedSections={renderNestedSections}
    />
  );
}

export const SectionContainerSection = React.memo(_SectionContainerSection);
