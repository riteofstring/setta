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
import { ContainerSwitch } from "./ContainerSwitch";
import { SectionContainerCore } from "./SectionContainerCore";

type SectionContainerProps = {
  sectionId: string;
  isTopLevel: boolean;
  renderParamRows?: boolean;
  sceneSurface?: boolean;
};

function _SectionContainer({
  sectionId,
  isTopLevel,
  renderParamRows,
  sceneSurface = false,
}: SectionContainerProps) {
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
  const shouldRenderParamRows = getSectionContainerRenderParamRows(
    renderParamRows,
    sceneSurface,
  );

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
      <ContainerSwitch
        isGroup={isGroup}
        sectionId={sectionId}
        isTopLevel={isTopLevel}
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
        sceneSurface={sceneSurface}
      >
        <StandardSectionSurface
          sectionId={sectionId}
          isTopLevel={isTopLevel}
          isGroup={isGroup}
          isUserView={isUserView}
          renderParamRows={shouldRenderParamRows}
          sceneSurface={sceneSurface}
        />
      </ContainerSwitch>
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
    prev.sectionId === next.sectionId &&
    prev.isTopLevel === next.isTopLevel &&
    sectionContainerRenderOptionsEqual(prev, next)
  );
}

function sectionContainerRenderOptionsEqual(
  prev: SectionContainerProps,
  next: SectionContainerProps,
): boolean {
  return (
    getSectionContainerRenderParamRows(
      prev.renderParamRows,
      prev.sceneSurface,
    ) ===
      getSectionContainerRenderParamRows(
        next.renderParamRows,
        next.sceneSurface,
      ) && (prev.sceneSurface ?? false) === (next.sceneSurface ?? false)
  );
}

function getSectionContainerRenderParamRows(
  renderParamRows: boolean | undefined,
  sceneSurface: boolean | undefined,
): boolean {
  return renderParamRows ?? !(sceneSurface ?? false);
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
  renderParamRows,
  sceneSurface,
}: {
  sectionId: string;
  isTopLevel: boolean;
  isGroup: boolean;
  isUserView: boolean;
  renderParamRows: boolean;
  sceneSurface: boolean;
}) {
  if (isGroup) {
    return null;
  }
  return (
    <SectionContainerCore
      sectionId={sectionId}
      isTopLevel={isTopLevel}
      isUserView={isUserView}
      fillSurface={sceneSurface || isTopLevel}
      renderParamRows={renderParamRows}
      scenePortGeometry={sceneSurface}
    />
  );
}
