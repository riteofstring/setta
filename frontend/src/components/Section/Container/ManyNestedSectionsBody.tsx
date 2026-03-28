import type { ReactNode } from "react";
import React from "react";
import { goToSection } from "state/actions/sections/sectionPositions";
import {
  buildManyNestedSectionsView,
  type ManyNestedSectionsBodyProps,
  type ManyNestedSectionsRendererProps,
} from "./manyNestedSectionsView";

export type ManyNestedSectionsRenderer = (
  props: ManyNestedSectionsRendererProps,
) => ReactNode;

type ManyNestedSectionsBodyComponentProps = ManyNestedSectionsBodyProps & {
  renderNestedSections: ManyNestedSectionsRenderer;
};

function _ManyNestedSectionsBody(props: ManyNestedSectionsBodyComponentProps) {
  const view = buildManyNestedSectionsView(props);
  const nestedSections = props.renderNestedSections({
    childIds: view.childIds,
    childClassName: view.childClassName,
  });

  if (view.kind === "tight") {
    return <div className={view.containerClassName}>{nestedSections}</div>;
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
      <div className={view.containerClassName}>{nestedSections}</div>
    </div>
  );
}

export const ManyNestedSectionsBody = React.memo(_ManyNestedSectionsBody);
