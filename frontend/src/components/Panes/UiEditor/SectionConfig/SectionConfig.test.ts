import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: vi.fn(),
}));

vi.mock("state/definitions", () => ({
  useProjectState: vi.fn(),
}));

vi.mock("./BrowserAreaSettings", () => ({
  BrowserAreaSettings: () => null,
}));
vi.mock("./ChartAreaSettings", () => ({
  ChartAreaSettings: () => null,
}));
vi.mock("./ChatAreaSettings", () => ({
  ChatAreaSettings: () => null,
}));
vi.mock("./ChildDefaultsSettings", () => ({
  ChildDefaultsSettings: () => null,
}));
vi.mock("./CodeAreaSettings", () => ({
  CodeAreaSettings: () => null,
}));
vi.mock("./DrawAreaSettings", () => ({
  DrawAreaSettings: () => null,
}));
vi.mock("./EdgePortsSettings", () => ({
  EdgePortsSettings: () => null,
}));
vi.mock("./IframeSettings", () => ({
  IframeSettings: () => null,
}));
vi.mock("./ImageAreaSettings", () => ({
  ImageAreaSettings: () => null,
}));
vi.mock("./MetaControlSettings", () => ({
  MetaControlSettings: () => null,
}));
vi.mock("./PromptSettings", () => ({
  PromptSettings: () => null,
}));
vi.mock("./SectionConfigAccordion", () => ({
  SectionConfigAccordion: () => null,
}));
vi.mock("./SectionStyleColorSettings", () => ({
  SectionStyleColorSettings: () => null,
}));
vi.mock("./SectionTagColorSettings", () => ({
  SectionTagColorSettings: () => null,
}));
vi.mock("./SocialAreaSettings", () => ({
  SocialAreaSettings: () => null,
}));
vi.mock("./SpreadsheetSectionSettings", () => ({
  SpreadsheetSectionSettings: () => null,
}));
vi.mock("./StateMachineSectionSettings", () => ({
  StateMachineSectionSettings: () => null,
}));
vi.mock("./TaskBoardSettings", () => ({
  TaskBoardSettings: () => null,
}));
vi.mock("./TextBlockSettings", () => ({
  TextBlockSettings: () => null,
}));

const {
  getDefaultSectionConfigOpenValues,
  normalizeSectionConfigOpenValues,
  sectionTypeSupportsAppearanceSettings,
} = await import("./SectionConfig");

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
      SectionTypeEnum.StateMachineStart,
      SectionTypeEnum.StateMachineGate,
      SectionTypeEnum.StateMachineEnd,
    ];

    for (const sectionType of types) {
      expect(sectionTypeSupportsAppearanceSettings(sectionType)).toBe(true);
    }
  });

  it("leaves appearance controls disabled for section types without config", () => {
    expect(sectionTypeSupportsAppearanceSettings(SectionTypeEnum.Plugin)).toBe(
      false,
    );
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
