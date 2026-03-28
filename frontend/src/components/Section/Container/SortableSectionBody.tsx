import { TempDNDSection } from "forks/dnd-kit/DummySection";
import React from "react";
import { SortableSectionSection } from "./SortableSectionSection";
import {
  buildSortableSectionBodyView,
  type SortableSectionBodyProps,
} from "./sortableSectionBodyView";

function _SortableSectionBody(props: SortableSectionBodyProps) {
  const view = buildSortableSectionBodyView(props);

  switch (view.kind) {
    case "temp":
      return <TempDNDSection />;
    case "section":
      return (
        <SortableSectionSection
          {...view.props}
          renderCoreBody={props.renderCoreBody}
          renderNestedSections={props.renderNestedSections}
        />
      );
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SortableSectionBody = React.memo(_SortableSectionBody);
