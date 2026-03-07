import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getDefaultSectionConfigOpenValues,
  normalizeSectionConfigOpenValues,
  sectionTypeSupportsAppearanceSettings,
} from "./SectionConfig";

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

describe("section config accordion open state", () => {
  it("defaults to the first enabled panel", () => {
    expect(getDefaultSectionConfigOpenValues(false, false)).toEqual([
      "section-config-main",
    ]);
    expect(getDefaultSectionConfigOpenValues(true, false)).toEqual([
      "section-config-appearance",
    ]);
    expect(getDefaultSectionConfigOpenValues(true, true)).toEqual([]);
  });

  it("drops disabled panels and auto-heals to an enabled panel", () => {
    expect(
      normalizeSectionConfigOpenValues(["section-config-main"], true, false),
    ).toEqual(["section-config-appearance"]);
    expect(
      normalizeSectionConfigOpenValues(
        ["section-config-main", "section-config-appearance"],
        false,
        true,
      ),
    ).toEqual(["section-config-main"]);
    expect(normalizeSectionConfigOpenValues([], false, false)).toEqual([
      "section-config-main",
    ]);
    expect(normalizeSectionConfigOpenValues([], true, true)).toEqual([]);
  });
});
