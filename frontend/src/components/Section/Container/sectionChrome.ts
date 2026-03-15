import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { getBgColor, getOutlineColor } from "./utils";

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

type CanvasSectionChromeOptions = {
  sectionTypeName: SectionType;
  textBlockMetaControlStyle: boolean;
  isUserView: boolean;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  hideHeader?: boolean;
};

type CanvasSectionHeaderVariant =
  | "metaControlMenu"
  | "textBlockMetaControlMenu"
  | "sectionHeader"
  | "none";

type CanvasSectionChrome = {
  bgColor: string;
  useMetaControlStyle: boolean;
  surfaceClassName: string;
  showMetaControlDragHandle: boolean;
  headerVariant: CanvasSectionHeaderVariant;
};

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
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
  const sectionStyleChromeClassName = hasSectionStyleTheme
    ? "!border-[color:var(--setta-section-style-border)] !bg-[color:var(--setta-section-style-bg)]"
    : "";
  const outlineColor = getOutlineColor({
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
  let outlineSizeClassName = useMetaControlStyle ? "outline-2" : "outline-4";
  if (forceHideOutline || isJoinedAttachedTerminalChild) {
    outlineSizeClassName = "outline-0";
  }
  let joinedCornerClassName = "";
  if (joinedCorners === "code-terminal-parent") {
    joinedCornerClassName = "rounded-b-none";
  } else if (isJoinedAttachedTerminalChild) {
    joinedCornerClassName = "rounded-t-none";
  }
  const handleScopeClassName = omitAgenticHandleScopeClass
    ? ""
    : "agentic-handle-scope";
  const themedHandleScopeClassName = hasSectionStyleTheme
    ? "agentic-handle-scope--themed"
    : "";
  const borderColorClassName = !positionAndSizeLocked
    ? "border-white dark:border-setta-700"
    : "border-setta-400/90 dark:border-setta-800";
  const borderWidthClassName = hideBorder ? "border-0" : "border";
  const defaultCornerClassName = !positionAndSizeLocked
    ? "rounded-lg"
    : "rounded-sm";

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
  const layoutClassNameToUse =
    layoutClassName ?? "section-grid-cols section-grid-rows section-grid-areas";
  const sectionStyleChromeClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-bg)] before:!border-[color:var(--setta-section-style-border)]"
    : "";
  const frameBorderClassName = hideFrameBorder
    ? "before:border-0"
    : "before:border";

  return joinClassNames(
    shouldDisablePointerEvents && "pointer-events-none select-none",
    bgColor,
    layoutClassNameToUse,
    "relative grid h-full transition-radius before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0",
    frameBorderClassName,
    cornerClassName ?? (!positionAndSizeLocked ? "rounded-lg" : "rounded-sm"),
    isYouTube && "overflow-clip",
    zIndexClassName,
    metaHoverZIndexClassName,
    frameClassName,
    sectionStyleChromeClassName,
  );
}

export function getCanvasSectionChrome({
  sectionTypeName,
  textBlockMetaControlStyle,
  isUserView,
  hasSectionStyleTheme,
  positionAndSizeLocked,
  hideHeader = false,
}: CanvasSectionChromeOptions): CanvasSectionChrome {
  const isMetaControl = sectionTypeName === SectionTypeEnum.MetaControl;
  const useMetaControlStyle = isMetaControl || textBlockMetaControlStyle;
  const bgColor = useMetaControlStyle
    ? "bg-transparent"
    : getBgColor(sectionTypeName);
  const surfaceClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    frameClassName: useMetaControlStyle
      ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
      : undefined,
    layoutClassName: isMetaControl ? "grid-cols-1 grid-rows-1" : undefined,
    metaHoverZIndexClassName: useMetaControlStyle
      ? "group-hover/card-section:z-[170]"
      : "",
  });
  let headerVariant: CanvasSectionHeaderVariant = "none";
  if (isMetaControl && !isUserView) {
    headerVariant = "metaControlMenu";
  } else if (textBlockMetaControlStyle && !isUserView) {
    headerVariant = "textBlockMetaControlMenu";
  } else if (!hideHeader) {
    headerVariant = "sectionHeader";
  }

  return {
    bgColor,
    useMetaControlStyle,
    surfaceClassName,
    showMetaControlDragHandle:
      useMetaControlStyle && !isUserView && !positionAndSizeLocked,
    headerVariant,
  };
}
