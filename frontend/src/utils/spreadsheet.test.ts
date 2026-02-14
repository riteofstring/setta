import * as XLSX from "xlsx/xlsx.mjs";
import { describe, expect, it } from "vitest";
import {
  getSpreadsheetColumnLabel,
  isSpreadsheetPath,
  parseSpreadsheetBytes,
  serializeSpreadsheetBytes,
} from "./spreadsheet";

function bytesFromText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("spreadsheet utils", () => {
  it("detects supported spreadsheet file extensions", () => {
    expect(isSpreadsheetPath("/tmp/tasks.csv")).toBe(true);
    expect(isSpreadsheetPath("/tmp/tasks.xlsx")).toBe(true);
    expect(isSpreadsheetPath("/tmp/tasks.txt")).toBe(false);
  });

  it("parses csv bytes into editable rows", () => {
    const parsed = parseSpreadsheetBytes(
      "tasks.csv",
      bytesFromText("title,status\nOne,todo\nTwo,done\n"),
    );

    expect(parsed.rowCount).toBe(3);
    expect(parsed.columnCount).toBe(2);
    expect(parsed.rows[0]).toEqual(["title", "status"]);
    expect(parsed.rows[2]).toEqual(["Two", "done"]);
  });

  it("serializes edited rows back to csv bytes", () => {
    const bytes = serializeSpreadsheetBytes("tasks.csv", "Sheet1", [
      ["title", "status"],
      ["One", "done"],
    ]);
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain("title,status");
    expect(text).toContain("One,done");
  });

  it("parses xlsx bytes", () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["colA", "colB"],
      ["left", "right"],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "SheetA");
    const encoded = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const parsed = parseSpreadsheetBytes("sheet.xlsx", new Uint8Array(encoded));
    expect(parsed.sheetName).toBe("SheetA");
    expect(parsed.rows[1]).toEqual(["left", "right"]);
  });

  it("formats spreadsheet column labels", () => {
    expect(getSpreadsheetColumnLabel(0)).toBe("A");
    expect(getSpreadsheetColumnLabel(25)).toBe("Z");
    expect(getSpreadsheetColumnLabel(26)).toBe("AA");
    expect(getSpreadsheetColumnLabel(52)).toBe("BA");
  });
});
