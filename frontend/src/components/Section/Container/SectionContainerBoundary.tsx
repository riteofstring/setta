import React from "react";
import {
  SectionContainerSection,
  type SectionContainerSectionBoundaryProps,
} from "./SectionContainerSection";

export type SectionContainerBoundaryProps = Omit<
  SectionContainerSectionBoundaryProps,
  "isTopLevel"
>;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return <SectionContainerSection {...props} isTopLevel={true} />;
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
