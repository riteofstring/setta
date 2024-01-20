import _ from "lodash";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isDeck,
  sectionId,
  dragListeners,
  children,
}) {
  // const parentId = useSectionInfos((x) => x.x[sectionId].parentId);
  // console.log("parentId", parentId);
  // const isTopLevel = _.isNil(parentId);
  const isTopLevel = useProjectConfig((x) => sectionId in x.children);

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
