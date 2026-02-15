import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx/xlsx.mjs";
import {
  parseSpreadsheetBytes,
  serializeSpreadsheetBytes,
} from "./spreadsheet";

function buildLargeSheet(rows: number, columns: number): string[][] {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from(
      { length: columns },
      (_, columnIndex) => `r${rowIndex}-c${columnIndex}`,
    ),
  );
}

describe("spreadsheet performance", () => {
  it("parses and serializes large xlsx files within budget", () => {
    const sourceRows = buildLargeSheet(1200, 24);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sourceRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const bytes = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    );

    const parseStart = performance.now();
    const parsed = parseSpreadsheetBytes("perf-sheet.xlsx", bytes);
    const parseElapsedMs = performance.now() - parseStart;

    const serializeStart = performance.now();
    const serialized = serializeSpreadsheetBytes(
      "perf-sheet.xlsx",
      parsed.sheetName,
      parsed.rows,
    );
    const serializeElapsedMs = performance.now() - serializeStart;

    expect(parsed.rowCount).toBe(1200);
    expect(parsed.columnCount).toBe(24);
    expect(serialized.byteLength).toBeGreaterThan(0);
    expect(parseElapsedMs).toBeLessThan(2500);
    expect(serializeElapsedMs).toBeLessThan(2500);
  });
});
