import { ViewingEditingMode } from "utils/generatedTypes";
import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isGroup,
  sectionId,
  dragListeners,
  children,
  isTopLevel,
  visibility,
  viewingEditingMode,
}: {
  isGroup: boolean;
  sectionId: string;
  dragListeners: any;
  children: React.ReactNode;
  isTopLevel: boolean;
  visibility: boolean;
  viewingEditingMode: ViewingEditingMode;
}) {
  return isTopLevel ? (
    <TopLevelContainer
      isGroup={isGroup}
      sectionId={sectionId}
      visibility={visibility}
      viewingEditingMode={viewingEditingMode}
    >
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      isGroup={isGroup}
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      dragListeners={dragListeners}
      visibility={visibility}
      viewingEditingMode={viewingEditingMode}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
