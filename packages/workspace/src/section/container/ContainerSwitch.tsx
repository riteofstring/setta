import type { ReactNode } from "react";
import type { SectionDragListeners } from "./ContainerCore";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  dimmed,
  isGroup,
  sectionId,
  dragListeners,
  children,
  isTopLevel,
}: {
  dimmed: boolean;
  isGroup: boolean;
  sectionId: string;
  dragListeners?: SectionDragListeners;
  children: ReactNode;
  isTopLevel: boolean;
}) {
  return isTopLevel ? (
    <TopLevelContainer dimmed={dimmed} isGroup={isGroup} sectionId={sectionId}>
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      dimmed={dimmed}
      isGroup={isGroup}
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      dragListeners={dragListeners}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
