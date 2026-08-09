// Extracted from the frozen reference's sectionChrome.ts, trimmed to the states the approved
// Phase 1 slice reaches. Cut with their features (not kept as dead branches): meta-control and
// joined attached-terminal chrome, full-bleed section/chat-window overrides, agentic handle-scope
// classes, AI-follow and agentic-scope highlight class slots, and the YouTube overflow special
// case. Class emission order matches the reference so live DOM comparison stays diffable.
import { getOutlineColor } from "./sectionColors";

type SectionContainerShellClassNameOptions = {
  isActiveSection: boolean;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
};

type SectionSurfaceClassNameOptions = {
  bgColor: string;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  shouldDisablePointerEvents?: boolean;
  frameClassName?: string;
  layoutClassName?: string;
  zIndexClassName?: string;
};

const DEFAULT_SECTION_SURFACE_LAYOUT_CLASS_NAME =
  "section-grid-cols section-grid-rows section-grid-areas";
const SECTION_CONTAINER_BASE_CLASS_NAME =
  "group/card-section transition-radius relative dndline outline";
const SECTION_SURFACE_BASE_CLASS_NAME =
  "relative grid h-full transition-radius before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0";

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
  hasSectionStyleTheme,
}: Pick<SectionContainerShellClassNameOptions, "isActiveSection" | "hasSectionStyleTheme">) {
  const outlineColor = getOutlineColor({ isActiveSection });

  if (!hasSectionStyleTheme) {
    return outlineColor;
  }

  if (isActiveSection) {
    return "outline-[color:var(--setta-section-style-outline)]";
  }

  return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-[color:var(--setta-section-style-outline)]";
}

function getSectionShellBorderClasses(positionAndSizeLocked: boolean) {
  return {
    borderColorClassName: positionAndSizeLocked
      ? "border-setta-400/90 dark:border-setta-800"
      : "border-white dark:border-setta-700",
    cornerClassName: positionAndSizeLocked ? "rounded-sm" : "rounded-lg",
  };
}

function getSectionSurfaceChromeClassName(hasSectionStyleTheme: boolean) {
  return hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-bg)] before:!border-[color:var(--setta-section-style-border)]"
    : "";
}

export function getSectionContainerShellClassName({
  isActiveSection,
  hasSectionStyleTheme,
  positionAndSizeLocked,
}: SectionContainerShellClassNameOptions): string {
  const sectionStyleChromeClassName = getSectionShellChromeClassName(hasSectionStyleTheme);
  const outlineClassName = getSectionShellOutlineClassName({
    isActiveSection,
    hasSectionStyleTheme,
  });
  const { borderColorClassName, cornerClassName } =
    getSectionShellBorderClasses(positionAndSizeLocked);

  return joinClassNames(
    SECTION_CONTAINER_BASE_CLASS_NAME,
    "w-min",
    "border",
    borderColorClassName,
    cornerClassName,
    "bg-white dark:bg-setta-925",
    "outline-4",
    outlineClassName,
    sectionStyleChromeClassName,
  );
}

export function getSectionSurfaceClassName({
  bgColor,
  hasSectionStyleTheme,
  positionAndSizeLocked,
  shouldDisablePointerEvents = false,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  zIndexClassName = "z-10",
}: SectionSurfaceClassNameOptions): string {
  const layoutClassNameToUse = layoutClassName ?? DEFAULT_SECTION_SURFACE_LAYOUT_CLASS_NAME;
  const sectionStyleChromeClassName = getSectionSurfaceChromeClassName(hasSectionStyleTheme);
  const cornerClassName = positionAndSizeLocked ? "rounded-sm" : "rounded-lg";

  return joinClassNames(
    shouldDisablePointerEvents && "pointer-events-none select-none",
    bgColor,
    layoutClassNameToUse,
    SECTION_SURFACE_BASE_CLASS_NAME,
    "before:border",
    cornerClassName,
    zIndexClassName,
    frameClassName,
    sectionStyleChromeClassName,
  );
}
