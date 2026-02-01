import { NodeIdProvider } from "forks/xyflow/core/contexts/NodeIdContext";
import _ from "lodash";
import React from "react";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  isBaseCodeSectionType,
  getSectionShouldRender,
  getSectionViewModeVisibility,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";

function _SectionContainer({
  sectionId,
  isTopLevel,
  dragListeners,
}: {
  sectionId: string;
  isTopLevel: boolean;
  dragListeners?: any;
}) {
  const {
    visibility,
    isEditingViewMode,
    isGroup,
    isCode,
    isUserView,
    isGenPython,
    isGenPythonMetadata,
    hasPythonCodegen,
    hasMetadata,
    sectionTypeName,
  } = useProjectState((x) => {
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      sectionId,
      x,
    );
    const viewMode = getActiveViewModeConfig(x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const pythonTarget = getPythonCodegenTarget(x.projectConfig);
    return {
      visibility,
      isEditingViewMode,
      isUserView: viewMode.isUserFacing && !isEditingViewMode,
      isGroup: impl.type === SectionTypeEnum.Group,
      isCode: isBaseCodeSectionType(impl.type),
      isGenPython: impl.type === SectionTypeEnum.GenPythonCode,
      isGenPythonMetadata: impl.type === SectionTypeEnum.GenPythonMetadata,
      hasPythonCodegen: projectConfigHasPythonCodegen(x.projectConfig),
      hasMetadata: Boolean(pythonTarget?.generateMetadata),
      sectionTypeName: impl.type,
    };
  }, _.isEqual);

  if (isGenPython && !hasPythonCodegen) {
    return null;
  }
  if (isGenPythonMetadata && !hasMetadata) {
    return null;
  }

  if (!getSectionShouldRender(visibility, isEditingViewMode)) {
    return null;
  }

  return (
    <NodeIdProvider value={sectionId}>
      <ContainerSwitch
        isGroup={isGroup}
        sectionId={sectionId}
        dragListeners={dragListeners}
        isTopLevel={isTopLevel}
        visibility={visibility}
        isEditingViewMode={isEditingViewMode}
        isUserView={isUserView}
      >
        <>
          {!isGroup && (
            <SectionContainerCore
              sectionId={sectionId}
              isUserView={isUserView}
            />
          )}
          {isCode ? (
            <MaybeManyNestedSections
              sectionId={sectionId}
              isGroup={isGroup}
              layoutVariant="tight"
            />
          ) : (
            <MaybeManyNestedSections sectionId={sectionId} isGroup={isGroup} />
          )}
        </>
      </ContainerSwitch>
    </NodeIdProvider>
  );
}
export const SectionContainer = React.memo(
  _SectionContainer,
  (p, n) => _.isEqual(p.dragListeners, n.dragListeners),
);
