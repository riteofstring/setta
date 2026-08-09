import type { ReactNode } from "react";
import type { SectionDragListeners } from "./ContainerCore";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isGroup,
  sectionId,
  dragListeners,
  children,
  isTopLevel,
}: {
  isGroup: boolean;
  sectionId: string;
  dragListeners?: SectionDragListeners;
  children: ReactNode;
  isTopLevel: boolean;
}) {
  return isTopLevel ? (
    <TopLevelContainer isGroup={isGroup} sectionId={sectionId}>
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      isGroup={isGroup}
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
