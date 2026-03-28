import React from "react";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import { SortableSectionSection } from "./SortableSectionSection";

const renderSectionContainerCoreBody: SectionContainerCoreBodyRenderer = (
  props,
) => <SectionContainerCoreCanvasBody {...props} />;

function _SectionContainerNestedSectionsBoundary(
  props: SectionContainerNestedSectionsProps,
) {
  return (
    <SectionContainerNestedSections
      {...props}
      SectionBoundary={SortableSectionSection}
      renderCoreBody={renderSectionContainerCoreBody}
      renderNestedSections={renderSectionContainerNestedSections}
    />
  );
}

export const SectionContainerNestedSectionsBoundary = React.memo(
  _SectionContainerNestedSectionsBoundary,
);

export function renderSectionContainerNestedSections(
  props: SectionContainerNestedSectionsProps,
) {
  return <SectionContainerNestedSectionsBoundary {...props} />;
}
