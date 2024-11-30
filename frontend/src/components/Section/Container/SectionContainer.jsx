import _ from "lodash";
import React from "react";
import { useIsDeck } from "state/hooks/uiTypes";
import { ContainerSwitch } from "./ContainerSwitch";
import { ManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";
import { useHasTempNested } from "./utils";

function _SectionContainer({ sectionId, dragListeners }) {
  const isDeck = useIsDeck(sectionId);
  const hasNested = useHasTempNested(sectionId);

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      dragListeners={dragListeners}
    >
      {!isDeck && <SectionContainerCore sectionId={sectionId} />}

      {hasNested && (
        <div className="flex flex-col">
          <ManyNestedSections sectionId={sectionId} isDeck={isDeck} />
        </div>
      )}
    </ContainerSwitch>
  );
}
export const SectionContainer = React.memo(_SectionContainer, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
