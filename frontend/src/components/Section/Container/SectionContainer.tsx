import { NodeIdContext } from "gpuFlow/NodeIdContext";
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
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ContainerSwitch } from "./ContainerSwitch";
import { MaybeManyNestedSections } from "./ManyNestedSections";
import { SectionContainerCore } from "./SectionContainerCore";
import { getOutlineColor } from "./utils";

type SectionDragListeners = React.HTMLAttributes<HTMLDivElement>;

function _SectionContainer({
  sectionId,
  isTopLevel,
  dragListeners,
  renderNestedContent = true,
  sceneSurface = false,
}: {
  sectionId: string;
  isTopLevel: boolean;
  dragListeners?: SectionDragListeners;
  renderNestedContent?: boolean;
  sceneSurface?: boolean;
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
    const sectionType = impl.type as SectionType;
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
      isUserView: Boolean(viewMode.isUserFacing) && !isEditingViewMode,
      isGroup: sectionType === SectionTypeEnum.Group,
      isCode: isBaseCodeSectionType(sectionType),
      isGenPython: sectionType === SectionTypeEnum.GenPythonCode,
      isGenPythonMetadata: sectionType === SectionTypeEnum.GenPythonMetadata,
      hasPythonCodegen: projectConfigHasPythonCodegen(x.projectConfig),
      hasMetadata: Boolean(pythonTarget?.generateMetadata),
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
        {...(dragListeners !== undefined ? { dragListeners } : {})}
      >
        <SectionContainerContent
          sectionId={sectionId}
          isTopLevel={isTopLevel}
          isGroup={isGroup}
          isCode={isCode}
          isUserView={isUserView}
          isJoinedAttachedTerminalGroup={isJoinedAttachedTerminalGroup}
          positionAndSizeLocked={positionAndSizeLocked}
          isJoinedGroupActive={isJoinedGroupActive}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          renderNestedContent={renderNestedContent}
          sceneSurface={sceneSurface}
        />
      </ContainerSwitch>
    </NodeIdContext.Provider>
  );
}
export const SectionContainer = React.memo(
  _SectionContainer,
  (p, n) =>
    p.sectionId === n.sectionId &&
    p.isTopLevel === n.isTopLevel &&
    (p.renderNestedContent ?? true) === (n.renderNestedContent ?? true) &&
    (p.sceneSurface ?? false) === (n.sceneSurface ?? false) &&
    _.isEqual(p.dragListeners, n.dragListeners),
);

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

function SectionContainerContent({
  sectionId,
  isTopLevel,
  isGroup,
  isCode,
  isUserView,
  isJoinedAttachedTerminalGroup,
  positionAndSizeLocked,
  isJoinedGroupActive,
  isInOtherProjectConfigs,
  renderNestedContent,
  sceneSurface,
}: {
  sectionId: string;
  isTopLevel: boolean;
  isGroup: boolean;
  isCode: boolean;
  isUserView: boolean;
  isJoinedAttachedTerminalGroup: boolean;
  positionAndSizeLocked: boolean;
  isJoinedGroupActive: boolean;
  isInOtherProjectConfigs: boolean;
  renderNestedContent: boolean;
  sceneSurface: boolean;
}) {
  if (!isGroup && isJoinedAttachedTerminalGroup && renderNestedContent) {
    return (
      <JoinedCodeTerminalGroup
        sectionId={sectionId}
        isTopLevel={isTopLevel}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        isJoinedGroupActive={isJoinedGroupActive}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        sceneSurface={sceneSurface}
      />
    );
  }

  return (
    <>
      <StandardSectionSurface
        sectionId={sectionId}
        isTopLevel={isTopLevel}
        isGroup={isGroup}
        isUserView={isUserView}
        sceneSurface={sceneSurface}
      />
      {renderNestedContent && (
        <SectionNestedContent
          sectionId={sectionId}
          isGroup={isGroup}
          layoutVariant={isCode ? "tight" : "default"}
        />
      )}
    </>
  );
}

function JoinedCodeTerminalGroup({
  sectionId,
  isTopLevel,
  isUserView,
  positionAndSizeLocked,
  isJoinedGroupActive,
  isInOtherProjectConfigs,
  sceneSurface,
}: {
  sectionId: string;
  isTopLevel: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  isJoinedGroupActive: boolean;
  isInOtherProjectConfigs: boolean;
  sceneSurface: boolean;
}) {
  return (
    <div
      className={getJoinedCodeTerminalGroupClassName({
        positionAndSizeLocked,
        isJoinedGroupActive,
        isInOtherProjectConfigs,
      })}
      data-joined-code-terminal-group
    >
      <AgenticEdgeHandles isUserView={isUserView} />
      <SectionContainerCore
        sectionId={sectionId}
        isTopLevel={isTopLevel}
        isUserView={isUserView}
        forceHideOutline={true}
        hideAgenticEdgeHandles={true}
        omitAgenticHandleScopeClass={true}
        joinedCorners="code-terminal-parent"
        fillSurface={sceneSurface || isTopLevel}
        useGpuResizeFrame={sceneSurface || isTopLevel}
      />
      <div className="-mt-px">
        <SectionNestedContent
          sectionId={sectionId}
          isGroup={false}
          layoutVariant="tight"
        />
      </div>
    </div>
  );
}

function StandardSectionSurface({
  sectionId,
  isTopLevel,
  isGroup,
  isUserView,
  sceneSurface,
}: {
  sectionId: string;
  isTopLevel: boolean;
  isGroup: boolean;
  isUserView: boolean;
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
      useGpuResizeFrame={sceneSurface || isTopLevel}
    />
  );
}

function SectionNestedContent({
  sectionId,
  isGroup,
  layoutVariant,
}: {
  sectionId: string;
  isGroup: boolean;
  layoutVariant: "default" | "tight";
}) {
  return (
    <MaybeManyNestedSections
      sectionId={sectionId}
      isGroup={isGroup}
      layoutVariant={layoutVariant}
    />
  );
}

function getJoinedCodeTerminalGroupClassName({
  positionAndSizeLocked,
  isJoinedGroupActive,
  isInOtherProjectConfigs,
}: {
  positionAndSizeLocked: boolean;
  isJoinedGroupActive: boolean;
  isInOtherProjectConfigs: boolean;
}) {
  return `agentic-handle-scope transition-radius relative flex w-min flex-col ${
    positionAndSizeLocked ? "rounded-sm" : "rounded-lg"
  } outline outline-4 ${getOutlineColor({
    isActiveSection: isJoinedGroupActive,
    isGlobalVariables: false,
    isInOtherProjectConfigs,
    jsonSourceMissing: false,
  })}`;
}
