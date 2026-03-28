import React from "react";
import {
  SectionContainerSection,
  type SectionContainerSectionProps,
} from "./SectionContainerSection";

type SectionContainerBoundaryProps = SectionContainerSectionProps;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return <SectionContainerSection {...props} />;
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
