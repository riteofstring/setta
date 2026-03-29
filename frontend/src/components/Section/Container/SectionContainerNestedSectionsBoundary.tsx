import React from "react";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import { SortableSectionSection } from "./SortableSectionSection";

function _SectionContainerNestedSectionsBoundary(
  props: SectionContainerNestedSectionsProps,
) {
  return (
    <SectionContainerNestedSections
      {...props}
      SectionBoundary={SortableSectionSection}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
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
