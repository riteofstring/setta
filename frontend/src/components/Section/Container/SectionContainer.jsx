import React from "react";
import { useTempHasNested } from "state/hooks/sections";
import { useIsDeck } from "state/hooks/uiTypes";
import { ManyNestedSections } from "./ManyNestedSections";
import { ContainerSwitch } from "./ContainerSwitch";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, dragListeners }) {
  const isDeck = useIsDeck(sectionId);
  const hasNested = useTempHasNested(sectionId);

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
export const SectionContainer = React.memo(_SectionContainer, () => true);
