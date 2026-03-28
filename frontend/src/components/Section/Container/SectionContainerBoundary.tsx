import React from "react";
import {
  SectionContainerSection,
  type SectionContainerSectionProps,
} from "./SectionContainerSection";

export type SectionContainerBoundaryProps = Omit<
  SectionContainerSectionProps,
  "isTopLevel"
>;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return <SectionContainerSection {...props} isTopLevel={true} />;
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
