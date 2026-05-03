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

type SectionContainerProps = {
  sectionId: string;
  isTopLevel: boolean;
  dragListeners?: SectionDragListeners;
  renderNestedContent?: boolean;
  renderParamRows?: boolean;
  sceneSurface?: boolean;
};

function _SectionContainer({
  sectionId,
  isTopLevel,
  dragListeners,
  renderNestedContent = true,
  renderParamRows,
  sceneSurface = false,
}: SectionContainerProps) {
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
    sectionContainerRenderOptionsEqual(prev, next) &&
    _.isEqual(prev.dragListeners, next.dragListeners)
  );
}

function sectionContainerRenderOptionsEqual(
  prev: SectionContainerProps,
  next: SectionContainerProps,
): boolean {
  return (
    (prev.renderNestedContent ?? true) === (next.renderNestedContent ?? true) &&
    getSectionContainerRenderParamRows(
      prev.renderParamRows,
      prev.sceneSurface,
    ) ===
      getSectionContainerRenderParamRows(
        next.renderParamRows,
        next.sceneSurface,
      ) &&
    (prev.sceneSurface ?? false) === (next.sceneSurface ?? false)
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
  renderParamRows,
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
  renderParamRows: boolean;
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
        renderParamRows={renderParamRows}
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
        renderParamRows={renderParamRows}
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
  renderParamRows,
  sceneSurface,
}: {
  sectionId: string;
  isTopLevel: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  isJoinedGroupActive: boolean;
  isInOtherProjectConfigs: boolean;
  renderParamRows: boolean;
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
      <AgenticEdgeHandles
        isUserView={isUserView}
        scenePortGeometry={sceneSurface}
      />
      <SectionContainerCore
        sectionId={sectionId}
        isTopLevel={isTopLevel}
        isUserView={isUserView}
        forceHideOutline={true}
        hideAgenticEdgeHandles={true}
        omitAgenticHandleScopeClass={true}
        joinedCorners="code-terminal-parent"
        fillSurface={sceneSurface || isTopLevel}
        renderParamRows={renderParamRows}
        scenePortGeometry={sceneSurface}
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
