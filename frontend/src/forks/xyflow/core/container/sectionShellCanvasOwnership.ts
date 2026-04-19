import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export const CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__callableSectionDefault";
export const DICT_CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__dictSectionDefault";
export const GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID =
  "settings-section__globalVariablesSectionDefault";
export const SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__sectionSizingPolicy";
export const STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID =
  "settings-section__stateMachineGateSectionDefault";
export const GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID =
  "settings-section__gui";
export const BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID =
  "settings-section__backend";
export const BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID =
  "settings-section__backend";
const SETTINGS_SECTION_ID_PREFIX = "settings-section__";
export const CANVAS_OWNED_SECTION_SHELL_IDS = [
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
] as const;
export const CANVAS_OWNED_RESTING_TEXT_SECTION_IDS = [
  ...CANVAS_OWNED_SECTION_SHELL_IDS,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
] as const;
const SECTION_SIZING_POLICY_META_CONTROL_DROPDOWN_PARAM_INFO_ID_PATTERN =
  /^settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__.+__sizeMode(?:Height|Width)$/;

const CANVAS_OWNED_SECTION_SHELL_ID_SET = new Set<string>(
  CANVAS_OWNED_SECTION_SHELL_IDS,
);
const CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET = new Set<string>(
  CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
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

function isSettingsSectionId(sectionId: string) {
  return sectionId.startsWith(SETTINGS_SECTION_ID_PREFIX);
}

export function isCanvasOwnedSectionShell(sectionId: string) {
  return CANVAS_OWNED_SECTION_SHELL_ID_SET.has(sectionId);
}

export function isCanvasOwnedSectionRestingTextSection(sectionId: string) {
  return CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET.has(sectionId);
}

export function isCanvasOwnedSectionMetaControlDropdown({
  paramInfoId,
  sectionId,
}: {
  paramInfoId: string;
  sectionId: string;
}) {
  return (
    sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID &&
    SECTION_SIZING_POLICY_META_CONTROL_DROPDOWN_PARAM_INFO_ID_PATTERN.test(
      paramInfoId,
    )
  );
}

export function isCanvasOwnedSectionRestingDropdown({
  codeObjType,
  paramInfoId,
  sectionId,
}: {
  codeObjType: CodeObjTypeEnum;
  paramInfoId: string;
  sectionId: string;
}) {
  return (
    isCanvasOwnedSectionMetaControlDropdown({
      paramInfoId,
      sectionId,
    }) ||
    ((sectionId === GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID ||
      sectionId === BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID ||
      sectionId === STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID) &&
      codeObjType === CodeObjTypeEnum.DropdownParam)
  );
}

export function isCanvasOwnedSectionStateMachineGateDropdown(
  sectionId: string,
) {
  return sectionId === STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID;
}

export function isCanvasOwnedSectionLightweightSwitch({
  codeObjType,
  sectionId,
}: {
  codeObjType: CodeObjTypeEnum;
  sectionId: string;
}) {
  return (
    codeObjType === CodeObjTypeEnum.SwitchParam &&
    isSettingsSectionId(sectionId)
  );
}

export function isCanvasOwnedSectionLightweightParamFilter(sectionId: string) {
  return isSettingsSectionId(sectionId);
}

export function isCanvasOwnedSectionLightweightMenuTrigger(sectionId: string) {
  return isSettingsSectionId(sectionId);
}

export function isCanvasOwnedSectionLightweightColorInput(sectionId: string) {
  return isSettingsSectionId(sectionId);
}

export function isCanvasOwnedSectionLightweightResizeHandle(sectionId: string) {
  return sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID;
}

export function isCanvasOwnedSectionLightweightParamLabel(sectionId: string) {
  return sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID;
}

export function isCanvasOwnedSectionLightweightNestedChildren(
  sectionId: string,
) {
  return sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID;
}

export function isCanvasOwnedSectionLightweightTextUnderline(
  sectionId: string,
) {
  return sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID;
}

export function isCanvasOwnedSectionNestedGuide(sectionId: string) {
  return (
    isCanvasOwnedSectionShell(sectionId) ||
    isCanvasOwnedSectionLightweightNestedChildren(sectionId)
  );
}

export function isCanvasOwnedSectionRestingText({
  codeObjType,
  sectionId,
}: {
  codeObjType: CodeObjTypeEnum;
  sectionId: string;
}) {
  return (
    isCanvasOwnedSectionRestingTextSection(sectionId) &&
    (codeObjType === CodeObjTypeEnum.CodeParam ||
      codeObjType === CodeObjTypeEnum.TextParam ||
      codeObjType === CodeObjTypeEnum.TextAreaParam)
  );
}

export function isCanvasOwnedSectionParamLabelRestingText(sectionId: string) {
  return (
    isCanvasOwnedSectionShell(sectionId) ||
    isCanvasOwnedSectionLightweightParamLabel(sectionId)
  );
}

export function isCanvasOwnedSectionArgsLabelRestingText(sectionId: string) {
  return (
    sectionId === DICT_CANVAS_OWNED_SECTION_SHELL_ID ||
    sectionId === GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID
  );
}

export function isCanvasOwnedSectionParamFilterUnderline(sectionId: string) {
  return sectionId === DICT_CANVAS_OWNED_SECTION_SHELL_ID;
}

export function isCanvasOwnedSectionParamFilterIcon(sectionId: string) {
  return (
    sectionId === DICT_CANVAS_OWNED_SECTION_SHELL_ID ||
    sectionId === GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID
  );
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
