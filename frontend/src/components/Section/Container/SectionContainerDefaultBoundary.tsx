import React, { type ComponentProps } from "react";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import { SortableSectionSection } from "./SortableSectionSection";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";

export type SectionContainerDefaultBoundaryProps = Omit<
  ComponentProps<typeof SectionContainerBoundary>,
  "renderCoreBody" | "renderNestedSections" | "SectionBoundary"
>;

function _SectionContainerDefaultBoundary(
  props: SectionContainerDefaultBoundaryProps,
) {
  return (
    <SectionContainerBoundary
      {...props}
      SectionBoundary={SortableSectionSection}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerDefaultBoundary = React.memo(
  _SectionContainerDefaultBoundary,
);
