import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getBgColor } from "./utils";

describe("getBgColor", () => {
  it.each([
    [SectionTypeEnum.Code, "bg-white dark:bg-setta-900"],
    [SectionTypeEnum.GenPythonCode, "bg-white dark:bg-setta-900"],
    [SectionTypeEnum.GenPythonMetadata, "bg-white dark:bg-setta-900"],
    [SectionTypeEnum.Terminal, "bg-setta-950 overflow-clip"],
    [SectionTypeEnum.Browser, "@container/multipane"],
    [SectionTypeEnum.GlobalVariables, "bg-white dark:bg-black"],
    [SectionTypeEnum.StateMachineStart, "bg-stone-100 dark:bg-[#171717]"],
    [SectionTypeEnum.StateMachineGate, "bg-stone-100 dark:bg-[#171717]"],
    [SectionTypeEnum.StateMachineEnd, "bg-stone-100 dark:bg-[#171717]"],
    [SectionTypeEnum.MetaControl, "bg-transparent"],
  ])("maps %s to its expected background classes", (sectionType, expected) => {
    expect(getBgColor(sectionType)).toBe(expected);
  });

  it("falls back to the default background classes for unlisted section types", () => {
    expect(getBgColor("UnknownSectionType" as SectionTypeEnum)).toBe(
      "bg-setta-50 dark:bg-setta-860",
    );
  });
});
