import { useGetCurrChildren } from "hooks/useSectionChildren";
import { useIsDeck, useIsOutput } from "hooks/useSectionType";
import React from "react";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import { ContainerSwitch } from "./ContainerSwitch";
import { OutputSection } from "./OutputSection";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  ancestorSet,
  dragListeners,
}) {
  const isDeck = useIsDeck(sectionId);
  const isOutput = useIsOutput(sectionId);
  const currChildren = useGetCurrChildren(sectionId);
  const hasNested = currChildren.length > 0;

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      dragListeners={dragListeners}
      ancestorSet={ancestorSet}
    >
      {!isDeck && !isOutput && (
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          hasNested={hasNested}
        />
      )}

      {isOutput && <OutputSection sectionId={sectionId} />}

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
export default React.memo(SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});
