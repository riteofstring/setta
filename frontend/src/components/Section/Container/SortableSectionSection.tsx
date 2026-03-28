import React from "react";
import { SectionContainerSection } from "./SectionContainerSection";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

function _SortableSectionSection(
  props: SortableSectionBodySectionBoundaryProps,
) {
  return (
    <SectionContainerSection
      dragListeners={props.dragListeners}
      isTopLevel={false}
      sectionId={props.sectionId}
    />
  );
}

export const SortableSectionSection = React.memo(_SortableSectionSection);
