type SectionContainerShellClassNameOptions = {
  outlineTone: SectionChromeOutlineTone;
  scopeHighlight: SectionChromeScopeHighlight;
  showAiHighlight: boolean;
  useMetaControlStyle: boolean;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  forceHideOutline?: boolean;
  hideBorder?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
  isJoinedAttachedTerminalChild?: boolean;
  omitAgenticHandleScopeClass?: boolean;
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

export type SectionChromeOutlineTone =
  | "missing-source"
  | "global-active"
  | "other-project-active"
  | "other-project-inactive"
  | "active"
  | "inactive";

export type SectionChromeScopeHighlight = "none" | "read" | "write";

export type SectionChromeFrameStructure = {
  cornerStyle: SectionChromeCornerStyle;
  joinedEdge: SectionChromeJoinedEdge;
  shellBorderTone: SectionChromeShellBorderTone;
  shellBorderVisible: boolean;
  shellOutlineWidth: 0 | 2 | 4;
  surfaceFrameVisible: boolean;
};

export type SectionChromeShellDecorations = {
  outlineTone: SectionChromeOutlineTone;
  scopeHighlight: SectionChromeScopeHighlight;
  showAiHighlight: boolean;
  zIndexClassName: string;
};

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isSectionChromeOutlineToneActive(
  outlineTone: SectionChromeOutlineTone,
) {
  return (
    outlineTone === "global-active" ||
    outlineTone === "other-project-active" ||
    outlineTone === "active"
  );
}

function getSectionChromeOutlineClassName(
  outlineTone: SectionChromeOutlineTone,
) {
  switch (outlineTone) {
    case "missing-source":
      return "outline-red-600 dark:outline-red-400";
    case "global-active":
      return "outline-green-600 dark:outline-turquoise-400";
    case "other-project-active":
      return "outline-purple-600 dark:outline-purple-700";
    case "other-project-inactive":
      return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-fuchsia-400";
    case "active":
      return "outline-blue-600 dark:outline-blue-700";
    case "inactive":
      return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-cyan-300";
  }
}

function getSectionChromeScopeHighlightClassName(
  scopeHighlight: SectionChromeScopeHighlight,
) {
  if (scopeHighlight === "write") {
    return "ring-2 ring-amber-400/70 ring-inset";
  }
  if (scopeHighlight === "read") {
    return "ring-2 ring-emerald-400/70 ring-inset";
  }
  return "";
}

export function resolveSectionChromeShellDecorations({
  jsonSourceMissing = false,
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
  showAiHighlight,
  isReadScope,
  isWriteScope,
}: {
  jsonSourceMissing?: boolean;
  isActiveSection: boolean;
  isGlobalVariables: boolean;
  isInOtherProjectConfigs: boolean;
  showAiHighlight: boolean;
  isReadScope: boolean;
  isWriteScope: boolean;
}): SectionChromeShellDecorations {
  let outlineTone: SectionChromeOutlineTone;
  if (jsonSourceMissing) {
    outlineTone = "missing-source";
  } else if (isActiveSection && isGlobalVariables) {
    outlineTone = "global-active";
  } else if (isInOtherProjectConfigs && isActiveSection) {
    outlineTone = "other-project-active";
  } else if (isInOtherProjectConfigs) {
    outlineTone = "other-project-inactive";
  } else if (isActiveSection) {
    outlineTone = "active";
  } else {
    outlineTone = "inactive";
  }

  return {
    outlineTone,
    scopeHighlight: isWriteScope ? "write" : isReadScope ? "read" : "none",
    showAiHighlight,
    zIndexClassName: isActiveSection ? "z-[150]" : "z-10",
  };
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
  outlineTone,
  scopeHighlight,
  showAiHighlight,
  useMetaControlStyle,
  hasSectionStyleTheme,
  positionAndSizeLocked,
  forceHideOutline = false,
  hideBorder = false,
  joinedCorners = "none",
  isJoinedAttachedTerminalChild = false,
  omitAgenticHandleScopeClass = false,
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
  const sectionStyleOutlineClassName = hasSectionStyleTheme
    ? isSectionChromeOutlineToneActive(outlineTone)
      ? "outline-[color:var(--setta-section-style-outline)]"
      : "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-[color:var(--setta-section-style-outline)]"
    : getSectionChromeOutlineClassName(outlineTone);
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
  const aiHighlightClassName = showAiHighlight
    ? "setta-ai-gradient-border setta-ai-gradient-border-active"
    : "";
  const themedHandleScopeClassName = hasSectionStyleTheme
    ? "agentic-handle-scope--themed"
    : "";
  const scopeHighlightClassName =
    getSectionChromeScopeHighlightClassName(scopeHighlight);
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
