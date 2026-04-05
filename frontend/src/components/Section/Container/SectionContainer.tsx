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
import { SectionContainerCore } from "./SectionContainerCore";
import type { SectionContainerHeaderRenderProps } from "./SectionContainerCoreResizabe";
import type { SectionChromeBodySurface } from "./sectionChrome";
import { getOutlineColor } from "./utils";

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
  headerRenderer,
  dragListeners,
  forceHideOutline = false,
  forceHideFrameBorder = false,
  forceTransparentBorder = false,
  forceHideTopDragHandle = false,
}: {
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  forceTransparentBackground?: boolean;
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
  const isActiveSection = useIsSectionUIActive(sectionId);
  const isAttachedTerminalActive = useIsSectionUIActive(
    attachedTerminalId ?? "__no_active_terminal__",
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
                  isGroup={isGroup}
                  layoutVariant="tight"
                />
              </div>
            </div>
          ) : (
            <>
              {!isGroup && (
                <SectionContainerCore
                  bodySurfaceOverride={bodySurfaceOverride}
                  forceTransparentBackground={forceTransparentBackground}
                  headerRenderer={headerRenderer}
                  sectionId={sectionId}
                  isUserView={isUserView}
                  forceHideOutline={forceHideOutline}
                  forceHideFrameBorder={forceHideFrameBorder}
                  forceTransparentBorder={forceTransparentBorder}
                  forceHideTopDragHandle={forceHideTopDragHandle}
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
    previousProps.headerRenderer === nextProps.headerRenderer &&
    previousProps.forceHideOutline === nextProps.forceHideOutline &&
    previousProps.forceHideFrameBorder === nextProps.forceHideFrameBorder &&
    previousProps.forceTransparentBorder === nextProps.forceTransparentBorder &&
    previousProps.forceHideTopDragHandle === nextProps.forceHideTopDragHandle &&
    _.isEqual(previousProps.dragListeners, nextProps.dragListeners),
);
