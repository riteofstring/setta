import { useProjectConfig } from "models/info/projectConfig";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";
import _ from "lodash";

export function ContainerSwitch({
  isDeck,
  sectionId,
  dragListeners,
  ancestorSet,
  children,
}) {
  // const isTopLevel = _.size(ancestorSet) === 0;
  const isTopLevel = useProjectConfig((x) => sectionId in x.children);
  if (sectionId === "c70103e3-f549-4711-b5b9-59971f194f4a") {
    console.log("isTopLevel", isTopLevel)
  }
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
