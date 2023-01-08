import { useGetCurrChildren } from "hooks/useSectionChildren";
import { useIsDeck } from "hooks/useSectionType";
import React from "react";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import { ContainerSwitch } from "./ContainerSwitch";
import SectionContainerCore from "./SectionContainerCore";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const isDeck = useIsDeck(sectionId);
  const currChildren = useGetCurrChildren(sectionId);
  const hasNested = currChildren.length > 0;

  return (
    <ContainerSwitch
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      hasNested={hasNested}
      dragListeners={dragListeners}
      depth={depth}
    >
      {!isDeck && (
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          hasNested={hasNested}
        />
      )}

      {hasNested && (
        <div className="flex flex-col">
          <ManyNestedSections
            childIds={currChildren}
            sectionId={sectionId}
            depth={depth}
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
