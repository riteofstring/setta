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
  type ZustandProjectState,
} from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { isBareSectionNodeType } from "utils/bareSectionNodes";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { buildSectionStyleVars } from "utils/sectionStyleVars";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { BareSectionNodeSurface } from "./BareSectionNodeSurface";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";
import "./dndline.css";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";
import { getSectionContainerShellClassName } from "./sectionChrome";
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

type SectionContainerSnapshot = {
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  positionAndSizeLocked: boolean;
  textBlockMetaControlStyle: boolean;
  projectConfigId: string;
  isAttachedTerminalChild: boolean;
  isMinimized: boolean;
  styleColor: string | null;
  isJoinedAttachedTerminalChild: boolean;
};

type SectionEdgeHandleMode = "agentic" | "chat" | "none" | "state-machine";

const WORKFLOW_ONLY_SECTION_TYPES = new Set<SectionType>([
  SectionTypeEnum.StateMachineStart,
  SectionTypeEnum.StateMachineGate,
  SectionTypeEnum.StateMachineEnd,
]);

const EDGE_HANDLE_COMPONENTS = {
  agentic: AgenticEdgeHandles,
  chat: ChatSharedEdgeHandles,
  "state-machine": StateMachineEdgeHandles,
} satisfies Record<
  Exclude<SectionEdgeHandleMode, "none">,
  React.ComponentType<{ isUserView: boolean }>
>;

function getSectionContainerSnapshot(
  state: ZustandProjectState,
  sectionId: string,
): SectionContainerSnapshot {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const isAttachedTerminalChild =
    getAttachedTerminalParentIdForTerminalSection(state, sectionId) !== null;
  const isJoinedAttachedTerminalChild =
    getEmbeddedAttachedTerminalParentIdForTerminalSection(state, sectionId) !==
      null && !impl.isMinimized;
  return {
    sectionTypeName: impl.type,
    isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
    positionAndSizeLocked: impl.positionAndSizeLocked,
    textBlockMetaControlStyle:
      impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
    projectConfigId: state.projectConfig.id,
    isAttachedTerminalChild,
    isMinimized: impl.isMinimized,
    styleColor: impl.styleColor,
    isJoinedAttachedTerminalChild,
  };
}

function getScopeHighlightClassName(
  isWriteScope: boolean,
  hasReadScope: boolean,
) {
  if (isWriteScope) {
    return "ring-2 ring-amber-400/70 ring-inset";
  }
  if (hasReadScope) {
    return "ring-2 ring-emerald-400/70 ring-inset";
  }
  return "";
}

function getAiHighlightClassName(showAiHighlight: boolean) {
  return showAiHighlight
    ? "setta-ai-gradient-border setta-ai-gradient-border-active"
    : "";
}

function getSectionTypeChromeState(
  sectionTypeName: SectionType,
  textBlockMetaControlStyle: boolean,
) {
  const isGlobalVariables = sectionTypeName === SectionTypeEnum.GlobalVariables;
  const useMetaControlStyle =
    sectionTypeName === SectionTypeEnum.MetaControl ||
    textBlockMetaControlStyle;
  return { isGlobalVariables, useMetaControlStyle };
}

function resolvePreviewStyleColor(
  previewStyleColor: string | null | undefined,
  styleColor: string | null,
) {
  return previewStyleColor === undefined ? styleColor : previewStyleColor;
}

function getSectionStyleVarsOrUndefined({
  darkMode,
  resolvedStyleColor,
  useMetaControlStyle,
}: {
  darkMode: boolean;
  resolvedStyleColor: string | null;
  useMetaControlStyle: boolean;
}) {
  if (!resolvedStyleColor || useMetaControlStyle) {
    return undefined;
  }
  return buildSectionStyleVars(resolvedStyleColor, darkMode);
}

function getSectionShellStyle(
  sectionStyleVars: React.CSSProperties | undefined,
  viewportInteractionActive: boolean,
) {
  if (!viewportInteractionActive) {
    return sectionStyleVars;
  }
  return {
    ...sectionStyleVars,
    willChange: "transform",
    transform: "translateZ(0)",
    backfaceVisibility: "hidden",
    isolation: "isolate",
  } satisfies React.CSSProperties;
}

