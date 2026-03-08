import { NodeIdProvider } from "forks/xyflow/core/contexts/NodeIdContext";
import _ from "lodash";
import React from "react";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
  getSectionShouldRender,
  getSectionViewModeVisibility,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";
import { getOutlineColor } from "./utils";

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
    positionAndSizeLocked,
    isInOtherProjectConfigs,
    attachedTerminalId,
    isJoinedAttachedTerminalGroup,
  } = useProjectState((x) => {
    const { visibility, isEditingViewMode } = getSectionViewModeVisibility(
      sectionId,
      x,
    );
    const viewMode = getActiveViewModeConfig(x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const pythonTarget = getPythonCodegenTarget(x.projectConfig);
    let isJoinedAttachedTerminalGroup = false;
    let attachedTerminalId: string | null = null;

    const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
      x,
      sectionId,
    );
    if (embeddedTerminal) {
      isJoinedAttachedTerminalGroup = !embeddedTerminal.isTerminalMinimized;
      attachedTerminalId = embeddedTerminal.attachedTerminalId;
    }
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
      positionAndSizeLocked: impl.positionAndSizeLocked,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      attachedTerminalId,
      isJoinedAttachedTerminalGroup,
    };
  }, shallow);
  const isActiveSection = useProjectState((x) =>
    x.projectConfig.activeIds.includes(sectionId),
  );
  const isAttachedTerminalActive = useProjectState((x) =>
    attachedTerminalId === null
      ? false
      : x.projectConfig.activeIds.includes(attachedTerminalId),
  );
  const isJoinedGroupActive = isActiveSection || isAttachedTerminalActive;

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
          {!isGroup && isJoinedAttachedTerminalGroup ? (
            <div
              className={`agentic-handle-scope transition-radius relative flex w-min flex-col ${positionAndSizeLocked ? "rounded-sm" : "rounded-lg"} outline outline-4 ${getOutlineColor(
                {
                  isActiveSection: isJoinedGroupActive,
                  isGlobalVariables: false,
                  isInOtherProjectConfigs,
                },
              )}`}
              data-joined-code-terminal-group
            >
              <AgenticEdgeHandles isUserView={isUserView} />
              <SectionContainerCore
                sectionId={sectionId}
                isUserView={isUserView}
                forceHideOutline={true}
                hideAgenticEdgeHandles={true}
                omitAgenticHandleScopeClass={true}
                joinedCorners="code-terminal-parent"
              />
              <div className="-mt-px">
                <MaybeManyNestedSections
                  sectionId={sectionId}
                  isGroup={isGroup}
                  layoutVariant="tight"
                />
              </div>
            </div>
          ) : (
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
                <MaybeManyNestedSections
                  sectionId={sectionId}
                  isGroup={isGroup}
                />
              )}
            </>
          )}
        </>
      </ContainerSwitch>
    </NodeIdProvider>
  );
}
export const SectionContainer = React.memo(_SectionContainer, (p, n) =>
  _.isEqual(p.dragListeners, n.dragListeners),
);
