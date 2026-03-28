import React from "react";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./SectionContainerSection";

function _SectionContainerNestedSectionsBoundary(
  props: SectionContainerNestedSectionsProps,
) {
  return (
    <SectionContainerNestedSections
      {...props}
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
