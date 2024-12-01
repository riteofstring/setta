import C from "constants/constants.json";
import _ from "lodash";
import React from "react";
import { getSectionType } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, isTopLevel, dragListeners }) {
  const isDeck = useSectionInfos(
    (x) => getSectionType(sectionId, x) === C.DECK,
  );

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      dragListeners={dragListeners}
      isTopLevel={isTopLevel}
    >
      {!isDeck && <SectionContainerCore sectionId={sectionId} />}
      <MaybeManyNestedSections sectionId={sectionId} isDeck={isDeck} />
    </ContainerSwitch>
  );
}
export const SectionContainer = React.memo(_SectionContainer, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
