import React from "react";
import {
  MaybeManyNestedSections,
} from "./ManyNestedSections";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";
import type { ManyNestedSectionsRendererProps } from "./manyNestedSectionsView";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SectionContainerCoreCanvasBody } from "./SectionContainerCoreCanvasBody";
import { SortableSectionContainer } from "./SortableSectionContainer";
import {
  buildSectionContainerNestedSectionsView,
  type SectionContainerNestedSectionsProps,
} from "./sectionContainerNestedSectionsView";

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

function _SectionContainerNestedSections(
  props: SectionContainerNestedSectionsProps,
) {
  const view = buildSectionContainerNestedSectionsView(props);
  const nestedSections = (
    <MaybeManyNestedSections
      {...view.props}
      renderNestedSections={renderSortableNestedSections}
    />
  );

  if (view.kind === "wrapped") {
    return <div className={view.wrapperClassName}>{nestedSections}</div>;
  }

  return nestedSections;
}

export const SectionContainerNestedSections = React.memo(
  _SectionContainerNestedSections,
);

export function renderSectionContainerNestedSections(
  props: SectionContainerNestedSectionsProps,
) {
  return <SectionContainerNestedSections {...props} />;
}
