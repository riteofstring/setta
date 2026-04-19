import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID,
  BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CALLABLE_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
  CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  isCanvasOwnedSectionParamFilterIcon,
  isCanvasOwnedSectionArgsLabelRestingText,
  CANVAS_OWNED_SECTION_SHELL_ID,
  CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DICT_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SHARED_SETTINGS_DROPDOWN_CANVAS_OWNED_SECTION_IDS,
  SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
  SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS,
  SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  isCanvasOwnedSectionLightweightNestedChildren,
  isCanvasOwnedSectionLightweightColorInput,
  isCanvasOwnedSectionLightweightMenuTrigger,
  isCanvasOwnedSectionMotionHiddenBody,
  isCanvasOwnedSectionLightweightParamFilter,
  isCanvasOwnedSectionLightweightSwitchValueShell,
  isCanvasOwnedSectionLightweightSwitchTrack,
  isCanvasOwnedSectionLightweightNestedRowBody,
  isCanvasOwnedSectionNestedGuide,
  isCanvasOwnedSectionLightweightResizeHandle,
  isCanvasOwnedSectionLightweightParamLabel,
  isCanvasOwnedSectionLightweightSwitch,
  isCanvasOwnedSectionLightweightTextUnderline,
  isCanvasOwnedSectionMetaControlDropdown,
  isCanvasOwnedSectionParamFilterUnderline,
  isCanvasOwnedSectionParamLabelRestingText,
  isCanvasOwnedSectionRestingDropdown,
  isCanvasOwnedSectionRestingText,
  isCanvasOwnedSectionRestingTextSection,
  isCanvasOwnedSectionShell,
  isCanvasOwnedSectionStateMachineGateDropdown,
  resolveCanvasOwnedSectionShellChrome,
} from "./sectionShellCanvasOwnership";

