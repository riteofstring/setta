import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  BACKEND_CANVAS_OWNED_LIGHTWEIGHT_SWITCH_SECTION_ID,
  BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  isCanvasOwnedSectionParamFilterIcon,
  isCanvasOwnedSectionArgsLabelRestingText,
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  isCanvasOwnedSectionLightweightNestedChildren,
  isCanvasOwnedSectionLightweightColorInput,
  isCanvasOwnedSectionLightweightMenuTrigger,
  isCanvasOwnedSectionLightweightParamFilter,
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
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
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
    ).toBe(false);
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

  it("targets param-label resting text inside the owned canary sections", () => {
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
        "settings-section__textBlockSectionDefault",
      ),
    ).toBe(false);
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

  it("targets the section sizing policy dense lane for lightweight resize handles", () => {
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightResizeHandle(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("targets the section sizing policy dense lane for lightweight param labels", () => {
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightParamLabel(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
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
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("targets the section sizing policy dense lane for lightweight text underlines", () => {
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionLightweightTextUnderline(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toBe(false);
  });

  it("keeps nested guide ownership on the shell canaries and the active section sizing policy dense lane", () => {
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
        "settings-section__textBlockSectionDefault",
      ),
    ).toBe(false);
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
    });
  });
});
