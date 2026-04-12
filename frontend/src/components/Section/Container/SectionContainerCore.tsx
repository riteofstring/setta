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
import {
  SectionContainerCoreResizable,
  type SectionContainerHeaderRenderProps,
} from "./SectionContainerCoreResizabe";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";
import { getOnSectionClick, useAiSectionHighlight } from "./utils";

type SectionContainerCoreProps = {
  bodySurfaceOverride?: SectionChromeBodySurface | undefined;
  forceTransparentBackground?: boolean;
  headerRenderer?:
    | React.ComponentType<SectionContainerHeaderRenderProps>
    | undefined;
  sectionId: string;
  isUserView: boolean;
  forceHideOutline?: boolean;
  forceHideFrameBorder?: boolean;
  forceTransparentBorder?: boolean;
  forceHideTopDragHandle?: boolean;
  hideAgenticEdgeHandles?: boolean;
  omitAgenticHandleScopeClass?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
};

function _SectionContainerCore({
  bodySurfaceOverride,
  forceTransparentBackground = false,
  headerRenderer,
  sectionId,
  isUserView,
  forceHideOutline = false,
  forceHideFrameBorder = false,
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
  const sectionShellStyle = sectionStyleVars;
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
      data-setta-viewport-interaction-shell="true"
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
        forceTransparentBackground={forceTransparentBackground}
        headerRenderer={headerRenderer}
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        hideHeader={isAttachedTerminalChild}
        hasSectionStyleTheme={hasSectionStyleTheme}
        forceHideFrameBorder={forceHideFrameBorder}
        forceHideTopDragHandle={forceHideTopDragHandle}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (previousProps, nextProps) =>
    previousProps.bodySurfaceOverride === nextProps.bodySurfaceOverride &&
    previousProps.forceTransparentBackground ===
      nextProps.forceTransparentBackground &&
    previousProps.headerRenderer === nextProps.headerRenderer &&
    previousProps.sectionId === nextProps.sectionId &&
    previousProps.isUserView === nextProps.isUserView &&
    previousProps.forceHideOutline === nextProps.forceHideOutline &&
    previousProps.forceHideFrameBorder === nextProps.forceHideFrameBorder &&
    previousProps.forceTransparentBorder === nextProps.forceTransparentBorder &&
    previousProps.forceHideTopDragHandle === nextProps.forceHideTopDragHandle &&
    previousProps.hideAgenticEdgeHandles === nextProps.hideAgenticEdgeHandles &&
    previousProps.omitAgenticHandleScopeClass ===
      nextProps.omitAgenticHandleScopeClass &&
    previousProps.joinedCorners === nextProps.joinedCorners,
);