describe("sectionShellCanvasOwnership", () => {
  it("targets the callable, dict, and global variables settings canary sections", () => {
    expect(isCanvasOwnedSectionShell(CANVAS_OWNED_SECTION_SHELL_ID)).toBe(true);
    expect(
      isCanvasOwnedSectionShell(DICT_CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionShell(GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionShell(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionShell("settings-section__textBlockSectionDefault"),
    ).toBe(false);
  });

  it("targets settings sections for lightweight menu triggers", () => {
    expect(
      isCanvasOwnedSectionLightweightMenuTrigger(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightMenuTrigger(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightMenuTrigger(
        "settings-section__chatSectionDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightMenuTrigger("round_lime-section__callable"),
    ).toBe(false);
  });

  it("targets settings sections for lightweight color inputs", () => {
    expect(
      isCanvasOwnedSectionLightweightColorInput(CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightColorInput(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightColorInput(
        "settings-section__drawSectionDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightColorInput("round_lime-section__callable"),
    ).toBe(false);
  });

  it("targets settings sections for lightweight param filters", () => {
    expect(
      isCanvasOwnedSectionLightweightParamFilter(CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamFilter(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamFilter(
        "settings-section__chatSectionDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamFilter("round_lime-section__callable"),
    ).toBe(false);
  });

  it("targets text-like params inside the resting-text-owned sections", () => {
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.CodeParam,
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextAreaParam,
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.SwitchParam,
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        "settings-section__nestedParamCodeObjDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingTextSection(
        DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.SwitchParam,
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: "settings-section__textBlockSectionDefault",
      }),
    ).toBe(true);
  });

  it("targets the state-machine gate section for the lightweight gate-type dropdown lane", () => {
    expect(
      isCanvasOwnedSectionStateMachineGateDropdown(
        STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionStateMachineGateDropdown(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionStateMachineGateDropdown(
        "settings-section__stateMachineStartSectionDefault",
      ),
    ).toBe(false);
  });

  it("targets the shared size/style/tag cluster for lightweight resting text and label text", () => {
    for (const sectionId of SHARED_SIZE_STYLE_TAG_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS) {
      expect(isCanvasOwnedSectionRestingTextSection(sectionId)).toBe(true);
      expect(
        isCanvasOwnedSectionRestingText({
          codeObjType: CodeObjTypeEnum.TextParam,
          sectionId,
        }),
      ).toBe(true);
      expect(isCanvasOwnedSectionLightweightTextUnderline(sectionId)).toBe(
        true,
      );
      expect(isCanvasOwnedSectionParamLabelRestingText(sectionId)).toBe(true);
    }
  });

  it("targets the shared param-codeobj cluster for lightweight resting text and label text", () => {
    for (const sectionId of SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS) {
      expect(isCanvasOwnedSectionRestingTextSection(sectionId)).toBe(true);
      expect(
        isCanvasOwnedSectionRestingText({
          codeObjType: CodeObjTypeEnum.TextParam,
          sectionId,
        }),
      ).toBe(true);
      expect(
        isCanvasOwnedSectionRestingText({
          codeObjType: CodeObjTypeEnum.CodeParam,
          sectionId,
        }),
      ).toBe(true);
      expect(
        isCanvasOwnedSectionRestingText({
          codeObjType: CodeObjTypeEnum.TextAreaParam,
          sectionId,
        }),
      ).toBe(true);
      expect(isCanvasOwnedSectionLightweightTextUnderline(sectionId)).toBe(
        true,
      );
      expect(isCanvasOwnedSectionParamLabelRestingText(sectionId)).toBe(true);
    }
  });

  it("targets the current motion-hidden body overlay sections", () => {
    expect(
      isCanvasOwnedSectionMotionHiddenBody(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    for (const sectionId of SHARED_SETTINGS_DROPDOWN_CANVAS_OWNED_SECTION_IDS) {
      expect(isCanvasOwnedSectionMotionHiddenBody(sectionId)).toBe(true);
    }
    for (const sectionId of SHARED_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_IDS) {
      expect(isCanvasOwnedSectionMotionHiddenBody(sectionId)).toBe(true);
    }
    expect(
      isCanvasOwnedSectionMotionHiddenBody("settings-section__spreadsheetSectionDefault"),
    ).toBe(false);
  });

  it("targets param-label resting text across the current settings resting-text boundary", () => {
    expect(
      isCanvasOwnedSectionParamLabelRestingText(CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        "settings-section__spreadsheetSectionDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamLabelRestingText(
        "settings-section__nestedParamCodeObjDefault",
      ),
    ).toBe(true);
  });

  it("targets the dict and global variables canary args labels for canvas resting-text ownership", () => {
    expect(
      isCanvasOwnedSectionArgsLabelRestingText(
        DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionArgsLabelRestingText(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionArgsLabelRestingText(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
  });

  it("targets only the dict canary filter underline for canvas ownership", () => {
    expect(
      isCanvasOwnedSectionParamFilterUnderline(
        DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamFilterUnderline(CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionParamFilterUnderline(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("targets the dict and global variables canary filter icons for canvas ownership", () => {
    expect(
      isCanvasOwnedSectionParamFilterIcon(DICT_CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamFilterIcon(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamFilterIcon(CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(false);
  });

  it("targets section sizing policy size-mode meta-control dropdowns for canvas ownership", () => {
    expect(
      isCanvasOwnedSectionMetaControlDropdown({
        paramInfoId:
          "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__Browser__sizeModeHeight",
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionMetaControlDropdown({
        paramInfoId:
          "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__CodeCallable__sizeModeWidth",
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionMetaControlDropdown({
        paramInfoId:
          "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__Browser__maxHeight",
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionMetaControlDropdown({
        paramInfoId:
          "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__Browser__sizeModeHeight",
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(false);
  });

  it("targets gui, backend, and state-machine gate dropdown params for canvas-owned resting dropdowns", () => {
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.DropdownParam,
        paramInfoId: "settings-codeobj__gui__gui__gridPattern",
        sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.DropdownParam,
        paramInfoId: "settings-codeobj__gui__gui__panOnScrollMode",
        sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.TextParam,
        paramInfoId: "settings-codeobj__gui__gui__selectionMode",
        sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.DropdownParam,
        paramInfoId: "settings-codeobj__backend__backend__renameRefactorMode",
        sectionId: BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.DropdownParam,
        paramInfoId: "settings-codeobj__backend__backend__runSnapshotMode",
        sectionId: BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.TextParam,
        paramInfoId: "settings-codeobj__backend__backend__defaultTerminalShell",
        sectionId: BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.DropdownParam,
        paramInfoId:
          "settings-codeobj__stateMachineGateSectionDefault__stateMachineGateSectionDefault__gateType",
        sectionId: STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionRestingDropdown({
        codeObjType: CodeObjTypeEnum.TextParam,
        paramInfoId:
          "settings-codeobj__stateMachineGateSectionDefault__stateMachineGateSectionDefault__displayName",
        sectionId: STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(false);
  });

  it("targets switch params across settings sections for the lightweight switch activator lane", () => {
    expect(
      isCanvasOwnedSectionLightweightSwitch({
        codeObjType: CodeObjTypeEnum.SwitchParam,
        sectionId: BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitch({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionLightweightSwitch({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionLightweightSwitch({
        codeObjType: CodeObjTypeEnum.SwitchParam,
        sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitch({
        codeObjType: CodeObjTypeEnum.SwitchParam,
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitch({
        codeObjType: CodeObjTypeEnum.SwitchParam,
        sectionId: "round_lime__callableSectionDefault",
      }),
    ).toBe(false);
  });

  it("targets the retained resting-text section boundary for switch value-shell flattening without widening backend", () => {
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID,
      ),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        "settings-section__nestedParamCodeObjDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchValueShell(
        "round_lime__callableSectionDefault",
      ),
    ).toBe(false);
  });

  it("targets the retained resting-text section boundary for canvas-owned switch visuals", () => {
    expect(
      isCanvasOwnedSectionLightweightSwitchTrack(
        CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchTrack(
        BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchTrack(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchTrack(
        "settings-section__nestedParamCodeObjDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightSwitchTrack(
        "round_lime__callableSectionDefault",
      ),
    ).toBe(false);
  });

  it("targets settings sections for lightweight resize handles", () => {
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        "round_lime__callableSectionDefault",
      ),
    ).toBe(false);
  });

  it("targets settings sections for lightweight param labels", () => {
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        "settings-section__spreadsheetSectionDefault",
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel("round_lime-section__callable"),
    ).toBe(false);
  });

  it("targets the section sizing policy dense lane for lightweight nested children", () => {
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("targets the dense resting-text lanes for lightweight text underlines", () => {
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("keeps nested guide ownership on the shell canaries and the shared resting-text nested-children boundary", () => {
    expect(isCanvasOwnedSectionNestedGuide(CANVAS_OWNED_SECTION_SHELL_ID)).toBe(
      true,
    );
    expect(
      isCanvasOwnedSectionNestedGuide(
        DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionNestedGuide(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionNestedGuide(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionNestedGuide(
        LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionNestedGuide(
        "settings-section__textBlockSectionDefault",
      ),
    ).toBe(true);
  });

  it("targets the shared resting-text settings boundary for lightweight nested children without widening the shell canaries", () => {
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionLightweightNestedChildren(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("targets only the shell size wrapper rows for lightweight nested row bodies", () => {
    expect(
      isCanvasOwnedSectionLightweightNestedRowBody({
        paramInfoId: CALLABLE_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedRowBody({
        paramInfoId: DICT_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
        sectionId: DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedRowBody({
        paramInfoId:
          GLOBAL_VARIABLES_CANVAS_OWNED_LIGHTWEIGHT_SIZE_WRAPPER_PARAM_INFO_ID,
        sectionId: GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightNestedRowBody({
        paramInfoId:
          "settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor",
        sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
      }),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionLightweightNestedRowBody({
        paramInfoId: "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType",
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      }),
    ).toBe(true);
  });

  it("uses the default callable shell colors when no style color is set", () => {
    expect(
      resolveCanvasOwnedSectionShellChrome({
        darkMode: false,
        styleColor: null,
      }),
    ).toEqual({
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
    });

    expect(
      resolveCanvasOwnedSectionShellChrome({
        darkMode: true,
        styleColor: "",
      }),
    ).toEqual({
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
    });
  });

  it("reuses section style theme colors when a style color is present", () => {
    const theme = deriveSectionStyleTheme("#22c55e", false);
    if (!theme) {
      throw new Error("Expected a valid derived theme for the test color.");
    }

    expect(
      resolveCanvasOwnedSectionShellChrome({
        darkMode: false,
        styleColor: "#22c55e",
      }),
    ).toEqual({
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
      switchThumbFill: "#ffffff",
    });
  });
});
