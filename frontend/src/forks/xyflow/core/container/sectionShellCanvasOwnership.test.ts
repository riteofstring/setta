import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  isCanvasOwnedSectionParamFilterIcon,
  isCanvasOwnedSectionArgsLabelRestingText,
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  isCanvasOwnedSectionParamFilterUnderline,
  isCanvasOwnedSectionParamLabelRestingText,
  isCanvasOwnedSectionRestingText,
  isCanvasOwnedSectionShell,
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
    expect(isCanvasOwnedSectionShell("settings-section__textBlockSectionDefault")).toBe(false);
  });

  it("targets text-like params inside the owned canary sections for resting text ownership", () => {
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
      isCanvasOwnedSectionRestingText({
        codeObjType: CodeObjTypeEnum.TextParam,
        sectionId: "settings-section__textBlockSectionDefault",
      }),
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
        "settings-section__textBlockSectionDefault",
      ),
    ).toBe(false);
  });

  it("targets only the dict canary args label for canvas resting-text ownership", () => {
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
    ).toBe(false);
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

  it("targets only the dict canary filter icon for canvas ownership", () => {
    expect(
      isCanvasOwnedSectionParamFilterIcon(DICT_CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(true);
    expect(
      isCanvasOwnedSectionParamFilterIcon(CANVAS_OWNED_SECTION_SHELL_ID),
    ).toBe(false);
    expect(
      isCanvasOwnedSectionParamFilterIcon(
        GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
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
