import React, { type ComponentProps } from "react";
import {
  SectionContainer,
  type SectionContainerCoreBodyRenderer,
} from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

export type SectionContainerSectionProps = Pick<
  ComponentProps<typeof SectionContainer>,
  "dragListeners" | "isTopLevel" | "sectionId"
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

function _SectionContainerSection(props: SectionContainerSectionProps) {
  return (
    <SectionContainer
      {...props}
      SectionBoundary={SectionContainerSection}
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const SectionContainerSection = React.memo(_SectionContainerSection);
