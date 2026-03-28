import React from "react";
import {
  SectionContainerSection,
  type SectionContainerSectionBoundaryProps,
} from "./SectionContainerSection";
import { SortableSectionSection } from "./SortableSectionSection";

export type SectionContainerBoundaryProps = Omit<
  SectionContainerSectionBoundaryProps,
  "isTopLevel" | "SectionBoundary"
>;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return (
    <SectionContainerSection
      {...props}
      SectionBoundary={SortableSectionSection}
      isTopLevel={true}
    />
  );
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
