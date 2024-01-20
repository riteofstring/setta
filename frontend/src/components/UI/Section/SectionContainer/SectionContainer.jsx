import { useIsDeck } from "hooks/useSectionType";
import { useSectionInfos } from "models/info/sectionInfos";
import React from "react";
import { ManyNestedSections } from "../NestedSection/ManyNestedSections";
import { ContainerSwitch } from "./Container/ContainerSwitch";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, ancestorSet, dragListeners }) {
  const isDeck = useIsDeck(sectionId);
  const sectionChildren = useSectionInfos((x) => x.x[sectionId].children);
  const hasNested = sectionChildren.length > 0;

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      dragListeners={dragListeners}
      ancestorSet={ancestorSet}
    >
      {!isDeck && <SectionContainerCore sectionId={sectionId} />}

      {hasNested && (
        <div className="flex flex-col">
          <ManyNestedSections
            childIds={sectionChildren}
            sectionId={sectionId}
            ancestorSet={ancestorSet}
            isDeck={isDeck}
          />
        </div>
      )}
    </ContainerSwitch>
  );
}
export const SectionContainer = React.memo(_SectionContainer, () => true);
