import { NodeIdContext } from "gpuFlow/NodeIdContext";
import React from "react";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { GpuSceneSectionContainer } from "./ContainerWrappers";
import { SectionContainerCore } from "./SectionContainerCore";

type SectionContainerProps = {
  sectionId: string;
  isTopLevel: boolean;
};

function _SectionContainer({ sectionId, isTopLevel }: SectionContainerProps) {
  const {
    visibility,
    isEditingViewMode,
    isGroup,
    isUserView,
    isGenPython,
    isGenPythonMetadata,
    hasPythonCodegen,
    hasMetadata,
  } = useProjectState((x) => {
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      sectionId,
      x,
    );
    const viewMode = getActiveViewModeConfig(x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const pythonTarget = getPythonCodegenTarget(x.projectConfig);
    const sectionType = impl.type as SectionType;
    return {
      visibility,
      isEditingViewMode,
      isUserView: Boolean(viewMode.isUserFacing) && !isEditingViewMode,
      isGroup: sectionType === SectionTypeEnum.Group,
      isGenPython: sectionType === SectionTypeEnum.GenPythonCode,
      isGenPythonMetadata: sectionType === SectionTypeEnum.GenPythonMetadata,
      hasPythonCodegen: projectConfigHasPythonCodegen(x.projectConfig),
      hasMetadata: Boolean(pythonTarget?.generateMetadata),
    };
  }, shallow);

  if (
    shouldHideSection({
      isGenPython,
      hasPythonCodegen,
      isGenPythonMetadata,
      hasMetadata,
    }) ||
    !getSectionShouldRender(visibility, isEditingViewMode)
  ) {
    return null;
  }

  return (
    <NodeIdContext.Provider value={sectionId}>
      <GpuSceneSectionContainer
        isGroup={isGroup}
        sectionId={sectionId}
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
      >
        <StandardSectionSurface
          sectionId={sectionId}
          isTopLevel={isTopLevel}
          isGroup={isGroup}
          isUserView={isUserView}
        />
      </GpuSceneSectionContainer>
    </NodeIdContext.Provider>
  );
}

export const SectionContainer = React.memo(
  _SectionContainer,
  areSectionContainerPropsEqual,
);

function areSectionContainerPropsEqual(
  prev: SectionContainerProps,
  next: SectionContainerProps,
): boolean {
  return (
    prev.sectionId === next.sectionId && prev.isTopLevel === next.isTopLevel
  );
}

function shouldHideSection({
  isGenPython,
  hasPythonCodegen,
  isGenPythonMetadata,
  hasMetadata,
}: {
  isGenPython: boolean;
  hasPythonCodegen: boolean;
  isGenPythonMetadata: boolean;
  hasMetadata: boolean;
}) {
  return (
    (isGenPython && !hasPythonCodegen) || (isGenPythonMetadata && !hasMetadata)
  );
}

function StandardSectionSurface({
  sectionId,
  isTopLevel,
  isGroup,
  isUserView,
}: {
  sectionId: string;
  isTopLevel: boolean;
  isGroup: boolean;
  isUserView: boolean;
}) {
  if (isGroup) {
    return null;
  }
  return (
    <SectionContainerCore
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      isUserView={isUserView}
      fillSurface
      renderParamRows={false}
      scenePortGeometry
    />
  );
}
