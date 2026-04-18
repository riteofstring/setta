import { deriveSectionStyleTheme } from "utils/sectionStyleColors";

export const CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__callableSectionDefault";

export type SectionShellCanvasChrome = {
  fill: string;
  stroke: string;
  headerFill: string;
  headerDivider: string;
};

const DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME = {
  fill: "hsl(222, 28%, 95%)",
  headerDivider: "hsl(220, 24%, 86%)",
  headerFill: "hsl(220, 33%, 98%)",
  stroke: "#ffffff",
} satisfies SectionShellCanvasChrome;

const DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME = {
  fill: "hsl(220, 25%, 8.5%)",
  headerDivider: "hsl(219, 24%, 18%)",
  headerFill: "hsl(220, 24%, 12%)",
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
        headerDivider: theme.border,
        headerFill: theme.panelBg,
        stroke: theme.border,
      };
    }
  }

  return darkMode
    ? DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME
    : DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME;
}
