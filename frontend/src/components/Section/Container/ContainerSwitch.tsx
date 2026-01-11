import { DndSlotAndDndWatcher } from "./ContainerWrappers";
import { TopLevelContainer } from "./TopLevelContainer";

export function ContainerSwitch({
  isGroup,
  sectionId,
  dragListeners,
  children,
  isTopLevel,
  visibility,
  isEditingViewMode,
  isUserView,
}: {
  isGroup: boolean;
  sectionId: string;
  dragListeners: any;
  children: React.ReactNode;
  isTopLevel: boolean;
  visibility: boolean;
  isEditingViewMode: boolean;
  isUserView: boolean;
}) {
  return isTopLevel ? (
    <TopLevelContainer
      isGroup={isGroup}
      sectionId={sectionId}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
    >
      {children}
    </TopLevelContainer>
  ) : (
    <DndSlotAndDndWatcher
      isGroup={isGroup}
      sectionId={sectionId}
      dragListeners={dragListeners}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
