import C from "constants/constants.json";
import _ from "lodash";
import React, { useEffect } from "react";
import { getSectionType } from "state/actions/sectionInfos";
import { useMisc, useSectionInfos } from "state/definitions";
import { SECTION_DISPLAY_MODES } from "utils/constants";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, isTopLevel, dragListeners }) {
  const isDeck = useSectionInfos(
    (x) => getSectionType(sectionId, x) === C.DECK,
  );

  useEffect(() => {
    const state = useSectionInfos.getState();
    if (
      ![C.CODE, C.INTERACTIVE_CODE].includes(
        getSectionType(sectionId, state),
      ) &&
      state.x[sectionId].displayMode !== SECTION_DISPLAY_MODES.EDIT &&
      state.x[sectionId].displayMode !== SECTION_DISPLAY_MODES.YAML
    ) {
      useMisc.setState((x) => ({
        numInitializedSections: x.numInitializedSections + 1,
      }));
      return () => {
        useMisc.setState((x) => ({
          numInitializedSections: x.numInitializedSections - 1,
        }));
      };
    }
  }, []);

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
