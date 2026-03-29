import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveParamEditorKind,
  resolveParamEditorKindFromCodeObjImpl,
  resolveParamValuePresentationKind,
  resolveParamValuePresentationKindFromCodeObjImpl,
} from "./paramEditorActivation";

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

  it("derives editor kind directly from the source-of-truth code object impl", () => {
    expect(
      resolveParamEditorKindFromCodeObjImpl({
        type: CodeObjTypeEnum.DropdownParam,
      }),
    ).toBe("combobox");
    expect(
      resolveParamEditorKindFromCodeObjImpl({
        colorChoices: [{ color: "#ff0000" }],
        type: CodeObjTypeEnum.ColorPickerParam,
      }),
    ).toBe("color-picker");
    expect(
      resolveParamEditorKindFromCodeObjImpl({
        colorChoices: [],
        type: CodeObjTypeEnum.ColorPickerParam,
      }),
    ).toBe("other");
  });
});

describe("resolveParamValuePresentationKind", () => {
  it("maps switch, combobox, and color-picker param types onto concrete value primitives", () => {
    expect(resolveParamValuePresentationKind(CodeObjTypeEnum.SwitchParam)).toBe(
      "switch",
    );
    expect(
      resolveParamValuePresentationKind(CodeObjTypeEnum.DropdownParam),
    ).toBe("combobox");
    expect(
      resolveParamValuePresentationKind(CodeObjTypeEnum.ColorPickerParam),
    ).toBe("text");
    expect(
      resolveParamValuePresentationKind(CodeObjTypeEnum.ColorPickerParam, {
        hasColorChoiceMenu: true,
      }),
    ).toBe("color-picker");
  });

  it("falls back to plain text for ordinary value rows and derives from the source-of-truth impl", () => {
    expect(resolveParamValuePresentationKind(CodeObjTypeEnum.TextParam)).toBe(
      "text",
    );
    expect(
      resolveParamValuePresentationKindFromCodeObjImpl({
        type: CodeObjTypeEnum.SwitchParam,
      }),
    ).toBe("switch");
    expect(
      resolveParamValuePresentationKindFromCodeObjImpl({
        type: CodeObjTypeEnum.DropdownParam,
      }),
    ).toBe("combobox");
    expect(
      resolveParamValuePresentationKindFromCodeObjImpl({
        colorChoices: [{ color: "#ff0000" }],
        type: CodeObjTypeEnum.ColorPickerParam,
      }),
    ).toBe("color-picker");
  });
});
