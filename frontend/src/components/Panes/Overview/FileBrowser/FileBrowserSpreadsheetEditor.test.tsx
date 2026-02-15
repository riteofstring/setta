import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  applySpreadsheetCellUpdates,
  getSpreadsheetDensityMetrics,
  getSpreadsheetGlideDensityMultiplier,
  getSpreadsheetGlideTheme,
  getSpreadsheetGridTemplateColumns,
  getSpreadsheetGridWidth,
  SPREADSHEET_DATA_COLUMN_WIDTH,
  SPREADSHEET_FILTER_INPUT_CLASS_NAME,
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
    expect(getSpreadsheetGlideDensityMultiplier(20)).toBeLessThanOrEqual(6);
    expect(getSpreadsheetGlideDensityMultiplier(0)).toBe(1);
  });

  it("uses explicit non-black header colors in glide theme for both modes", () => {
    const light = getSpreadsheetGlideTheme({
      darkMode: false,
      densityMultiplier: 1,
    });
    const dark = getSpreadsheetGlideTheme({
      darkMode: true,
      densityMultiplier: 1,
    });

    expect(light.bgHeader).toBe("#d3dbe8");
    expect(light.bgHeaderHasFocus).toBe("#c5d0e4");
    expect(dark.bgHeader).toBe("#1f2737");
    expect(dark.bgHeaderHasFocus).toBe("#26314a");
  });

  it("keeps spreadsheet filter styling aligned with browser/callable search", () => {
    expect(SPREADSHEET_FILTER_INPUT_CLASS_NAME).toContain(
      "[border-width:0_0_1px_0]",
    );
    expect(SPREADSHEET_FILTER_INPUT_CLASS_NAME).toContain(
      "placeholder-setta-400",
    );
    expect(SPREADSHEET_FILTER_INPUT_CLASS_NAME).toContain(
      "dark:placeholder-setta-600",
    );
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

  it("applies edits by cloning only touched rows", () => {
    const rowA = ["a0", "a1"];
    const rowB = ["b0", "b1"];
    const rows = [rowA, rowB];
    const next = applySpreadsheetCellUpdates({
      rows,
      columnCount: 2,
      edits: [{ rowIndex: 1, columnIndex: 0, value: "b0-updated" }],
    });

    expect(next).not.toBe(rows);
    expect(next[0]).toBe(rowA);
    expect(next[1]).not.toBe(rowB);
    expect(next[1]?.[0]).toBe("b0-updated");
    expect(rows[1]?.[0]).toBe("b0");
  });

  it("returns the same rows reference when no valid edits are provided", () => {
    const rows = [["a0", "a1"]];
    const next = applySpreadsheetCellUpdates({
      rows,
      columnCount: 2,
      edits: [{ rowIndex: 0, columnIndex: 5, value: "ignored" }],
    });

    expect(next).toBe(rows);
  });
});
