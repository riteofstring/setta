import { recordSettingsGraphSubstrateCanaryMotionAttributionDuration } from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
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
import { MaybeManyNestedSections } from "./ManyNestedSections";
import {
  SectionContainerCore,
  type SectionContainerShellLayerSnapshot,
} from "./SectionContainerCore";
import type { SectionContainerHeaderRenderProps } from "./SectionContainerCoreResizabe";
import type { SectionChromeBodySurface } from "./sectionChrome";
import { getOutlineColor } from "./utils";

function handleSectionContainerRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionContainerReactRender",
    actualDuration,
  );
}

function areBodySurfaceOverridesEqual(
  previousBodySurfaceOverride: SectionChromeBodySurface | undefined,
  nextBodySurfaceOverride: SectionChromeBodySurface | undefined,
) {
  if (previousBodySurfaceOverride === nextBodySurfaceOverride) {
    return true;
  }
  if (
    previousBodySurfaceOverride === undefined ||
    nextBodySurfaceOverride === undefined
  ) {
    return false;
  }

  return (
    previousBodySurfaceOverride.bgColor === nextBodySurfaceOverride.bgColor &&
    _.isEqual(
      previousBodySurfaceOverride.surfaceDecorations,
      nextBodySurfaceOverride.surfaceDecorations,
    )
  );
}

