import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";

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

type ResolveSectionChromeSurfaceDecorationsArgs = {
  useMetaControlStyle: boolean;
  isMetaControlSection: boolean;
  isUserView: boolean;
  positionAndSizeLocked: boolean;
};

type ResolveSectionChromeTitleDecorationsArgs = {
  isActiveSection: boolean;
  isInOtherProjectConfigs: boolean;
  sectionTypeName: SectionType;
  hasSectionStyleTheme: boolean;
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

export type SectionChromeSurfaceLayout = "section-grid" | "single-cell";

export type SectionChromeSurfaceFrameTone = "default" | "transparent-hover";

export type SectionChromeSurfaceHoverElevation = "default" | "raise-on-hover";

export type SectionChromeResizeHandleTone = "default" | "minimal";

export type SectionChromeSurfaceDecorations = {
  layout: SectionChromeSurfaceLayout;
  frameTone: SectionChromeSurfaceFrameTone;
  hoverElevation: SectionChromeSurfaceHoverElevation;
  resizeHandleTone: SectionChromeResizeHandleTone;
  showTopDragHandle: boolean;
};

export type SectionChromeSurfaceDomAdapter = {
  frameClassName?: string;
  layoutClassName?: string;
  metaHoverZIndexClassName: string;
};

export type SectionChromeShellDecorations = {
  outlineTone: SectionChromeOutlineTone;
  scopeHighlight: SectionChromeScopeHighlight;
  showAiHighlight: boolean;
  zIndexClassName: string;
};

export type SectionChromeTitleTone =
  | "default"
  | "active"
  | "other-project-active"
  | "global-active"
  | "terminal-active"
  | "terminal-inactive";

export type SectionChromeTitleCase = "normal" | "uppercase";

export type SectionChromeTitleFixedStyle =
  | "match-not-editing"
  | "subdued-italic";

export type SectionChromeTitleDecorations = {
  useThemeTextColor: boolean;
  notEditingTone: SectionChromeTitleTone;
  textCase: SectionChromeTitleCase;
  fixedStyle: SectionChromeTitleFixedStyle;
};

export type SectionChromeTitleDomAdapter = {
  editing: string;
  notEditing: string;
  fixed: string;
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

export function getSectionChromeStaticOutlineClassName({
  outlineTone,
  hasSectionStyleTheme,
}: {
  outlineTone: SectionChromeOutlineTone;
  hasSectionStyleTheme: boolean;
}) {
  if (outlineTone === "missing-source") {
    return getSectionChromeOutlineClassName(outlineTone);
  }

  if (hasSectionStyleTheme) {
    return isSectionChromeOutlineToneActive(outlineTone)
      ? "outline-[color:var(--setta-section-style-outline)]"
      : "outline-transparent";
  }

  return isSectionChromeOutlineToneActive(outlineTone)
    ? getSectionChromeOutlineClassName(outlineTone)
    : "outline-transparent";
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

export function resolveSectionChromeTitleDecorations({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}: ResolveSectionChromeTitleDecorationsArgs): SectionChromeTitleDecorations {
  return {
    useThemeTextColor: hasSectionStyleTheme,
    notEditingTone: resolveSectionChromeTitleTone({
      isActiveSection,
      isInOtherProjectConfigs,
      sectionTypeName,
      hasSectionStyleTheme,
    }),
    textCase: isSectionChromeUppercaseTitleType(sectionTypeName)
      ? "uppercase"
      : "normal",
    fixedStyle: isSectionChromeFixedOnlyTitleType(sectionTypeName)
      ? "match-not-editing"
      : "subdued-italic",
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

export function resolveSectionChromeSurfaceDecorations({
  useMetaControlStyle,
  isMetaControlSection,
  isUserView,
  positionAndSizeLocked,
}: ResolveSectionChromeSurfaceDecorationsArgs): SectionChromeSurfaceDecorations {
  return {
    layout: isMetaControlSection ? "single-cell" : "section-grid",
    frameTone: useMetaControlStyle ? "transparent-hover" : "default",
    hoverElevation: useMetaControlStyle ? "raise-on-hover" : "default",
    resizeHandleTone: useMetaControlStyle ? "minimal" : "default",
    showTopDragHandle:
      useMetaControlStyle && !isUserView && !positionAndSizeLocked,
  };
}

export function getSectionChromeSurfaceDomAdapter(
  surfaceDecorations: SectionChromeSurfaceDecorations,
): SectionChromeSurfaceDomAdapter {
  const adapter: SectionChromeSurfaceDomAdapter = {
    metaHoverZIndexClassName:
      surfaceDecorations.hoverElevation === "raise-on-hover"
        ? "group-hover/card-section:z-[170]"
        : "",
  };

  if (surfaceDecorations.frameTone === "transparent-hover") {
    adapter.frameClassName =
      "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60";
  }

  if (surfaceDecorations.layout === "single-cell") {
    adapter.layoutClassName = "grid-cols-1 grid-rows-1";
  }

  return adapter;
}

export function getSectionChromeTitleDomAdapter(
  titleDecorations: SectionChromeTitleDecorations,
): SectionChromeTitleDomAdapter {
  const editing = titleDecorations.useThemeTextColor
    ? "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full font-bold text-[.7rem] tracking-tight"
    : "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full dark:text-white font-bold text-[.7rem] tracking-tight";
  const notEditing = joinClassNames(
    "px-1 py-0 -ml-1 w-full focus-visible:ring-0 focus-visible:outline-none box-border rounded-md border border-solid border-transparent focus-visible:border-blue-500 leading-5 font-bold tracking-tight cursor-pointer max-w-full text-[.7rem] truncate",
    titleDecorations.useThemeTextColor
      ? ""
      : getSectionChromeTitleToneClassName(titleDecorations.notEditingTone),
    titleDecorations.textCase === "uppercase" ? "uppercase" : "",
  );
  const fixed =
    titleDecorations.fixedStyle === "match-not-editing"
      ? notEditing
      : joinClassNames(
          "select-none italic focus-visible:ring-0 focus-visible:outline-none box-border border border-solid border-transparent focus-visible:border-blue-500 tracking-tighter text-xs max-w-full truncate pr-0.5",
          titleDecorations.useThemeTextColor ? "" : "text-setta-400",
        );

  return {
    editing,
    notEditing,
    fixed,
  };
}

function isSectionChromeUppercaseTitleType(sectionTypeName: SectionType) {
  return (
    sectionTypeName === SectionTypeEnum.GlobalVariables ||
    sectionTypeName === SectionTypeEnum.GenPythonCode ||
    sectionTypeName === SectionTypeEnum.GenPythonMetadata
  );
}

function isSectionChromeFixedOnlyTitleType(sectionTypeName: SectionType) {
  return isSectionChromeUppercaseTitleType(sectionTypeName);
}

function resolveSectionChromeTitleTone({
  isActiveSection,
  isInOtherProjectConfigs,
  sectionTypeName,
  hasSectionStyleTheme,
}: ResolveSectionChromeTitleDecorationsArgs): SectionChromeTitleTone {
  if (hasSectionStyleTheme) {
    return "default";
  }
  if (isActiveSection && isInOtherProjectConfigs) {
    return "other-project-active";
  }
  if (isActiveSection && sectionTypeName === SectionTypeEnum.GlobalVariables) {
    return "global-active";
  }
  if (isActiveSection && sectionTypeName === SectionTypeEnum.Terminal) {
    return "terminal-active";
  }
  if (isActiveSection) {
    return "active";
  }
  if (sectionTypeName === SectionTypeEnum.Terminal) {
    return "terminal-inactive";
  }
  return "default";
}

function getSectionChromeTitleToneClassName(tone: SectionChromeTitleTone) {
  switch (tone) {
    case "active":
      return "text-blue-600 dark:text-blue-400";
    case "other-project-active":
      return "text-purple-800 dark:text-purple-200";
    case "global-active":
      return "text-green-800 dark:text-green-200";
    case "terminal-active":
      return "text-blue-400";
    case "terminal-inactive":
      return "text-setta-300";
    case "default":
      return "text-setta-700 dark:text-setta-300";
  }
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
