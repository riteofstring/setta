import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import {
  getAttachedTerminalParentIdForTerminalSection,
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalParentIdForTerminalSection,
} from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import {
  useAgenticScopeHighlights,
  useLocalStorage,
  useProjectState,
  useTemporaryMiscState,
} from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";
import "./dndline.css";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";
import { getSectionContainerShellClassName } from "./sectionChrome";
import { SectionContainerCoreBody } from "./SectionContainerCoreBody";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";
import { getBgColor, getOnSectionClick, useAiSectionHighlight } from "./utils";

type SectionContainerCoreProps = {
  sectionId: string;
  isUserView: boolean;
  forceHideOutline?: boolean;
  hideAgenticEdgeHandles?: boolean;
  omitAgenticHandleScopeClass?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
};

function _SectionContainerCore({
  sectionId,
  isUserView,
  forceHideOutline = false,
  hideAgenticEdgeHandles = false,
  omitAgenticHandleScopeClass = false,
  joinedCorners = "none",
}: SectionContainerCoreProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const {
    sectionTypeName,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    textBlockMetaControlStyle,
    projectConfigId,
    isMinimized,
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
      isMinimized: impl.isMinimized,
      isAttachedTerminalChild,
      styleColor: impl.styleColor,
      isJoinedAttachedTerminalChild,
    };
  }, shallow);
  const isActiveSection = useIsSectionUIActive(sectionId);
  const showAiHighlight = useAiSectionHighlight(sectionId, projectConfigId);
  const aiHighlightClassName = showAiHighlight
    ? "setta-ai-gradient-border setta-ai-gradient-border-active"
    : "";
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
  const scopeHighlightClassName = isWriteScope
    ? "ring-2 ring-amber-400/70 ring-inset"
    : isReadScope
      ? "ring-2 ring-emerald-400/70 ring-inset"
      : "";
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isGlobalVariables = sectionTypeName === SectionTypeEnum.GlobalVariables;
  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const useMetaControlStyle = isMetaControl || textBlockMetaControlStyle;
  const bgColor = useMetaControlStyle
    ? "bg-transparent"
    : getBgColor(sectionTypeName);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const darkMode = useLocalStorage((x) => x.darkMode);
  const sectionStyleTheme =
    resolvedStyleColor && !useMetaControlStyle
      ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
      : null;
  const hasSectionStyleTheme = Boolean(sectionStyleTheme);
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
  const sectionStyleVars = sectionStyleTheme
    ? ({
        "--setta-section-style-bg": sectionStyleTheme.bg,
        "--setta-section-style-panel-bg": sectionStyleTheme.panelBg,
        "--setta-section-style-border": sectionStyleTheme.border,
        "--setta-section-style-outline": sectionStyleTheme.outline,
        "--setta-section-style-text": sectionStyleTheme.text,
        "--setta-section-style-muted-text": sectionStyleTheme.mutedText,
        "--setta-section-style-arg-handle": sectionStyleTheme.border,
        "--setta-section-style-arg-handle-hover": sectionStyleTheme.outline,
        "--setta-section-style-arg-handle-active": sectionStyleTheme.border,
        "--setta-section-style-agentic-handle": sectionStyleTheme.outline,
      } as React.CSSProperties)
    : undefined;
  const sectionShellClassName = getSectionContainerShellClassName({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    useMetaControlStyle,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    forceHideOutline,
    joinedCorners,
    isJoinedAttachedTerminalChild,
    omitAgenticHandleScopeClass,
    aiHighlightClassName,
    scopeHighlightClassName,
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
    !hideAgenticEdgeHandles &&
    !isAttachedTerminalChild &&
    benchmark.renderSectionHandles;
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
      className={`${sectionShellClassName} ${isActiveSection ? "z-[150]" : "z-10"}`}
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
      {benchmark.renderSectionHandles ? (
        <MinimizedDataEdgeHandles sectionId={sectionId} />
      ) : null}
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        bgColor={bgColor}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        hideHeader={isAttachedTerminalChild}
        hasSectionStyleTheme={hasSectionStyleTheme}
        textBlockMetaControlStyle={textBlockMetaControlStyle}
        body={
          <SectionContainerCoreBody
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            bgColor={bgColor}
            isMinimized={isMinimized}
            isUserView={isUserView}
          />
        }
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (p, n) => p.isUserView === n.isUserView,
);
