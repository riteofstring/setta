import React from "react";
import { SectionContainerAreaDictBoundary } from "./SectionContainerAreaDictBoundary";
import { SectionContainerArea } from "./SectionContainerArea";
import {
  buildSectionCanvasAreaView,
  type SectionCanvasAreaProps,
} from "./sectionCanvasAreaView";
import type { SectionContainerAreaDictProps } from "./sectionContainerAreaView";

function renderSectionCanvasDictArea(props: SectionContainerAreaDictProps) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

function _SectionCanvasArea(props: SectionCanvasAreaProps) {
  const sectionContainerAreaProps = buildSectionCanvasAreaView(props);

  return (
    <SectionContainerArea
      {...sectionContainerAreaProps}
      renderDictArea={renderSectionCanvasDictArea}
    />
  );
}

export const SectionCanvasArea = React.memo(_SectionCanvasArea);
