import _ from "lodash";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isDeck,
  sectionId,
  parentId,
  dragListeners,
  ancestorSet,
  children,
}) {
  return _.size(ancestorSet) === 0 ? (
    <TopLevelContainer
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
    >
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
