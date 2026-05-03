import {
  GpuSceneSectionContainer,
  StaticSectionContainer,
} from "./ContainerWrappers";

export function ContainerSwitch({
  isGroup,
  sectionId,
  children,
  isTopLevel,
  visibility,
  isEditingViewMode,
  isUserView,
  sceneSurface = false,
}: {
  isGroup: boolean;
  sectionId: string;
  children: React.ReactNode;
  isTopLevel: boolean;
  visibility: boolean;
  isEditingViewMode: boolean;
  isUserView: boolean;
  sceneSurface?: boolean;
}) {
  if (sceneSurface) {
    return (
      <GpuSceneSectionContainer
        isGroup={isGroup}
        sectionId={sectionId}
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
      >
        {children}
      </GpuSceneSectionContainer>
    );
  }

  return (
    <StaticSectionContainer
      isGroup={isGroup}
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      visibility={visibility}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
    >
      {children}
    </StaticSectionContainer>
  );
}
