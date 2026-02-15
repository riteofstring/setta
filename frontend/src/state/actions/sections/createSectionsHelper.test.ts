import { describe, expect, it } from "vitest";
import { CodeLanguageEnum, SectionTypeEnum } from "utils/generatedTypes";
import { getBaseCodeSectionCreateItems } from "./createSectionsHelper";

describe("getBaseCodeSectionCreateItems", () => {
  it("includes JSON, YAML, and TOML code creation presets", () => {
    const items = getBaseCodeSectionCreateItems();
    const byName = Object.fromEntries(items.map((item) => [item.name, item]));

    expect(byName.JSON?.implSpecs.type).toBe(SectionTypeEnum.Code);
    expect(byName.YAML?.implSpecs.type).toBe(SectionTypeEnum.Code);
    expect(byName.TOML?.implSpecs.type).toBe(SectionTypeEnum.Code);
    expect(byName.JSON?.implSpecs.codeLanguage).toBe(
      CodeLanguageEnum.json,
    );
    expect(byName.YAML?.implSpecs.codeLanguage).toBe(
      CodeLanguageEnum.yaml,
    );
    expect(byName.TOML?.implSpecs.codeLanguage).toBe(
      CodeLanguageEnum.toml,
    );
  });
});
