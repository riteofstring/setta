import React from "react";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";

function _SectionContainerCoreBody(props: SectionContainerCoreBodyProps) {
  return <SectionContainerCoreCanvasBody {...props} />;
}

export const SectionContainerCoreBody = React.memo(_SectionContainerCoreBody);
