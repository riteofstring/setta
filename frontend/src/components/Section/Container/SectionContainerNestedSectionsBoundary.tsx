import React from "react";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";
import type { ManyNestedSectionsRendererProps } from "./manyNestedSectionsView";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import { SortableSectionContainer } from "./SortableSectionContainer";

const renderSectionContainerCoreBody: SectionContainerCoreBodyRenderer = (
  props,
) => <SectionContainerCoreCanvasBody {...props} />;

const renderSortableNestedSections: ManyNestedSectionsRenderer = ({
  childIds,
  childClassName,
}: ManyNestedSectionsRendererProps) =>
  childIds.map((childId) => (
    <SortableSectionContainer
      sectionId={childId}
      key={`Nested-Sec-${childId}`}
      className={childClassName}
      renderCoreBody={renderSectionContainerCoreBody}
      renderNestedSections={renderSectionContainerNestedSections}
    />
  ));

function _SectionContainerNestedSectionsBoundary(
  props: SectionContainerNestedSectionsProps,
) {
  return (
    <SectionContainerNestedSections
      {...props}
      renderNestedSections={renderSortableNestedSections}
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
