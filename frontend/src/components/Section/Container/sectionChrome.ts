import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
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

export type SectionChromeMode = "header" | "meta-control" | "text-block-meta";

const DEFAULT_SECTION_SURFACE_LAYOUT_CLASS_NAME =
  "section-grid-cols section-grid-rows section-grid-areas";
const SECTION_CONTAINER_BASE_CLASS_NAME =
  "group/card-section transition-radius relative dndline outline";
const SECTION_SURFACE_BASE_CLASS_NAME =
  "relative grid h-full transition-radius before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0";

export function getSectionChromeMode(
  sectionTypeName: SectionType,
  textBlockMetaControlStyle: boolean,
): SectionChromeMode {
  if (sectionTypeName === SectionTypeEnum.MetaControl) {
    return "meta-control";
  }
  if (textBlockMetaControlStyle) {
    return "text-block-meta";
  }
  return "header";
}

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getSectionShellChromeClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? "!border-[color:var(--setta-section-style-border)] !bg-[color:var(--setta-section-style-bg)]"
    : "";
}

function getSectionShellOutlineClassName({
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
  hasSectionStyleTheme,
}: Pick<
  SectionContainerShellClassNameOptions,
  | "isActiveSection"
  | "isGlobalVariables"
  | "isInOtherProjectConfigs"
  | "hasSectionStyleTheme"
>) {
  const outlineColor = getOutlineColor({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
  });

  if (!hasSectionStyleTheme) {
    return outlineColor;
  }

  if (isActiveSection) {
    return "outline-[color:var(--setta-section-style-outline)]";
  }

  return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-[color:var(--setta-section-style-outline)]";
}

function getSectionShellContainerClasses(
  useMetaControlStyle: boolean,
  sectionStyleOutlineClassName: string,
) {
  if (!useMetaControlStyle) {
    return {
      containerBgClass: "bg-white dark:bg-setta-925",
      containerBorderClass: "",
      outlineClassName: sectionStyleOutlineClassName,
    };
  }

  return {
    containerBgClass: "bg-transparent dark:bg-transparent",
    containerBorderClass: "!border-transparent dark:!border-transparent",
    outlineClassName:
      "outline-transparent group-hover/card-section:outline-setta-400/60 dark:group-hover/card-section:outline-setta-700/60",
  };
}

function getSectionShellOutlineSizeClassName(
  useMetaControlStyle: boolean,
  forceHideOutline: boolean,
  isJoinedAttachedTerminalChild: boolean,
) {
  if (forceHideOutline || isJoinedAttachedTerminalChild) {
    return "outline-0";
  }

  return useMetaControlStyle ? "outline-2" : "outline-4";
}

function getSectionShellJoinedCornerClassName(
  joinedCorners: NonNullable<
    SectionContainerShellClassNameOptions["joinedCorners"]
  >,
  isJoinedAttachedTerminalChild: boolean,
) {
  if (joinedCorners === "code-terminal-parent") {
    return "rounded-b-none";
  }

  return isJoinedAttachedTerminalChild ? "rounded-t-none" : "";
}

function getSectionShellHandleScopeClassNames(
  omitAgenticHandleScopeClass: boolean,
  hasSectionStyleTheme: boolean,
) {
  return {
    handleScopeClassName: omitAgenticHandleScopeClass
      ? ""
      : "agentic-handle-scope",
    themedHandleScopeClassName: hasSectionStyleTheme
      ? "agentic-handle-scope--themed"
      : "",
  };
}

function getSectionShellBorderClasses(
  positionAndSizeLocked: boolean,
  hideBorder: boolean,
  cornerClassName?: string,
) {
  return {
    borderColorClassName: positionAndSizeLocked
      ? "border-setta-400/90 dark:border-setta-800"
      : "border-white dark:border-setta-700",
    borderWidthClassName: hideBorder ? "border-0" : "border",
    cornerClassNameToUse:
      cornerClassName ?? (positionAndSizeLocked ? "rounded-sm" : "rounded-lg"),
  };
}

function getSectionSurfaceChromeClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-bg)] before:!border-[color:var(--setta-section-style-border)]"
    : "";
}

function getSectionSurfaceClassParts({
  hasSectionStyleTheme,
  positionAndSizeLocked,
  layoutClassName,
  cornerClassName,
  hideFrameBorder = false,
}: Pick<
  SectionSurfaceClassNameOptions,
  | "hasSectionStyleTheme"
  | "positionAndSizeLocked"
  | "layoutClassName"
  | "cornerClassName"
  | "hideFrameBorder"
>) {
  return {
    layoutClassNameToUse:
      layoutClassName ?? DEFAULT_SECTION_SURFACE_LAYOUT_CLASS_NAME,
    sectionStyleChromeClassName:
      getSectionSurfaceChromeClassName(hasSectionStyleTheme),
    frameBorderClassName: hideFrameBorder ? "before:border-0" : "before:border",
    cornerClassNameToUse:
      cornerClassName ?? (positionAndSizeLocked ? "rounded-sm" : "rounded-lg"),
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
  const sectionStyleChromeClassName =
    getSectionShellChromeClassName(hasSectionStyleTheme);
  const sectionStyleOutlineClassName = getSectionShellOutlineClassName({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    hasSectionStyleTheme,
  });
  const { containerBgClass, containerBorderClass, outlineClassName } =
    getSectionShellContainerClasses(
      useMetaControlStyle,
      sectionStyleOutlineClassName,
    );
  const outlineSizeClassName = getSectionShellOutlineSizeClassName(
    useMetaControlStyle,
    forceHideOutline,
    isJoinedAttachedTerminalChild,
  );
  const joinedCornerClassName = getSectionShellJoinedCornerClassName(
    joinedCorners,
    isJoinedAttachedTerminalChild,
  );
  const { handleScopeClassName, themedHandleScopeClassName } =
    getSectionShellHandleScopeClassNames(
      omitAgenticHandleScopeClass,
      hasSectionStyleTheme,
    );
  const { borderColorClassName, borderWidthClassName, cornerClassNameToUse } =
    getSectionShellBorderClasses(
      positionAndSizeLocked,
      hideBorder,
      cornerClassName,
    );

  return joinClassNames(
    handleScopeClassName,
    themedHandleScopeClassName,
    SECTION_CONTAINER_BASE_CLASS_NAME,
    sizeClassName,
    borderWidthClassName,
    borderColorClassName,
    cornerClassNameToUse,
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
  const {
    layoutClassNameToUse,
    sectionStyleChromeClassName,
    frameBorderClassName,
    cornerClassNameToUse,
  } = getSectionSurfaceClassParts({
    hasSectionStyleTheme,
    positionAndSizeLocked,
    layoutClassName,
    cornerClassName,
    hideFrameBorder,
  });

  return joinClassNames(
    shouldDisablePointerEvents && "pointer-events-none select-none",
    bgColor,
    layoutClassNameToUse,
    SECTION_SURFACE_BASE_CLASS_NAME,
    frameBorderClassName,
    cornerClassNameToUse,
    isYouTube && "overflow-clip",
    zIndexClassName,
    metaHoverZIndexClassName,
    frameClassName,
    sectionStyleChromeClassName,
  );
}
