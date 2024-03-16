import { useTempHasNested } from "hooks/useSectionChildren";
import { useIsDeck } from "hooks/useSectionType";
import React from "react";
import { useDndState } from "utils/DNDSortable/dndState";
import { DummySection } from "utils/DNDSortable/DummySection";
import { ManyNestedSections } from "../NestedSection/ManyNestedSections";
import { ContainerSwitch } from "./Container/ContainerSwitch";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, dragListeners }) {
  const isDeck = useIsDeck(sectionId);
  const hasNested = useTempHasNested(sectionId);
  const dndActiveAndMovingInSortable = useDndState(
    (x) =>
      x.activeId === sectionId && x.movingFreeInSortable && !!dragListeners,
  );

  if (sectionId[0] === "5") {
    console.log("_SectionContainer", sectionId, dndActiveAndMovingInSortable);
  }

  return dndActiveAndMovingInSortable ? (
    <DummySection forceShow={true} />
  ) : (
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
export const SectionContainer = React.memo(_SectionContainer, () => true);
