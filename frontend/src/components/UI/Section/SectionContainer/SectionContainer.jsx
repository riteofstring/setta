import { useIsDeck } from "hooks/useSectionType";
import { useSectionInfos } from "models/info/sectionInfos";
import React from "react";
import { ManyNestedSections } from "../NestedSection/ManyNestedSections";
import { ContainerSwitch } from "./Container/ContainerSwitch";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({ sectionId, nextId, ancestorSet, dragListeners }) {
  const isDeck = useIsDeck(sectionId);
  const currChildren = useSectionInfos((x) => x.x[sectionId].currChildren);
  const hasNested = currChildren.length > 0;

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      dragListeners={dragListeners}
      ancestorSet={ancestorSet}
    >
      {!isDeck && (
        <SectionContainerCore
          sectionId={sectionId}
          nextId={nextId}
          hasNested={hasNested}
        />
      )}

      {hasNested && (
        <div className="flex flex-col">
          <ManyNestedSections
            childIds={currChildren}
            sectionId={sectionId}
            ancestorSet={ancestorSet}
            isDeck={isDeck}
          />
        </div>
      )}
    </ContainerSwitch>
  );
}
export const SectionContainer = React.memo(_SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});
