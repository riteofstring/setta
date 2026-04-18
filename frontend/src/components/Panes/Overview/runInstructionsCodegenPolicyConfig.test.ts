import { describe, expect, it } from "vitest";

import {
  CodeObjValueRepresentationModeEnum,
  PythonCodegenPolicyUIConfig,
  SectionRepresentationModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

import {
  getRunInstructionsCodeObjRepresentationOptions,
  getRunInstructionsSectionRepresentationOptions,
} from "./runInstructionsCodegenPolicyConfig";

describe("runInstructionsCodegenPolicyConfig", () => {
  it("loads Go-owned visible section and code object lists", () => {
    expect(PythonCodegenPolicyUIConfig.sectionTypes).toEqual([
      "Callable",
      "Dict",
      "ListRoot",
      "Group",
      "GlobalVariables",
      "TextBlock",
      "Draw",
      "Image",
      "MetaControl",
      "Chat",
    ]);
    expect(PythonCodegenPolicyUIConfig.codeObjTypes).toEqual([
      "CodeParam",
      "TextParam",
      "DateParam",
      "TimeParam",
      "ButtonParam",
      "SliderParam",
      "RotaryParam",
      "SwitchParam",
      "ColorPickerParam",
      "DropdownParam",
      "PasswordParam",
      "TextAreaParam",
      "DropzoneParam",
      "NestedParam",
    ]);
    expect(PythonCodegenPolicyUIConfig.metaControlCodeObjTypes).toEqual([
      { type: "DropdownParam", label: "Dropdown" },
      { type: "SliderParam", label: "Slider" },
      { type: "RotaryParam", label: "Rotary" },
      { type: "SwitchParam", label: "Switch" },
      { type: "TextParam", label: "Text Input" },
      { type: "DateParam", label: "Date Input" },
      { type: "TimeParam", label: "Time Input" },
      { type: "TextAreaParam", label: "Text Area" },
      { type: "CodeParam", label: "Code Input" },
      { type: "PasswordParam", label: "Password Field" },
      { type: "ColorPickerParam", label: "Color Picker" },
      { type: "ButtonParam", label: "Button" },
      { type: "DropzoneParam", label: "Dropzone" },
    ]);
  });

  it("resolves section representation options from Go-owned metadata", () => {
    expect(
      getRunInstructionsSectionRepresentationOptions(SectionTypeEnum.Chat),
    ).toEqual([
      SectionRepresentationModeEnum.expression,
      SectionRepresentationModeEnum.file_path,
      SectionRepresentationModeEnum.file_read,
    ]);
    expect(
      getRunInstructionsSectionRepresentationOptions(SectionTypeEnum.Draw),
    ).toEqual([
      SectionRepresentationModeEnum.file_path,
      SectionRepresentationModeEnum.file_read,
    ]);
    expect(getRunInstructionsSectionRepresentationOptions(null)).toEqual([
      SectionRepresentationModeEnum.expression,
    ]);
  });

  it("resolves code object representation options from Go-owned metadata", () => {
    expect(
      getRunInstructionsCodeObjRepresentationOptions("SliderParam"),
    ).toEqual([
      CodeObjValueRepresentationModeEnum.expression,
      CodeObjValueRepresentationModeEnum.json_parsed,
      CodeObjValueRepresentationModeEnum.string,
    ]);
    expect(
      getRunInstructionsCodeObjRepresentationOptions("DropzoneParam"),
    ).toEqual([
      CodeObjValueRepresentationModeEnum.file_path,
      CodeObjValueRepresentationModeEnum.file_read,
    ]);
    expect(getRunInstructionsCodeObjRepresentationOptions(null)).toEqual([
      CodeObjValueRepresentationModeEnum.expression,
    ]);
  });
});
