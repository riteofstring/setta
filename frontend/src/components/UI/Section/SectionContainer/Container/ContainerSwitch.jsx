import { useNodeInternals } from "state/definitions";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isDeck,
  sectionId,
  dragListeners,
  children,
}) {
  const isTopLevel = useNodeInternals((x) => x.x.has(sectionId));

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
