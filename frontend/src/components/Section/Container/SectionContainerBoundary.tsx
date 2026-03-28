import React from "react";
import {
  SectionContainerSectionBoundary,
  type SectionContainerSectionBoundaryOnlyProps,
} from "./SectionContainerSectionBoundary";

export type SectionContainerBoundaryProps = Omit<
  SectionContainerSectionBoundaryOnlyProps,
  "isTopLevel"
>;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return <SectionContainerSectionBoundary {...props} isTopLevel={true} />;
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
