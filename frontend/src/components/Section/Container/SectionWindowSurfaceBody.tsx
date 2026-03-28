import React from "react";
import { SectionContainerAreaDictBoundary } from "./SectionContainerAreaDictBoundary";
import { SectionContainerArea } from "./SectionContainerArea";
import {
  buildSectionWindowSurfaceBodyView,
  type SectionWindowSurfaceBodyProps,
} from "./sectionWindowSurfaceBodyView";
import type { SectionContainerAreaDictProps } from "./sectionContainerAreaView";

function renderSectionWindowSurfaceDictArea(props: SectionContainerAreaDictProps) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

function _SectionWindowSurfaceBody(props: SectionWindowSurfaceBodyProps) {
  const view = buildSectionWindowSurfaceBodyView(props);

  switch (view.kind) {
    case "override":
      return <>{view.body}</>;
    case "area":
      return (
        <SectionContainerArea
          {...view.props}
          renderDictArea={renderSectionWindowSurfaceDictArea}
        />
      );
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SectionWindowSurfaceBody = React.memo(_SectionWindowSurfaceBody);
