import React from "react";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
  SectionContainerSection,
} from "./SectionContainerSection";

function _SectionContainerNestedSectionsBoundary(
  props: SectionContainerNestedSectionsProps,
) {
  return (
    <SectionContainerNestedSections
      {...props}
      SectionBoundary={SectionContainerSection}
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
