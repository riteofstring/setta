import React from "react";
import { SectionContainerArea } from "./SectionContainerArea";
import {
  buildSectionWindowSurfaceBodyView,
  type SectionWindowSurfaceBodyProps,
} from "./sectionWindowSurfaceBodyView";

function _SectionWindowSurfaceBody(props: SectionWindowSurfaceBodyProps) {
  const view = buildSectionWindowSurfaceBodyView(props);

  switch (view.kind) {
    case "override":
      return <>{view.body}</>;
    case "area":
      return <SectionContainerArea {...view.props} />;
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SectionWindowSurfaceBody = React.memo(_SectionWindowSurfaceBody);
