import { describe, expect, it } from "vitest";

import {
  CodeObjValueRepresentationModeEnum,
  SectionRepresentationModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

import {
  RUN_INSTRUCTIONS_CODEGEN_CODE_OBJ_TYPES,
  RUN_INSTRUCTIONS_CODEGEN_META_CONTROL_CODE_OBJ_TYPES,
  RUN_INSTRUCTIONS_CODEGEN_SECTION_MODE_OPTIONS,
  RUN_INSTRUCTIONS_CODEGEN_SECTION_TYPES,
  getRunInstructionsCodeObjRepresentationOptions,
  getRunInstructionsSectionRepresentationOptions,
} from "./runInstructionsCodegenPolicyConfig";

describe("runInstructionsCodegenPolicyConfig", () => {
  it("loads Go-owned visible section and code object lists", () => {
    expect(RUN_INSTRUCTIONS_CODEGEN_SECTION_TYPES).toEqual([
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
    expect(RUN_INSTRUCTIONS_CODEGEN_CODE_OBJ_TYPES).toEqual([
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
    expect(RUN_INSTRUCTIONS_CODEGEN_META_CONTROL_CODE_OBJ_TYPES).toEqual([
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

  it("preserves Go-owned section mode ordering", () => {
    expect(RUN_INSTRUCTIONS_CODEGEN_SECTION_MODE_OPTIONS).toEqual([
      { value: "inherit", label: "inherit" },
      { value: "include", label: "include" },
      { value: "exclude", label: "exclude" },
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