function _SectionContainer({
  sectionId,
  isTopLevel = false,
  bodySurfaceOverride,
  forceTransparentBackground = false,
  shellChromeOwner = "section-body",
  headerRenderer,
  dragListeners,
  forceHideOutline = false,
  forceHideFrameBorder = false,
  forceTransparentBorder = false,
  forceHideTopDragHandle = false,
  shellLayerSnapshot,
}: {
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  forceTransparentBackground?: boolean;
  shellChromeOwner?: "section-body" | "shell-layer";
  headerRenderer?:
    | React.ComponentType<SectionContainerHeaderRenderProps>
    | undefined;
  sectionId: string;
  isTopLevel?: boolean;
  dragListeners?: any;
  forceHideOutline?: boolean;
  forceHideFrameBorder?: boolean;
  forceTransparentBorder?: boolean;
  forceHideTopDragHandle?: boolean;
  shellLayerSnapshot?: SectionContainerShellLayerSnapshot;
}) {
  const isTopLevelShellLayerCanaryPath =
    isTopLevel &&
    shellChromeOwner === "shell-layer" &&
    shellLayerSnapshot !== undefined;
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
    const shellLayerTypeName =
      shellChromeOwner === "shell-layer"
        ? shellLayerSnapshot?.sectionTypeName
        : undefined;
    const impl =
      shellLayerTypeName === undefined
        ? getCurrEffectiveSectionImpl(x, sectionId)
        : null;
    const sectionTypeName = shellLayerTypeName ?? impl?.type;
    if (!sectionTypeName) {
      throw new Error(
        `Missing section type for section container ${sectionId}.`,
      );
    }
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
    const { visibility, isEditingViewMode } = isTopLevelShellLayerCanaryPath
      ? { visibility: true, isEditingViewMode: false }
      : getSectionViewModeVisibility(sectionId, x);
    const isUserView = isTopLevelShellLayerCanaryPath
      ? false
      : getActiveViewModeConfig(x).isUserFacing && !isEditingViewMode;
    return {
      visibility,
      isEditingViewMode,
      isUserView,
      isGroup: sectionTypeName === SectionTypeEnum.Group,
      isCode: isBaseCodeSectionType(sectionTypeName),
      isGenPython: sectionTypeName === SectionTypeEnum.GenPythonCode,
      isGenPythonMetadata:
        sectionTypeName === SectionTypeEnum.GenPythonMetadata,
      hasPythonCodegen: projectConfigHasPythonCodegen(x.projectConfig),
      hasMetadata: Boolean(pythonTarget?.generateMetadata),
      sectionTypeName,
      positionAndSizeLocked:
        shellChromeOwner === "shell-layer" && shellLayerSnapshot
          ? shellLayerSnapshot.positionAndSizeLocked
          : impl?.positionAndSizeLocked ?? false,
      isInOtherProjectConfigs:
        shellChromeOwner === "shell-layer" && shellLayerSnapshot
          ? shellLayerSnapshot.isInOtherProjectConfigs
          : impl?.isInOtherProjectConfigs ?? false,
      attachedTerminalId,
      isJoinedAttachedTerminalGroup,
    };
  }, shallow);

  if (isGenPython && !hasPythonCodegen) {
    return null;
  }
  if (isGenPythonMetadata && !hasMetadata) {
    return null;
  }

  if (
    !isTopLevelShellLayerCanaryPath &&
    !getSectionShouldRender(visibility, isEditingViewMode)
  ) {
    return null;
  }

  const containerChildren = (
    <>
      {!isGroup && isJoinedAttachedTerminalGroup ? (
        <JoinedCodeTerminalGroupSectionContainer
          bodySurfaceOverride={bodySurfaceOverride}
          forceHideFrameBorder={forceHideFrameBorder}
          forceHideOutline={forceHideOutline}
          forceHideTopDragHandle={forceHideTopDragHandle}
          forceTransparentBackground={forceTransparentBackground}
          forceTransparentBorder={forceTransparentBorder}
          headerRenderer={headerRenderer}
          attachedTerminalId={attachedTerminalId}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
          isUserView={isUserView}
          positionAndSizeLocked={positionAndSizeLocked}
          sectionId={sectionId}
          shellChromeOwner={shellChromeOwner}
        />
      ) : (
        <>
          {!isGroup && (
            <SectionContainerCore
              bodySurfaceOverride={bodySurfaceOverride}
              forceTransparentBackground={forceTransparentBackground}
              shellChromeOwner={shellChromeOwner}
              headerRenderer={headerRenderer}
              sectionId={sectionId}
              isUserView={isUserView}
              forceHideOutline={forceHideOutline}
              forceHideFrameBorder={forceHideFrameBorder}
              forceTransparentBorder={forceTransparentBorder}
              forceHideTopDragHandle={forceHideTopDragHandle}
              shellLayerSnapshot={shellLayerSnapshot}
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
      )}
    </>
  );

  return (
    <React.Profiler
      id={`section-container:${sectionId}`}
      onRender={handleSectionContainerRender}
    >
      <NodeIdProvider value={sectionId}>
        {isTopLevelShellLayerCanaryPath ? (
          containerChildren
        ) : (
          <ContainerSwitch
            isGroup={isGroup}
            sectionId={sectionId}
            dragListeners={dragListeners}
            isTopLevel={isTopLevel}
            visibility={visibility}
            isEditingViewMode={isEditingViewMode}
            isUserView={isUserView}
          >
            {containerChildren}
          </ContainerSwitch>
        )}
      </NodeIdProvider>
    </React.Profiler>
  );
}
export const SectionContainer = React.memo(
  _SectionContainer,
  (previousProps, nextProps) =>
    previousProps.sectionId === nextProps.sectionId &&
    previousProps.isTopLevel === nextProps.isTopLevel &&
    areBodySurfaceOverridesEqual(
      previousProps.bodySurfaceOverride,
      nextProps.bodySurfaceOverride,
    ) &&
    previousProps.forceTransparentBackground ===
      nextProps.forceTransparentBackground &&
    previousProps.shellChromeOwner === nextProps.shellChromeOwner &&
    previousProps.headerRenderer === nextProps.headerRenderer &&
    previousProps.forceHideOutline === nextProps.forceHideOutline &&
    previousProps.forceHideFrameBorder === nextProps.forceHideFrameBorder &&
    previousProps.forceTransparentBorder === nextProps.forceTransparentBorder &&
    previousProps.forceHideTopDragHandle === nextProps.forceHideTopDragHandle &&
    previousProps.shellLayerSnapshot === nextProps.shellLayerSnapshot &&
    _.isEqual(previousProps.dragListeners, nextProps.dragListeners),
);

type JoinedCodeTerminalGroupSectionContainerProps = {
  attachedTerminalId: string | null;
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  forceHideFrameBorder: boolean;
  forceHideOutline: boolean;
  forceHideTopDragHandle: boolean;
  forceTransparentBackground: boolean;
  forceTransparentBorder: boolean;
  headerRenderer?:
    | React.ComponentType<SectionContainerHeaderRenderProps>
    | undefined;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  sectionId: string;
  shellChromeOwner: "section-body" | "shell-layer";
};

function JoinedCodeTerminalGroupSectionContainer({
  attachedTerminalId,
  bodySurfaceOverride,
  forceHideFrameBorder,
  forceHideOutline,
  forceHideTopDragHandle,
  forceTransparentBackground,
  forceTransparentBorder,
  headerRenderer,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  sectionId,
  shellChromeOwner,
}: JoinedCodeTerminalGroupSectionContainerProps) {
  const isActiveSection = useIsSectionUIActive(sectionId);
  const isAttachedTerminalActive = useIsSectionUIActive(
    attachedTerminalId ?? "__no_active_terminal__",
  );
  const isJoinedGroupActive = isActiveSection || isAttachedTerminalActive;

  return (
    <div
      className={`agentic-handle-scope transition-radius relative flex w-min flex-col ${positionAndSizeLocked ? "rounded-sm" : "rounded-lg"} outline ${forceHideOutline ? "outline-0" : "outline-4"} ${getOutlineColor(
        {
          jsonSourceMissing: false,
          isActiveSection: isJoinedGroupActive,
          isGlobalVariables: false,
          isInOtherProjectConfigs,
        },
      )}`}
      data-joined-code-terminal-group
    >
      <AgenticEdgeHandles isUserView={isUserView} />
      <SectionContainerCore
        bodySurfaceOverride={bodySurfaceOverride}
        forceTransparentBackground={forceTransparentBackground}
        shellChromeOwner={shellChromeOwner}
        headerRenderer={headerRenderer}
        sectionId={sectionId}
        isUserView={isUserView}
        forceHideOutline={true}
        forceHideFrameBorder={forceHideFrameBorder}
        forceTransparentBorder={forceTransparentBorder}
        forceHideTopDragHandle={forceHideTopDragHandle}
        hideAgenticEdgeHandles={true}
        omitAgenticHandleScopeClass={true}
        joinedCorners="code-terminal-parent"
      />
      <div className="-mt-px">
        <MaybeManyNestedSections
          sectionId={sectionId}
          isGroup={false}
          layoutVariant="tight"
        />
      </div>
    </div>
  );
}
