import C from "constants/constants.json";
import _ from "lodash";
import React from "react";
import { useIsType } from "state/hooks/uiTypes";
import { ContainerSwitch } from "./ContainerSwitch";
import { ManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";
import { useHasTempNested } from "./utils";

function _SectionContainer({ sectionId, dragListeners }) {
  const isDeck = useIsType(sectionId, C.DECK);
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
