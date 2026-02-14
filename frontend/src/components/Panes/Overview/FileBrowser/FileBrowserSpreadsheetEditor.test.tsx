import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getSpreadsheetDensityMetrics,
  getSpreadsheetGlideDensityMultiplier,
  getSpreadsheetGridTemplateColumns,
  getSpreadsheetGridWidth,
  SPREADSHEET_DATA_COLUMN_WIDTH,
  SPREADSHEET_HEADER_HEIGHT,
  SPREADSHEET_INDEX_COLUMN_WIDTH,
  SPREADSHEET_ROW_HEIGHT,
  SpreadsheetRow,
} from "./FileBrowserSpreadsheetEditor";

describe("FileBrowserSpreadsheetEditor layout", () => {
  it("uses compact spreadsheet sizing defaults", () => {
    expect(SPREADSHEET_HEADER_HEIGHT).toBeLessThanOrEqual(24);
    expect(SPREADSHEET_ROW_HEIGHT).toBeLessThanOrEqual(24);
    expect(SPREADSHEET_INDEX_COLUMN_WIDTH).toBeLessThanOrEqual(40);
    expect(SPREADSHEET_DATA_COLUMN_WIDTH).toBeLessThanOrEqual(92);
    expect(getSpreadsheetGridWidth(2)).toBe(
      SPREADSHEET_INDEX_COLUMN_WIDTH + SPREADSHEET_DATA_COLUMN_WIDTH * 2,
    );
    expect(getSpreadsheetGridTemplateColumns(3)).toContain("repeat(3");
  });

  it("supports row-number-less grid sizing and comfortable density", () => {
    const comfortable = getSpreadsheetDensityMetrics("comfortable");
    expect(comfortable.rowHeight).toBeGreaterThan(SPREADSHEET_ROW_HEIGHT);
    expect(getSpreadsheetGridWidth(2, false, "compact")).toBe(
      SPREADSHEET_DATA_COLUMN_WIDTH * 2,
    );
    expect(getSpreadsheetGridTemplateColumns(2, false, "comfortable")).toBe(
      `repeat(2, ${comfortable.dataColumnWidth}px)`,
    );
  });

  it("oversamples glide rendering for zoom-out and zoom-in to keep grid crisp", () => {
    expect(getSpreadsheetGlideDensityMultiplier(1)).toBe(1);
    expect(getSpreadsheetGlideDensityMultiplier(0.5)).toBeGreaterThan(1);
    expect(getSpreadsheetGlideDensityMultiplier(2)).toBeGreaterThan(1);
    expect(getSpreadsheetGlideDensityMultiplier(20)).toBeLessThanOrEqual(3);
    expect(getSpreadsheetGlideDensityMultiplier(0)).toBe(1);
  });

  it("renders cells with box-border and overflow guards to prevent bleed", () => {
    const markup = renderToStaticMarkup(
      <SpreadsheetRow
        index={0}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: getSpreadsheetGridWidth(2),
          height: SPREADSHEET_ROW_HEIGHT,
        }}
        rows={[["task", "status"]]}
        columnCount={2}
        showRowNumbers={true}
        readOnly={false}
        gridTemplateColumns={getSpreadsheetGridTemplateColumns(2)}
        onChangeCell={vi.fn()}
      />,
    );

    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("box-border");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("dark:bg-setta-950/70");
    expect(markup).toContain("dark:focus:bg-blue-900/30");
  });
});
