import { NodeIdProvider } from "forks/xyflow/core/contexts/NodeIdContext";
import _ from "lodash";
import React from "react";
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
  getSectionViewModeVisibility,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ContainerSwitch } from "./ContainerSwitch";
import { SectionContainerCore } from "./SectionContainerCore";
import { SectionContainerCoreBody } from "./SectionContainerCoreBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import { buildSectionContainerView } from "./sectionContainerView";
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
    textBlockMetaControlStyle,
    isMinimized,
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
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      isMinimized: impl.isMinimized,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      attachedTerminalId,
      isJoinedAttachedTerminalGroup,
    };
  }, shallow);
  const isActiveSection = useIsSectionUIActive(sectionId);
  const isAttachedTerminalActive = useIsSectionUIActive(
    attachedTerminalId ?? "__no_active_terminal__",
  );
  const isJoinedGroupActive = isActiveSection || isAttachedTerminalActive;

  const view = buildSectionContainerView({
    sectionId,
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
    textBlockMetaControlStyle,
    isMinimized,
    isJoinedAttachedTerminalGroup,
  });

  if (view.kind === "none") {
    return null;
  }

  const nestedSections = (
    <SectionContainerNestedSections
      {...view.nestedSectionsProps}
      isJoinedCodeTerminalGroup={view.kind === "joined-code-terminal-group"}
    />
  );
  const core = view.core ? (
    <SectionContainerCore
      {...view.core.props}
      body={<SectionContainerCoreBody {...view.core.bodyProps} />}
    />
  ) : null;

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
          {view.kind === "joined-code-terminal-group" ? (
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
              {core}
              {nestedSections}
            </div>
          ) : (
            <>
              {core}
              {nestedSections}
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