function getSectionEdgeHandleMode({
  hideAgenticEdgeHandles,
  isAttachedTerminalChild,
  sectionTypeName,
}: {
  hideAgenticEdgeHandles: boolean;
  isAttachedTerminalChild: boolean;
  sectionTypeName: SectionType;
}): SectionEdgeHandleMode {
  if (hideAgenticEdgeHandles || isAttachedTerminalChild) {
    return "none";
  }
  if (sectionTypeName === SectionTypeEnum.Chat) {
    return "chat";
  }
  if (WORKFLOW_ONLY_SECTION_TYPES.has(sectionTypeName)) {
    return "state-machine";
  }
  return "agentic";
}

function SectionEdgeHandles({
  isUserView,
  mode,
}: {
  isUserView: boolean;
  mode: SectionEdgeHandleMode;
}) {
  if (mode === "none") {
    return null;
  }
  const EdgeHandles = EDGE_HANDLE_COMPONENTS[mode];
  return <EdgeHandles isUserView={isUserView} />;
}

function SectionContainerContent({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isUserView,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  isMinimized,
  hideHeader,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  isMinimized: boolean;
  hideHeader: boolean;
}) {
  if (isBareSectionNodeType(sectionTypeName)) {
    return (
      <BareSectionNodeSurface
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        hasSectionStyleTheme={hasSectionStyleTheme}
        bgColor={getBgColor(sectionTypeName)}
        isMinimized={isMinimized}
      />
    );
  }

  return (
    <SectionContainerCoreResizable
      sectionId={sectionId}
      sectionTypeName={sectionTypeName}
      isInOtherProjectConfigs={isInOtherProjectConfigs}
      isUserView={isUserView}
      positionAndSizeLocked={positionAndSizeLocked}
      hideHeader={hideHeader}
      hasSectionStyleTheme={hasSectionStyleTheme}
    />
  );
}

function _SectionContainerCore({
  sectionId,
  isUserView,
  forceHideOutline = false,
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
    isMinimized,
    styleColor,
    isJoinedAttachedTerminalChild,
  } = useProjectState(
    (x) => getSectionContainerSnapshot(x, sectionId),
    shallow,
  );
  const isActiveSection = useIsSectionUIActive(sectionId);
  const showAiHighlight = useAiSectionHighlight(sectionId, projectConfigId);
  const aiHighlightClassName = getAiHighlightClassName(showAiHighlight);
  const { scopeReadMap, scopeWriteMap } = useAgenticScopeHighlights(
    (state) => ({
      scopeReadMap:
        state.readSectionIdsByProjectConfigId[projectConfigId] ?? null,
      scopeWriteMap:
        state.writeSectionIdsByProjectConfigId[projectConfigId] ?? null,
    }),
    shallow,
  );
  const scopeHighlightClassName = getScopeHighlightClassName(
    Boolean(scopeWriteMap?.[sectionId]),
    Boolean(scopeReadMap?.[sectionId]),
  );
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const { isGlobalVariables, useMetaControlStyle } = getSectionTypeChromeState(
    sectionTypeName,
    textBlockMetaControlStyle,
  );
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (x) => x[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor = resolvePreviewStyleColor(
    previewStyleColor,
    styleColor,
  );
  const darkMode = useLocalStorage((x) => x.darkMode);
  const sectionStyleVars = getSectionStyleVarsOrUndefined({
    darkMode,
    resolvedStyleColor,
    useMetaControlStyle,
  });
  const hasSectionStyleTheme = Boolean(sectionStyleVars);
  const viewportInteractionActive = useReactFlow(
    (state) => state.viewportInteractionActive,
  );
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
  const sectionShellStyle = getSectionShellStyle(
    sectionStyleVars,
    viewportInteractionActive,
  );
  const edgeHandleMode = getSectionEdgeHandleMode({
    hideAgenticEdgeHandles,
    isAttachedTerminalChild,
    sectionTypeName,
  });

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
      <SectionEdgeHandles isUserView={isUserView} mode={edgeHandleMode} />
      <MinimizedDataEdgeHandles sectionId={sectionId} />
      <SectionContainerContent
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        hasSectionStyleTheme={hasSectionStyleTheme}
        isMinimized={isMinimized}
        hideHeader={isAttachedTerminalChild}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (p, n) => p.isUserView === n.isUserView,
);
