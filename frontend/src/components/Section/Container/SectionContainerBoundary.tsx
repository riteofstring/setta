import React, { type ComponentProps } from "react";
import {
  SectionContainer,
  type SectionContainerCoreBodyRenderer,
} from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { renderSectionContainerNestedSections } from "./SectionContainerNestedSectionsBoundary";
import { SortableSectionSection } from "./SortableSectionSection";

type SectionContainerBoundaryProps = Pick<
  ComponentProps<typeof SectionContainer>,
  "dragListeners" | "isTopLevel" | "sectionId"
>;

const renderSectionContainerCoreBody: SectionContainerCoreBodyRenderer = (
  props,
) => <SectionContainerCoreCanvasBody {...props} />;

function _SectionContainerBoundary(props: SectionContainerBoundaryProps) {
  return (
    <SectionContainer
      {...props}
      SectionBoundary={SortableSectionSection}
      renderCoreBody={renderSectionContainerCoreBody}
      renderNestedSections={renderSectionContainerNestedSections}
    />
  );
}

export const SectionContainerBoundary = React.memo(_SectionContainerBoundary);
