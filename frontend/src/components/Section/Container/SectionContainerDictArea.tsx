import React from "react";
import {
  DictAreaLiveBoundary,
  type DictAreaLiveBoundaryProps,
} from "../Layouts/DictAreaLiveBoundary";

export type SectionContainerDictAreaProps = DictAreaLiveBoundaryProps;

function _SectionContainerDictArea(props: SectionContainerDictAreaProps) {
  return <DictAreaLiveBoundary {...props} />;
}

export const SectionContainerDictArea = React.memo(_SectionContainerDictArea);
