import _ from "lodash";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isDeck,
  sectionId,
  dragListeners,
  ancestorSet,
  children,
}) {
  const isTopLevel = _.size(ancestorSet) === 0;
  return isTopLevel ? (
    <TopLevelContainer isDeck={isDeck} sectionId={sectionId}>
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
