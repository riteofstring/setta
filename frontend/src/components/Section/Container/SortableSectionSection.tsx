import React, { type ComponentProps } from "react";
import { SectionContainer } from "./SectionContainer";

type SortableSectionSectionProps = Pick<
  ComponentProps<typeof SectionContainer>,
  "dragListeners" | "renderCoreBody" | "renderNestedSections" | "sectionId"
>;

function _SortableSectionSection(props: SortableSectionSectionProps) {
  return <SectionContainer {...props} />;
}

export const SortableSectionSection = React.memo(_SortableSectionSection);
