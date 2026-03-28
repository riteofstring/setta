import React from "react";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import {
  buildSectionContainerNestedSectionsView,
  type SectionContainerNestedSectionsProps,
} from "./sectionContainerNestedSectionsView";

function _SectionContainerNestedSections(
  props: SectionContainerNestedSectionsProps,
) {
  const view = buildSectionContainerNestedSectionsView(props);
  const nestedSections = <MaybeManyNestedSections {...view.props} />;

  if (view.kind === "wrapped") {
    return <div className={view.wrapperClassName}>{nestedSections}</div>;
  }

  return nestedSections;
}

export const SectionContainerNestedSections = React.memo(
  _SectionContainerNestedSections,
);
