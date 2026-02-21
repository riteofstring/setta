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
  shouldRender,
}: {
  isGroup: boolean;
  sectionId: string;
  dragListeners: any;
  children: React.ReactNode;
  isTopLevel: boolean;
  visibility: boolean;
  isEditingViewMode: boolean;
  isUserView: boolean;
  shouldRender: boolean;
}) {
  return isTopLevel ? (
    <TopLevelContainer
      isGroup={isGroup}
      sectionId={sectionId}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      shouldRender={shouldRender}
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
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      shouldRender={shouldRender}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
