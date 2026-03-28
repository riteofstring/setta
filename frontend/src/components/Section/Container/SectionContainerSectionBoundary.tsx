import React from "react";
import { type SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import {
  SectionContainerSection,
  type SectionContainerSectionBoundaryProps,
} from "./SectionContainerSection";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

export type SectionContainerSectionBoundaryOnlyProps = Omit<
  SectionContainerSectionBoundaryProps,
  "renderCoreBody" | "renderNestedSections"
>;

export const renderDefaultSectionContainerCoreBody: SectionContainerCoreBodyRenderer =
  (props) => <SectionContainerCoreCanvasBody {...props} />;

export function renderDefaultSectionContainerNestedSections(
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

function _SectionContainerSectionBoundary(
  props: SectionContainerSectionBoundaryOnlyProps,
) {
  return (
    <SectionContainerSection
      {...props}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerSectionBoundary = React.memo(
  _SectionContainerSectionBoundary,
);
