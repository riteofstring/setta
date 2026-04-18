import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

export const CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__callableSectionDefault";

export type SectionShellCanvasChrome = {
  fill: string;
  stroke: string;
};

const DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME = {
  fill: "hsl(222, 28%, 95%)",
  stroke: "#ffffff",
} satisfies SectionShellCanvasChrome;

const DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME = {
  fill: "hsl(220, 25%, 8.5%)",
  stroke: "hsl(219, 26%, 23%)",
} satisfies SectionShellCanvasChrome;

function hasNonEmptyStyleColor(
  styleColor: string | null | undefined,
): styleColor is string {
  return typeof styleColor === "string" && styleColor.trim().length > 0;
}

export function isCanvasOwnedSectionShell(sectionId: string) {
  return sectionId === CANVAS_OWNED_SECTION_SHELL_ID;
}

export function resolveCanvasOwnedSectionShellChrome({
  darkMode,
  styleColor,
}: {
  darkMode: boolean;
  styleColor: string | null | undefined;
}): SectionShellCanvasChrome {
  if (hasNonEmptyStyleColor(styleColor)) {
    const theme = deriveSectionStyleTheme(styleColor, darkMode);
    if (theme) {
      return {
        fill: theme.bg,
        stroke: theme.border,
      };
    }
  }

  return darkMode
    ? DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME
    : DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME;
}
