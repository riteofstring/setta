import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getSpreadsheetGridTemplateColumns,
  getSpreadsheetGridWidth,
  SPREADSHEET_ROW_HEIGHT,
  SpreadsheetRow,
} from "./FileBrowserSpreadsheetEditor";

describe("FileBrowserSpreadsheetEditor (perf)", () => {
  it("renders wide spreadsheet rows within budget", () => {
    const columnCount = 180;
    const rows = [
      Array.from({ length: columnCount }, (_value, index) => `cell-${index}`),
    ];
    const start = performance.now();
    const markup = renderToStaticMarkup(
      <SpreadsheetRow
        index={0}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: getSpreadsheetGridWidth(columnCount),
          height: SPREADSHEET_ROW_HEIGHT,
        }}
        sourceRows={rows}
        displayedRowIndexes={[0]}
        columnCount={columnCount}
        showRowNumbers={true}
        readOnly={false}
        gridTemplateColumns={getSpreadsheetGridTemplateColumns(columnCount)}
        onChangeCell={vi.fn()}
      />,
    );
    const elapsedMs = performance.now() - start;

    expect(markup).toContain(`data-spreadsheet-cell="0:${columnCount - 1}"`);
    expect(elapsedMs).toBeLessThan(1200);
  });
});
