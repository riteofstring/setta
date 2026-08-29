import { getOutlineColor } from "./sectionColors";

type SectionContainerShellClassNameOptions = {
  isActiveSection: boolean;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  useMetaControlStyle?: boolean;
};

type SectionSurfaceClassNameOptions = {
  bgColor: string;
  hasSectionStyleTheme: boolean;
  positionAndSizeLocked: boolean;
  shouldDisablePointerEvents?: boolean;
  frameClassName?: string;
  layoutClassName?: string;
  zIndexClassName?: string;
  metaHoverZIndexClassName?: string;
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
}: Pick<
  SectionContainerShellClassNameOptions,
  "isActiveSection" | "hasSectionStyleTheme"
>) {
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

function getSectionShellContainerClasses(
  useMetaControlStyle: boolean,
  sectionStyleOutlineClassName: string,
) {
  if (!useMetaControlStyle) {
    return {
      containerBgClassName: "bg-white dark:bg-setta-925",
      containerBorderClassName: "",
      outlineClassName: sectionStyleOutlineClassName,
      outlineSizeClassName: "outline-4",
    };
  }
  return {
    containerBgClassName: "bg-transparent dark:bg-transparent",
    containerBorderClassName: "!border-transparent dark:!border-transparent",
    outlineClassName:
      "outline-transparent group-hover/card-section:outline-setta-400/60 dark:group-hover/card-section:outline-setta-700/60",
    outlineSizeClassName: "outline-2",
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
  useMetaControlStyle = false,
}: SectionContainerShellClassNameOptions): string {
  const sectionStyleChromeClassName =
    getSectionShellChromeClassName(hasSectionStyleTheme);
  const sectionStyleOutlineClassName = getSectionShellOutlineClassName({
    isActiveSection,
    hasSectionStyleTheme,
  });
  const {
    containerBgClassName,
    containerBorderClassName,
    outlineClassName,
    outlineSizeClassName,
  } = getSectionShellContainerClasses(
    useMetaControlStyle,
    sectionStyleOutlineClassName,
  );
  const { borderColorClassName, cornerClassName } =
    getSectionShellBorderClasses(positionAndSizeLocked);

  return joinClassNames(
    SECTION_CONTAINER_BASE_CLASS_NAME,
    "w-min",
    "border",
    borderColorClassName,
    cornerClassName,
    containerBgClassName,
    containerBorderClassName,
    outlineSizeClassName,
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
  metaHoverZIndexClassName = "",
}: SectionSurfaceClassNameOptions): string {
  const layoutClassNameToUse =
    layoutClassName ?? DEFAULT_SECTION_SURFACE_LAYOUT_CLASS_NAME;
  const sectionStyleChromeClassName =
    getSectionSurfaceChromeClassName(hasSectionStyleTheme);
  const cornerClassName = positionAndSizeLocked ? "rounded-sm" : "rounded-lg";

  return joinClassNames(
    shouldDisablePointerEvents && "pointer-events-none select-none",
    bgColor,
    layoutClassNameToUse,
    SECTION_SURFACE_BASE_CLASS_NAME,
    "before:border",
    cornerClassName,
    zIndexClassName,
    metaHoverZIndexClassName,
    frameClassName,
    sectionStyleChromeClassName,
  );
}
