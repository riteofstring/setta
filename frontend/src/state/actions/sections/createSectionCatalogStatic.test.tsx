import {
  CodeLanguageEnum,
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getBaseCodeSectionCreateItems,
  getBaseMetaControlGroupItems,
} from "./createSectionCatalogStatic";

describe("createSectionCatalogStatic", () => {
  it("includes JSON, YAML, and TOML code creation presets", () => {
    // Static code presets should keep the structured-text section variants available.
    const items = getBaseCodeSectionCreateItems();
    const byName = Object.fromEntries(items.map((item) => [item.name, item]));

    expect(byName.JSON?.implSpecs.type).toBe(SectionTypeEnum.Code);
    expect(byName.YAML?.implSpecs.type).toBe(SectionTypeEnum.Code);
    expect(byName.TOML?.implSpecs.type).toBe(SectionTypeEnum.Code);
    expect(byName.JSON?.implSpecs.codeLanguage).toBe(CodeLanguageEnum.json);
    expect(byName.YAML?.implSpecs.codeLanguage).toBe(CodeLanguageEnum.yaml);
    expect(byName.TOML?.implSpecs.codeLanguage).toBe(CodeLanguageEnum.toml);
  });

  it("keeps the calendar meta-control preset in the static catalog", () => {
    // Hook-time gating should not have to rebuild the fixed control preset definitions.
    const items = getBaseMetaControlGroupItems();
    const calendar = items.find((item) => item.name === "Calendar");

    expect(calendar?.controlCodeObjType).toBe(CodeObjTypeEnum.DateParam);
    expect(calendar?.controlParamConfig).toEqual({
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
    });
  });
});
