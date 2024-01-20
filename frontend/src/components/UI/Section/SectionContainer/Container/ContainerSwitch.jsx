import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isDeck,
  sectionId,
  dragListeners,
  children,
}) {
  const isTopLevel = useSectionInfos((x) => _.isNil(x.x[sectionId].parentId));
  return isTopLevel ? (
    <TopLevelContainer isDeck={isDeck} sectionId={sectionId}>
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      isDeck={isDeck}
      sectionId={sectionId}
      isTopLevel={false}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
