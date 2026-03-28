import React from "react";
import {
  MaybeManyNestedSections,
} from "./ManyNestedSections";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";
import {
  buildSectionContainerNestedSectionsView,
  type SectionContainerNestedSectionsProps,
} from "./sectionContainerNestedSectionsView";

export type SectionContainerNestedSectionsComponentProps =
  SectionContainerNestedSectionsProps & {
    renderNestedSections: ManyNestedSectionsRenderer;
  };

function _SectionContainerNestedSections(
  props: SectionContainerNestedSectionsComponentProps,
) {
  const { renderNestedSections, ...viewProps } = props;
  const view = buildSectionContainerNestedSectionsView(viewProps);
  const nestedSections = (
    <MaybeManyNestedSections
      {...view.props}
      renderNestedSections={renderNestedSections}
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
