import React from "react";
import { SectionContainerArea } from "./SectionContainerArea";
import {
  buildSectionWindowSurfaceBodyView,
  type SectionWindowSurfaceBodyProps,
} from "./sectionWindowSurfaceBodyView";
import type { SectionContainerAreaDictProps } from "./sectionContainerAreaView";

type SectionWindowSurfaceBodyBoundaryProps = SectionWindowSurfaceBodyProps & {
  renderDictArea: (props: SectionContainerAreaDictProps) => React.ReactNode;
};

function _SectionWindowSurfaceBody(props: SectionWindowSurfaceBodyBoundaryProps) {
  const view = buildSectionWindowSurfaceBodyView(props);

  switch (view.kind) {
    case "override":
      return <>{view.body}</>;
    case "area":
      return (
        <SectionContainerArea
          {...view.props}
          renderDictArea={props.renderDictArea}
        />
      );
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SectionWindowSurfaceBody = React.memo(_SectionWindowSurfaceBody);
