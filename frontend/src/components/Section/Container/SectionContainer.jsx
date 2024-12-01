import C from "constants/constants.json";
import _ from "lodash";
import React from "react";
import { useIsType } from "state/hooks/uiTypes";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, dragListeners }) {
  const isDeck = useIsType(sectionId, C.DECK);

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      dragListeners={dragListeners}
    >
      {!isDeck && <SectionContainerCore sectionId={sectionId} />}
      <MaybeManyNestedSections sectionId={sectionId} isDeck={isDeck} />
    </ContainerSwitch>
  );
}
export const SectionContainer = React.memo(_SectionContainer, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
