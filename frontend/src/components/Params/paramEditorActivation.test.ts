import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveParamEditorKind } from "./paramEditorActivation";

describe("resolveParamEditorKind", () => {
  it("classifies CodeMirror-backed param types from the code object type", () => {
    expect(resolveParamEditorKind(CodeObjTypeEnum.CodeParam)).toBe(
      "codemirror",
    );
    expect(resolveParamEditorKind(CodeObjTypeEnum.TextParam)).toBe(
      "codemirror",
    );
    expect(resolveParamEditorKind(CodeObjTypeEnum.TextAreaParam)).toBe(
      "codemirror",
    );
  });

  it("leaves non-CodeMirror param types on the default editor path", () => {
    expect(resolveParamEditorKind(CodeObjTypeEnum.PasswordParam)).toBe("other");
    expect(resolveParamEditorKind(CodeObjTypeEnum.SwitchParam)).toBe("other");
  });

  it("classifies combobox-backed param types from the code object type", () => {
    expect(resolveParamEditorKind(CodeObjTypeEnum.DropdownParam)).toBe(
      "combobox",
    );
  });

  it("classifies popup color pickers only when a color-choice menu is available", () => {
    expect(resolveParamEditorKind(CodeObjTypeEnum.ColorPickerParam)).toBe(
      "other",
    );
    expect(
      resolveParamEditorKind(CodeObjTypeEnum.ColorPickerParam, {
        hasColorChoiceMenu: true,
      }),
    ).toBe("color-picker");
  });
});
