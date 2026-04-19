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
export const DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__drawSectionDefault";
export const CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__chatSectionDefault";
export const CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__chatWindowing";
export const DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__dropzoneParamCodeObjDefault";
export const SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__shortcuts";
export const SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__spreadsheetSectionDefault";
export const TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__taskBoardSectionDefault";
export const STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__stateMachineStartSectionDefault";
export const SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS = [
  "settings-section__stateMachineEndSectionDefault",
  "settings-section__listRootSectionDefault",
  "settings-section__chartSectionDefault",
  "settings-section__groupSectionDefault",
  "settings-section__terminalSectionDefault",
  "settings-section__imageSectionDefault",
  "settings-section__socialSectionDefault",
  "settings-section__metaControlSectionDefault",
  "settings-section__iFrameSectionDefault",
] as const;
export const BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__browserSectionDefault";
export const GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__genPythonCodeSectionDefault";
export const GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__genPythonMetadataSectionDefault";
export const PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__pluginSectionDefault";
export const LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__languageServer";
export const BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__buttonParamCodeObjDefault";
export const ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__rotaryParamCodeObjDefault";
export const SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__sliderParamCodeObjDefault";
export const COLOR_PICKER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__colorPickerParamCodeObjDefault";
export const DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__dropdownParamCodeObjDefault";
export const TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__textParamCodeObjDefault";
export const SWITCH_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__switchParamCodeObjDefault";
export const PASSWORD_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__passwordParamCodeObjDefault";
export const CODE_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__codeParamCodeObjDefault";
export const TEXT_AREA_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__textAreaParamCodeObjDefault";
export const NESTED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__nestedParamCodeObjDefault";
export const SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS = [
  ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  COLOR_PICKER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SWITCH_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PASSWORD_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CODE_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_AREA_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  NESTED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
] as const;
export const CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__codeSectionDefault";
export const DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__dateParamCodeObjDefault";
export const PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__promptSectionDefault";
export const TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__timeParamCodeObjDefault";
export const TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__textBlockSectionDefault";
export const STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID =
  "settings-section__stateMachineGateSectionDefault";
export const GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID =
  "settings-section__gui";
export const BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID =
  "settings-section__backend";
export const BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID =
  BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID;
export const BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID =
  BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID;
export const SHARED_SETTINGS_DROPDOWN_CANVAS_OWNED_SECTION_IDS = [
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
] as const;
export const CALLABLE_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID =
  "settings-codeobj__callableSectionDefault__callableSectionDefault__size";
export const DICT_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID =
  "settings-codeobj__dictSectionDefault__dictSectionDefault__size";
export const GLOBAL_VARIABLES_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID =
  "settings-codeobj__globalVariablesSectionDefault__globalVariablesSectionDefault__size";
const SETTINGS_SECTION_ID_PREFIX = "settings-section__";
export const CANVAS_OWNED_SECTION_SHELL_IDS = [
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
] as const;
export const CANVAS_OWNED_RESTING_TEXT_SECTION_IDS = [
  ...CANVAS_OWNED_SECTION_SHELL_IDS,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  ...SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
  BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  ...SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
  CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
] as const;
export const CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_IDS = [
  ...CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
] as const;
const SECTION_SIZING_POLICY_META_CONTROL_DROPDOWN_PARAM_INFO_ID_PATTERN =
  /^settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__.+__sizeMode(?:Height|Width)$/;

const CANVAS_OWNED_SECTION_SHELL_ID_SET = new Set<string>(
  CANVAS_OWNED_SECTION_SHELL_IDS,
);
const CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET = new Set<string>(
  CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
);
const SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET =
  new Set<string>(SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS);
const SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET =
  new Set<string>(SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS);
const CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_ID_SET = new Set<string>(
  CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_IDS,
);
const CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_IDS_BY_SECTION_ID =
  new Map<string, string>([
    [
      CANVAS_OWNED_SECTION_SHELL_ID,
      CALLABLE_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
    ],
    [
      DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      DICT_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
    ],
    [
      GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      GLOBAL_VARIABLES_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
    ],
  ]);
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
  switchThumbFill: string;
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
  switchThumbFill: "#ffffff",
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
  switchThumbFill: "hsl(220, 24%, 12%)",
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

export function isCanvasOwnedSectionLightweightSwitchValueShell(
  sectionId: string,
) {
  return isCanvasOwnedSectionRestingTextSection(sectionId);
}

export function isCanvasOwnedSectionLightweightSwitchTrack(sectionId: string) {
  return isCanvasOwnedSectionRestingTextSection(sectionId);
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
  return isSettingsSectionId(sectionId);
}

export function isCanvasOwnedSectionLightweightParamLabel(sectionId: string) {
  return isSettingsSectionId(sectionId);
}

export function isCanvasOwnedSectionLightweightNestedChildren(
  sectionId: string,
) {
  return (
    isCanvasOwnedSectionRestingTextSection(sectionId) &&
    !isCanvasOwnedSectionShell(sectionId)
  );
}

export function isCanvasOwnedSectionLightweightNestedRowBody({
  paramInfoId,
  sectionId,
}: {
  paramInfoId: string;
  sectionId: string;
}) {
  return (
    isCanvasOwnedSectionLightweightNestedChildren(sectionId) ||
    CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_IDS_BY_SECTION_ID.get(
      sectionId,
    ) === paramInfoId
  );
}

export function isCanvasOwnedSectionLightweightTextUnderline(
  sectionId: string,
) {
  return (
    sectionId === SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET.has(
      sectionId,
    ) ||
    sectionId === BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID_SET.has(
      sectionId,
    ) ||
    sectionId === CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID ||
    sectionId === BACKEND_CANVAS_OWNED_RESTING_TEXT_SECTION_ID ||
    sectionId === TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID
  );
}

export function isCanvasOwnedSectionMotionHiddenBody(sectionId: string) {
  return CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_ID_SET.has(sectionId);
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
  return isCanvasOwnedSectionRestingTextSection(sectionId);
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
        switchThumbFill: darkMode
          ? DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME.switchThumbFill
          : DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME.switchThumbFill,
      };
    }
  }

  return darkMode
    ? DEFAULT_DARK_SECTION_SHELL_CANVAS_CHROME
    : DEFAULT_LIGHT_SECTION_SHELL_CANVAS_CHROME;
}
