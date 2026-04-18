import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export const CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__callableSectionDefault";
export const DICT_CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__dictSectionDefault";
export const CANVAS_OWNED_SECTION_SHELL_IDS = [
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
] as const;

const CANVAS_OWNED_SECTION_SHELL_ID_SET = new Set<string>(
  CANVAS_OWNED_SECTION_SHELL_IDS,
);

export type SectionShellCanvasChrome = {
  callableToolbarDivider: string;
  callableToolbarFill: string;
  fill: string;
  headerFill: string;
  headerDivider: string;
  pinnedParamsDivider: string;
  pinnedParamsFill: string;
  stroke: string;
  switchTrackCheckedFill: string;
  switchTrackFill: string;
};

const DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME = {
  callableToolbarDivider: "#ffffff",
  callableToolbarFill: "hsl(220, 33%, 98%)",
  fill: "hsl(222, 28%, 95%)",
  headerDivider: "hsl(220, 24%, 86%)",
  headerFill: "hsl(220, 33%, 98%)",
  pinnedParamsDivider: "#ffffff",
  pinnedParamsFill: "#ffffff",
  stroke: "#ffffff",
  switchTrackCheckedFill: "#3b82f6",
  switchTrackFill: "hsl(220, 26%, 57%)",
} satisfies SectionShellCanvasChrome;

const DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME = {
  callableToolbarDivider: "hsl(219, 26%, 23%)",
  callableToolbarFill: "hsl(220, 24%, 12%)",
  fill: "hsl(220, 25%, 8.5%)",
  headerDivider: "hsl(219, 24%, 18%)",
  headerFill: "hsl(220, 24%, 12%)",
  pinnedParamsDivider: "hsl(219, 26%, 23%)",
  pinnedParamsFill: "hsl(220, 24%, 12%)",
  stroke: "hsl(219, 26%, 23%)",
  switchTrackCheckedFill: "#1d4ed8",
  switchTrackFill: "hsl(219, 25%, 34%)",
} satisfies SectionShellCanvasChrome;

function hasNonEmptyStyleColor(
  styleColor: string | null | undefined,
): styleColor is string {
  return typeof styleColor === "string" && styleColor.trim().length > 0;
}

export function isCanvasOwnedSectionShell(sectionId: string) {
  return CANVAS_OWNED_SECTION_SHELL_ID_SET.has(sectionId);
}

export function isCanvasOwnedSectionRestingText({
  codeObjType,
  sectionId,
}: {
  codeObjType: CodeObjTypeEnum;
  sectionId: string;
}) {
  return (
    isCanvasOwnedSectionShell(sectionId) &&
    (codeObjType === CodeObjTypeEnum.CodeParam ||
      codeObjType === CodeObjTypeEnum.TextParam ||
      codeObjType === CodeObjTypeEnum.TextAreaParam)
  );
}

export function isCanvasOwnedSectionParamLabelRestingText(sectionId: string) {
  return isCanvasOwnedSectionShell(sectionId);
}

export function isCanvasOwnedSectionArgsLabelRestingText(sectionId: string) {
  return sectionId === DICT_CANVAS_OWNED_SECTION_SHELL_ID;
}

export function isCanvasOwnedSectionParamFilterUnderline(sectionId: string) {
  return sectionId === DICT_CANVAS_OWNED_SECTION_SHELL_ID;
}

export function isCanvasOwnedSectionParamFilterIcon(sectionId: string) {
  return sectionId === DICT_CANVAS_OWNED_SECTION_SHELL_ID;
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
        callableToolbarDivider: theme.border,
        callableToolbarFill: theme.panelBg,
        fill: theme.bg,
        headerDivider: theme.border,
        headerFill: theme.panelBg,
        pinnedParamsDivider: theme.border,
        pinnedParamsFill: theme.panelBg,
        stroke: theme.border,
        switchTrackCheckedFill: theme.outline,
        switchTrackFill: theme.border,
      };
    }
  }

  return darkMode
    ? DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME
    : DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME;
}
