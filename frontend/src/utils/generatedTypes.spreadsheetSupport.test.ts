import {
  SectionTypeEnum,
  SpreadsheetGridDensityEnum,
  createSpreadsheetSectionImpl,
  createUserDefaultSpreadsheetSectionImpl,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated spreadsheet support", () => {
  it("exports the canonical spreadsheet density enum", () => {
    expect(SpreadsheetGridDensityEnum.compact).toBe("compact");
    expect(SpreadsheetGridDensityEnum.comfortable).toBe("comfortable");
  });

  it("builds spreadsheet section defaults and impls", () => {
    const impl = createSpreadsheetSectionImpl(
      createUserDefaultSpreadsheetSectionImpl({
        filePath: "artifacts/sheet.xlsx",
        readOnly: true,
      }),
      {
        id: "spreadsheet-impl",
        density: SpreadsheetGridDensityEnum.comfortable,
      },
    );

    expect(impl.type).toBe(SectionTypeEnum.Spreadsheet);
    expect(impl.id).toBe("spreadsheet-impl");
    expect(impl.filePath).toBe("artifacts/sheet.xlsx");
    expect(impl.readOnly).toBe(true);
    expect(impl.density).toBe(SpreadsheetGridDensityEnum.comfortable);
    expect(impl.showRowNumbers).toBe(true);
  });
});
