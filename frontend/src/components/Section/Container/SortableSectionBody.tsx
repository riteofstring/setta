import React from "react";
import { TempDNDSection } from "forks/dnd-kit/DummySection";
import { SectionContainer } from "./SectionContainer";
import { renderSectionContainerNestedSections } from "./SectionContainerNestedSections";
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
        <SectionContainer
          {...view.props}
          renderNestedSections={renderSectionContainerNestedSections}
        />
      );
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SortableSectionBody = React.memo(_SortableSectionBody);
