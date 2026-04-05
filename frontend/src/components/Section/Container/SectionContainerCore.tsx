import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import {
  getAttachedTerminalParentIdForTerminalSection,
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
} from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useAgenticScopeHighlights, useProjectState } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";
import "./dndline.css";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";
import {
  type SectionChromeBodySurface,
  getSectionContainerShellClassName,
  resolveSectionChromeShellDecorations,
} from "./sectionChrome";
import { useSectionChromeAppearance } from "./sectionChromeAppearance";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";
import { getOnSectionClick, useAiSectionHighlight } from "./utils";

type SectionContainerCoreProps = {
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  sectionId: string;
  isUserView: boolean;
  forceHideOutline?: boolean;
  forceTransparentBorder?: boolean;
  forceHideTopDragHandle?: boolean;
  hideAgenticEdgeHandles?: boolean;
  omitAgenticHandleScopeClass?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
};

function _SectionContainerCore({
  bodySurfaceOverride,
  sectionId,
  isUserView,
  forceHideOutline = false,
  forceTransparentBorder = false,
  forceHideTopDragHandle = false,
  hideAgenticEdgeHandles = false,
  omitAgenticHandleScopeClass = false,
  joinedCorners = "none",
}: SectionContainerCoreProps) {
  const {
    sectionTypeName,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    textBlockMetaControlStyle,
    projectConfigId,
    isAttachedTerminalChild,
    styleColor,
    isJoinedAttachedTerminalChild,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const isAttachedTerminalChild =
      getAttachedTerminalParentIdForTerminalSection(x, sectionId) !== null;
    const isJoinedAttachedTerminalChild =
      getEmbeddedAttachedTerminalParentIdForTerminalSection(x, sectionId) !==
        null && !impl.isMinimized;
    return {
      sectionTypeName: impl.type,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      projectConfigId: x.projectConfig.id,
      isAttachedTerminalChild,
      styleColor: impl.styleColor,
      isJoinedAttachedTerminalChild,
    };
  }, shallow);
  const isActiveSection = useIsSectionUIActive(sectionId);
  const showAiHighlight = useAiSectionHighlight(sectionId, projectConfigId);
  const { scopeReadMap, scopeWriteMap } = useAgenticScopeHighlights(
    (state) => ({
      scopeReadMap:
        state.readSectionIdsByProjectConfigId[projectConfigId] ?? null,
      scopeWriteMap:
        state.writeSectionIdsByProjectConfigId[projectConfigId] ?? null,
    }),
    shallow,
  );
  const isWriteScope = Boolean(scopeWriteMap?.[sectionId]);
  const isReadScope = !isWriteScope && Boolean(scopeReadMap?.[sectionId]);
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isGlobalVariables = sectionTypeName === SectionTypeEnum.GlobalVariables;
  const { hasSectionStyleTheme, sectionStyleVars, useMetaControlStyle } =
    useSectionChromeAppearance({
      sectionId,
      sectionTypeName,
      styleColor,
      textBlockMetaControlStyle,
    });
  const shellDecorations = resolveSectionChromeShellDecorations({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    showAiHighlight,
    isReadScope,
    isWriteScope,
  });
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
  const sectionShellClassName = getSectionContainerShellClassName({
    outlineTone: shellDecorations.outlineTone,
    scopeHighlight: shellDecorations.scopeHighlight,
    showAiHighlight: shellDecorations.showAiHighlight,
    useMetaControlStyle,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    forceHideOutline,
    forceTransparentBorder,
    joinedCorners,
    isJoinedAttachedTerminalChild,
    omitAgenticHandleScopeClass,
  });
  const sectionShellStyle = viewportInteractionActive
    ? ({
        ...sectionStyleVars,
        willChange: "transform",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        isolation: "isolate",
      } as React.CSSProperties)
    : sectionStyleVars;
  const shouldRenderSharedChatHandles =
    !hideAgenticEdgeHandles && !isAttachedTerminalChild;
  const isWorkflowOnlyNodeSection =
    sectionTypeName === SectionTypeEnum.StateMachineStart ||
    sectionTypeName === SectionTypeEnum.StateMachineGate ||
    sectionTypeName === SectionTypeEnum.StateMachineEnd;
  const shouldRenderChatSharedHandles =
    shouldRenderSharedChatHandles && sectionTypeName === SectionTypeEnum.Chat;
  const shouldRenderAgenticEdgeHandles =
    shouldRenderSharedChatHandles &&
    !shouldRenderChatSharedHandles &&
    !isWorkflowOnlyNodeSection;
  const shouldRenderStateMachineEdgeHandles =
    shouldRenderSharedChatHandles && isWorkflowOnlyNodeSection;

  return (
    <section
      className={`${sectionShellClassName} ${shellDecorations.zIndexClassName}`}
      onClick={getOnSectionClick(sectionId)}
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-section-active={isActiveSection ? "true" : "false"}
      style={sectionShellStyle}
    >
      {shouldRenderChatSharedHandles ? (
        <ChatSharedEdgeHandles isUserView={isUserView} />
      ) : null}
      {shouldRenderAgenticEdgeHandles ? (
        <AgenticEdgeHandles isUserView={isUserView} />
      ) : null}
      {shouldRenderStateMachineEdgeHandles ? (
        <StateMachineEdgeHandles isUserView={isUserView} />
      ) : null}
      <MinimizedDataEdgeHandles sectionId={sectionId} />
      <SectionContainerCoreResizable
        bodySurfaceOverride={bodySurfaceOverride}
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        hideHeader={isAttachedTerminalChild}
        hasSectionStyleTheme={hasSectionStyleTheme}
        forceHideTopDragHandle={forceHideTopDragHandle}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (previousProps, nextProps) =>
    previousProps.bodySurfaceOverride === nextProps.bodySurfaceOverride &&
    previousProps.sectionId === nextProps.sectionId &&
    previousProps.isUserView === nextProps.isUserView &&
    previousProps.forceHideOutline === nextProps.forceHideOutline &&
    previousProps.forceTransparentBorder === nextProps.forceTransparentBorder &&
    previousProps.forceHideTopDragHandle === nextProps.forceHideTopDragHandle &&
    previousProps.hideAgenticEdgeHandles === nextProps.hideAgenticEdgeHandles &&
    previousProps.omitAgenticHandleScopeClass ===
      nextProps.omitAgenticHandleScopeClass &&
    previousProps.joinedCorners === nextProps.joinedCorners,
);
