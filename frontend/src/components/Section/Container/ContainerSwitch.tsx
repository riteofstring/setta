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
  flattenNonGroupWrapper,
}: {
  isGroup: boolean;
  sectionId: string;
  dragListeners: any;
  children: React.ReactNode;
  isTopLevel: boolean;
  visibility: boolean;
  isEditingViewMode: boolean;
  isUserView: boolean;
  flattenNonGroupWrapper: boolean;
}) {
  return isTopLevel ? (
    <TopLevelContainer
      isGroup={isGroup}
      sectionId={sectionId}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      flattenNonGroupWrapper={flattenNonGroupWrapper}
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
      flattenNonGroupWrapper={flattenNonGroupWrapper}
    >
      {children}
    </DndSlotAndDndWatcher>
  );
}
