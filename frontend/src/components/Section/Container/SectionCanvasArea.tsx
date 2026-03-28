import React from "react";
import { SectionContainerArea } from "./SectionContainerArea";
import {
  buildSectionCanvasAreaView,
  type SectionCanvasAreaProps,
} from "./sectionCanvasAreaView";

function _SectionCanvasArea(props: SectionCanvasAreaProps) {
  const sectionContainerAreaProps = buildSectionCanvasAreaView(props);

  return <SectionContainerArea {...sectionContainerAreaProps} />;
}

export const SectionCanvasArea = React.memo(_SectionCanvasArea);
