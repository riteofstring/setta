import { getOutlineColor } from "./utils";

type SectionContainerShellClassNameOptions = {
  isActiveSection: boolean;
  isGlobalVariables: boolean;
  isInOtherProjectConfigs: boolean;
  useMetaControlStyle: boolean;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  forceHideOutline?: boolean;
  hideBorder?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
  isJoinedAttachedTerminalChild?: boolean;
  omitAgenticHandleScopeClass?: boolean;
  aiHighlightClassName?: string;
  scopeHighlightClassName?: string;
  sizeClassName?: string;
  cornerClassName?: string;
};

type SectionSurfaceClassNameOptions = {
  bgColor: string;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  shouldDisablePointerEvents?: boolean;
  isYouTube?: boolean;
  frameClassName?: string;
  layoutClassName?: string;
  zIndexClassName?: string;
  metaHoverZIndexClassName?: string;
  cornerClassName?: string;
  hideFrameBorder?: boolean;
};

export type SectionChromeCornerStyle = "large" | "small";

export type SectionChromeJoinedEdge = "none" | "top" | "bottom";

export type SectionChromeShellBorderTone = "default" | "locked" | "transparent";

export type SectionChromeFrameStructure = {
  cornerStyle: SectionChromeCornerStyle;
  joinedEdge: SectionChromeJoinedEdge;
  shellBorderTone: SectionChromeShellBorderTone;
  shellBorderVisible: boolean;
  shellOutlineWidth: 0 | 2 | 4;
  surfaceFrameVisible: boolean;
};

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function resolveSectionChromeFrameStructure({
  positionAndSizeLocked,
  useMetaControlStyle,
  forceHideOutline = false,
  hideBorder = false,
  hideFrameBorder = false,
  joinedCorners = "none",
  isJoinedAttachedTerminalChild = false,
}: Pick<
  SectionContainerShellClassNameOptions,
  | "positionAndSizeLocked"
  | "useMetaControlStyle"
  | "forceHideOutline"
  | "hideBorder"
  | "joinedCorners"
  | "isJoinedAttachedTerminalChild"
> &
  Pick<
    SectionSurfaceClassNameOptions,
    "hideFrameBorder"
  >): SectionChromeFrameStructure {
  let shellOutlineWidth: SectionChromeFrameStructure["shellOutlineWidth"] =
    useMetaControlStyle ? 2 : 4;
  if (forceHideOutline || isJoinedAttachedTerminalChild) {
    shellOutlineWidth = 0;
  }

  let joinedEdge: SectionChromeJoinedEdge = "none";
  if (joinedCorners === "code-terminal-parent") {
    joinedEdge = "bottom";
  } else if (isJoinedAttachedTerminalChild) {
    joinedEdge = "top";
  }

  return {
    cornerStyle: positionAndSizeLocked ? "small" : "large",
    joinedEdge,
    shellBorderTone: useMetaControlStyle
      ? "transparent"
      : positionAndSizeLocked
        ? "locked"
        : "default",
    shellBorderVisible: !hideBorder,
    shellOutlineWidth,
    surfaceFrameVisible: !hideFrameBorder,
  };
}

export function getSectionContainerShellClassName({
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
  useMetaControlStyle,
  hasSectionStyleTheme,
  positionAndSizeLocked,
  forceHideOutline = false,
  hideBorder = false,
  joinedCorners = "none",
  isJoinedAttachedTerminalChild = false,
  omitAgenticHandleScopeClass = false,
  aiHighlightClassName,
  scopeHighlightClassName,
  sizeClassName = "w-min",
  cornerClassName,
}: SectionContainerShellClassNameOptions): string {
  const frameStructure = resolveSectionChromeFrameStructure({
    positionAndSizeLocked,
    useMetaControlStyle,
    forceHideOutline,
    hideBorder,
    joinedCorners,
    isJoinedAttachedTerminalChild,
    hideFrameBorder: false,
  });
  const sectionStyleChromeClassName = hasSectionStyleTheme
    ? "!border-[color:var(--setta-section-style-border)] !bg-[color:var(--setta-section-style-bg)]"
    : "";
  const outlineColor = getOutlineColor({
    jsonSourceMissing: false,
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
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
  const handleScopeClassName = omitAgenticHandleScopeClass
    ? ""
    : "agentic-handle-scope";
  const themedHandleScopeClassName = hasSectionStyleTheme
    ? "agentic-handle-scope--themed"
    : "";
  const borderColorClassName =
    frameStructure.shellBorderTone === "transparent"
      ? "!border-transparent dark:!border-transparent"
      : frameStructure.shellBorderTone === "locked"
        ? "border-setta-400/90 dark:border-setta-800"
        : "border-white dark:border-setta-700";
  const borderWidthClassName = frameStructure.shellBorderVisible
    ? "border"
    : "border-0";
  const defaultCornerClassName =
    frameStructure.cornerStyle === "large" ? "rounded-lg" : "rounded-sm";
  const joinedCornerClassName =
    frameStructure.joinedEdge === "bottom"
      ? "rounded-b-none"
      : frameStructure.joinedEdge === "top"
        ? "rounded-t-none"
        : "";
  const outlineSizeClassName =
    frameStructure.shellOutlineWidth === 0
      ? "outline-0"
      : frameStructure.shellOutlineWidth === 2
        ? "outline-2"
        : "outline-4";

  return joinClassNames(
    handleScopeClassName,
    themedHandleScopeClassName,
    "group/card-section transition-radius relative dndline outline",
    sizeClassName,
    borderWidthClassName,
    borderColorClassName,
    cornerClassName ?? defaultCornerClassName,
    joinedCornerClassName,
    containerBgClass,
    containerBorderClass,
    outlineSizeClassName,
    aiHighlightClassName,
    scopeHighlightClassName,
    outlineClassName,
    sectionStyleChromeClassName,
  );
}

export function getSectionSurfaceClassName({
  bgColor,
  hasSectionStyleTheme,
  positionAndSizeLocked,
  shouldDisablePointerEvents = false,
  isYouTube = false,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  zIndexClassName = "z-10",
  metaHoverZIndexClassName = "",
  cornerClassName,
  hideFrameBorder = false,
}: SectionSurfaceClassNameOptions): string {
  const frameStructure = resolveSectionChromeFrameStructure({
    positionAndSizeLocked,
    useMetaControlStyle: false,
    hideFrameBorder,
  });
  const layoutClassNameToUse =
    layoutClassName ?? "section-grid-cols section-grid-rows section-grid-areas";
  const sectionStyleChromeClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-bg)] before:!border-[color:var(--setta-section-style-border)]"
    : "";
  const frameBorderClassName = frameStructure.surfaceFrameVisible
    ? "before:border"
    : "before:border-0";
  const defaultCornerClassName =
    frameStructure.cornerStyle === "large" ? "rounded-lg" : "rounded-sm";

  return joinClassNames(
    shouldDisablePointerEvents && "pointer-events-none select-none",
    bgColor,
    layoutClassNameToUse,
    "relative grid h-full transition-radius before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0",
    frameBorderClassName,
    cornerClassName ?? defaultCornerClassName,
    isYouTube && "overflow-clip",
    zIndexClassName,
    metaHoverZIndexClassName,
    frameClassName,
    sectionStyleChromeClassName,
  );
}
