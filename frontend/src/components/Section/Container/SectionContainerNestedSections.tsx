import React from "react";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import { SortableSectionContainer } from "./SortableSectionContainer";
import { SortableSectionSection } from "./SortableSectionSection";
import {
  buildSectionContainerNestedSectionsView,
  type SectionContainerNestedSectionsProps,
} from "./sectionContainerNestedSectionsView";
import type { SortableSectionNestedSectionsRenderer } from "./sortableSectionBodyView";

export type SectionContainerNestedSectionsComponentProps =
  SectionContainerNestedSectionsProps & {
    renderCoreBody: SectionContainerCoreBodyRenderer;
    renderNestedSections: SortableSectionNestedSectionsRenderer;
  };

function _SectionContainerNestedSections(
  props: SectionContainerNestedSectionsComponentProps,
) {
  const { renderCoreBody, renderNestedSections, ...viewProps } = props;
  const view = buildSectionContainerNestedSectionsView(viewProps);
  const nestedSections = (
    <MaybeManyNestedSections
      {...view.props}
      renderNestedSections={({ childIds, childClassName }) =>
        childIds.map((childId) => (
          <SortableSectionContainer
            sectionId={childId}
            key={`Nested-Sec-${childId}`}
            className={childClassName}
            SectionBoundary={SortableSectionSection}
            renderCoreBody={renderCoreBody}
            renderNestedSections={renderNestedSections}
          />
        ))
      }
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
