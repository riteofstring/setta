import { useGraphSurfaceImplementation } from "forks/xyflow/core/container/graphSurfaceImplementation";
import { isCanvasOwnedSectionShell } from "forks/xyflow/core/container/sectionShellCanvasOwnership";
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
import { getSectionStylePreviewColorKey } from "utils/constants";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import { ChatSharedEdgeHandles } from "./ChatSharedEdgeHandles";
import "./dndline.css";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";
import { getSectionContainerShellClassName } from "./sectionChrome";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";
import { getOnSectionClick, useAiSectionHighlight } from "./utils";

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

function getSectionStyleThemeOrNull({
  darkMode,
  resolvedStyleColor,
  useMetaControlStyle,
}: {
  darkMode: boolean;
  resolvedStyleColor: string | null;
  useMetaControlStyle: boolean;
}) {
  if (!resolvedStyleColor || useMetaControlStyle) {
    return null;
  }
  return deriveSectionStyleTheme(resolvedStyleColor, darkMode);
}

function resolveSectionStyleVars(
  sectionStyleTheme: ReturnType<typeof deriveSectionStyleTheme> | null,
) {
  if (!sectionStyleTheme) {
    return undefined;
  }
  return {
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
  } satisfies React.CSSProperties;
}

function getSectionShellStyle(
  sectionStyleVars: React.CSSProperties | undefined,
  canvasOwnedShell: boolean,
) {
  return canvasOwnedShell
    ? {
        ...sectionStyleVars,
        backgroundColor: "transparent",
        borderColor: "transparent",
      }
    : sectionStyleVars;
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
  const sectionStyleTheme = getSectionStyleThemeOrNull({
    darkMode,
    resolvedStyleColor,
    useMetaControlStyle,
  });
  const hasSectionStyleTheme = Boolean(sectionStyleTheme);
  const graphSurfaceImplementation = useGraphSurfaceImplementation();
  const canvasOwnedShell =
    graphSurfaceImplementation === "canvas-shell-underlay" &&
    isCanvasOwnedSectionShell(sectionId);
  const sectionStyleVars = resolveSectionStyleVars(sectionStyleTheme);
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
    canvasOwnedShell,
  );
  const edgeHandleMode = getSectionEdgeHandleMode({
    hideAgenticEdgeHandles,
    isAttachedTerminalChild,
    sectionTypeName,
  });

  return (
    <section
      className={`${sectionShellClassName} setta-viewport-interaction-shell ${isActiveSection ? "z-[150]" : "z-10"}`}
      onClick={getOnSectionClick(sectionId)}
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-section-active={isActiveSection ? "true" : "false"}
      data-canvas-owned-shell={canvasOwnedShell ? "true" : undefined}
      style={sectionShellStyle}
    >
      <SectionEdgeHandles isUserView={isUserView} mode={edgeHandleMode} />
      <MinimizedDataEdgeHandles sectionId={sectionId} />
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
        hideHeader={isAttachedTerminalChild}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (p, n) => p.isUserView === n.isUserView,
);
