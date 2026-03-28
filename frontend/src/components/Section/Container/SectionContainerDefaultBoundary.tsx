import React, { type ComponentProps } from "react";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";

export type SectionContainerDefaultBoundaryProps = Omit<
  ComponentProps<typeof SectionContainerBoundary>,
  "renderCoreBody" | "renderNestedSections"
>;

function _SectionContainerDefaultBoundary(
  props: SectionContainerDefaultBoundaryProps,
) {
  return (
    <SectionContainerBoundary
      {...props}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerDefaultBoundary = React.memo(
  _SectionContainerDefaultBoundary,
);
