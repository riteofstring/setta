import React from "react";
import { SectionContainer } from "./SectionContainer";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

function _SortableSectionSection(
  props: SortableSectionBodySectionBoundaryProps,
) {
  return (
    <SectionContainer
      {...props}
      isTopLevel={false}
      SectionBoundary={SortableSectionSection}
    />
  );
}

export const SortableSectionSection = React.memo(_SortableSectionSection);
