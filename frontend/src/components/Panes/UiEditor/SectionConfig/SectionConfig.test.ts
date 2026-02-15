import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { sectionTypeSupportsAppearanceSettings } from "./SectionConfig";

describe("sectionTypeSupportsAppearanceSettings", () => {
  it("keeps appearance controls enabled for previously gated section types", () => {
    const types = [
      SectionTypeEnum.ListRoot,
      SectionTypeEnum.Group,
      SectionTypeEnum.GenPythonCode,
      SectionTypeEnum.GenPythonMetadata,
      SectionTypeEnum.Terminal,
    ];

    for (const sectionType of types) {
      expect(sectionTypeSupportsAppearanceSettings(sectionType)).toBe(true);
    }
  });

  it("continues enabling appearance controls for standard section types", () => {
    const types = [
      SectionTypeEnum.TextBlock,
      SectionTypeEnum.Code,
      SectionTypeEnum.Chat,
      SectionTypeEnum.Browser,
    ];

    for (const sectionType of types) {
      expect(sectionTypeSupportsAppearanceSettings(sectionType)).toBe(true);
    }
  });
});
