import React from "react";
import { goToSection } from "state/actions/sections/sectionPositions";
import { SortableSectionContainer } from "./SortableSectionContainer";
import {
  buildManyNestedSectionsView,
  type ManyNestedSectionsBodyProps,
} from "./manyNestedSectionsView";

function renderNestedSections(
  childIds: string[],
  childClassName?: string,
): React.ReactNode {
  return childIds.map((childId) => (
    <SortableSectionContainer
      sectionId={childId}
      key={`Nested-Sec-${childId}`}
      className={childClassName}
    />
  ));
}

function _ManyNestedSectionsBody(props: ManyNestedSectionsBodyProps) {
  const view = buildManyNestedSectionsView(props);

  if (view.kind === "tight") {
    return (
      <div className={view.containerClassName}>
        {renderNestedSections(view.childIds, view.childClassName)}
      </div>
    );
  }

  return (
    <div className="flex items-stretch">
      {view.showNavigationRail ? (
        <div
          className={view.navigationRailClassName}
          onClick={() => {
            goToSection(props.sectionId);
          }}
        />
      ) : null}
      <div className={view.containerClassName}>
        {renderNestedSections(view.childIds, view.childClassName)}
      </div>
    </div>
  );
}

export const ManyNestedSectionsBody = React.memo(_ManyNestedSectionsBody);
