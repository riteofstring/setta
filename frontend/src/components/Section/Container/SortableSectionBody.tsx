import React from "react";
import { TempDNDSection } from "forks/dnd-kit/DummySection";
import {
  SectionContainer,
  type SectionContainerCoreBodyRenderer,
} from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import {
  buildSortableSectionBodyView,
  type SortableSectionBodyProps,
} from "./sortableSectionBodyView";

const renderSectionContainerCoreBody: SectionContainerCoreBodyRenderer = (
  props,
) => <SectionContainerCoreCanvasBody {...props} />;

function _SortableSectionBody(props: SortableSectionBodyProps) {
  const view = buildSortableSectionBodyView(props);

  switch (view.kind) {
    case "temp":
      return <TempDNDSection />;
    case "section":
      return (
        <SectionContainer
          {...view.props}
          renderCoreBody={renderSectionContainerCoreBody}
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
