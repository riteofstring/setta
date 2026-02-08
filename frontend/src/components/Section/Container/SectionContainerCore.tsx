import React from "react";
import {
  getCurrEffectiveSectionImpl,
  isBaseCodeSectionType,
} from "state/actions/sectionInfos";
import {
  useAgenticScopeHighlights,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum } from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { shallow } from "zustand/shallow";
import { AgenticEdgeHandles } from "./AgenticEdgeHandles";
import "./dndline.css";
import { MinimizedDataEdgeHandles } from "./MinimizedDataEdgeHandles";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import {
  getOnSectionClick,
  getOutlineColor,
  useAiSectionHighlight,
} from "./utils";

type SectionContainerCoreProps = {
  sectionId: string;
  isUserView: boolean;
};

function _SectionContainerCore({
  sectionId,
  isUserView,
}: SectionContainerCoreProps) {
  const {
    isActiveSection,
    sectionTypeName,
    // jsonSourceMissing,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    textBlockMetaControlStyle,
    projectConfigId,
    isAttachedTerminalChild,
    styleColor,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const parentId = x.parentSectionMap[sectionId] ?? null;
    let isAttachedTerminalChild = false;
    if (parentId) {
      const parentImpl = getCurrEffectiveSectionImpl(x, parentId);
      isAttachedTerminalChild =
        impl.type === SectionTypeEnum.Terminal &&
        isBaseCodeSectionType(parentImpl.type) &&
        parentImpl.attachedTerminalSectionId === sectionId;
    }
    return {
      isActiveSection: x.projectConfig.activeIds.includes(sectionId),
      sectionTypeName: impl.type,
      // jsonSourceMissing: x.sections[sectionId].jsonSourceMissing,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      textBlockMetaControlStyle:
        impl.type === SectionTypeEnum.TextBlock ? impl.metaControlStyle : false,
      projectConfigId: x.projectConfig.id,
      isAttachedTerminalChild,
      styleColor: impl.styleColor,
    };
  }, shallow);
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
  const darkMode = useLocalStorage((x) => x.darkMode);
  const sectionStyleTheme =
    styleColor && !useMetaControlStyle
      ? deriveSectionStyleTheme(styleColor, darkMode)
      : null;
  const hasSectionStyleTheme = Boolean(sectionStyleTheme);
  const sectionStyleVars = sectionStyleTheme
    ? ({
        "--setta-section-style-bg": sectionStyleTheme.bg,
        "--setta-section-style-border": sectionStyleTheme.border,
        "--setta-section-style-outline": sectionStyleTheme.outline,
        "--setta-section-style-text": sectionStyleTheme.text,
        "--setta-section-style-muted-text": sectionStyleTheme.mutedText,
      } as React.CSSProperties)
    : undefined;
  const sectionStyleChromeClassName = hasSectionStyleTheme
    ? "!border-[color:var(--setta-section-style-border)] !bg-[color:var(--setta-section-style-bg)]"
    : "";

  // const boxShadow = !positionAndSizeLocked
  //   ? isActiveSection
  //     ? "shadow-2xl dark:shadow-setta-925"
  //     : "shadow-md dark:shadow-setta-900/30 [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:shadow-2xl dark:[&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:shadow-[0_35px_60px_-15px_rgba(0,0,0,0.7)]"
  //   : "";

  const boxShadow = !positionAndSizeLocked
    ? "shadow-md dark:shadow-setta-900/30"
    : "";

  const outlineColor = getOutlineColor({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    // jsonSourceMissing,
  });
  const sectionStyleOutlineClassName = hasSectionStyleTheme
    ? isActiveSection
      ? "outline-[color:var(--setta-section-style-outline)]"
      : "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-[color:var(--setta-section-style-outline)]"
    : outlineColor;
  const containerBgClass = useMetaControlStyle
    ? "bg-transparent dark:bg-transparent"
    : "bg-white dark:bg-setta-925";
  const containerBorderClass = useMetaControlStyle
    ? "!border-transparent dark:!border-transparent"
    : "";
  const outlineClassName = useMetaControlStyle
    ? "outline-transparent group-hover/card-section:outline-setta-400/60 dark:group-hover/card-section:outline-setta-700/60"
    : sectionStyleOutlineClassName;
  const outlineSizeClassName = useMetaControlStyle ? "outline-2" : "outline-4";

  // [transition:_outline-color_200ms_ease] [transition:_box-shadow_500ms_ease]
  // {boxShadow}
  return (
    <section
      className={`agentic-handle-scope group/card-section transition-radius relative ${!positionAndSizeLocked ? "rounded-lg border-white dark:border-setta-700" : "rounded-sm border-setta-400/90 dark:border-setta-800"} dndline w-min border ${containerBgClass} ${containerBorderClass} outline ${outlineSizeClassName} ${aiHighlightClassName} ${scopeHighlightClassName} ${outlineClassName} ${sectionStyleChromeClassName}`}
      onClick={getOnSectionClick(sectionId)}
      ref={refForPosition}
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      style={sectionStyleVars}
    >
      <AgenticEdgeHandles isUserView={isUserView} />
      <MinimizedDataEdgeHandles sectionId={sectionId} />
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
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
