import * as XLSX from "xlsx/xlsx.mjs";

const DEFAULT_SHEET_NAME = "Sheet1";

const SPREADSHEET_EXTENSIONS = new Set(["csv", "tsv", "xlsx", "xls"]);

type SpreadsheetData = {
  fileExtension: string;
  sheetName: string;
  rows: string[][];
  rowCount: number;
  columnCount: number;
  sourceWorkbookBytes: Uint8Array | null;
};

function getExtension(path: string): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1 || lastDot === path.length - 1) {
    return "";
  }
  return path.slice(lastDot + 1).toLowerCase();
}

function normalizeSheetRows(rows: string[][]): string[][] {
  let maxColumns = 0;
  for (const row of rows) {
    if (row.length > maxColumns) {
      maxColumns = row.length;
    }
  }
  const columnCount = Math.max(1, maxColumns);
  if (rows.length === 0) {
    return [Array.from({ length: columnCount }, () => "")];
  }
  return rows.map((row) => {
    if (row.length === columnCount) {
      return row;
    }
    const padded = Array.from({ length: columnCount }, () => "");
    for (let i = 0; i < row.length; i += 1) {
      padded[i] = row[i] ?? "";
    }
    return padded;
  });
}

function toStringCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function isSpreadsheetPath(path: string): boolean {
  return SPREADSHEET_EXTENSIONS.has(getExtension(path));
}

export function parseSpreadsheetBytes(
  filePath: string,
  bytes: Uint8Array,
): SpreadsheetData {
  const fileExtension = getExtension(filePath);
  const workbook = XLSX.read(bytes, { type: "array", dense: true, raw: false });
  const sheetName = workbook.SheetNames[0] ?? DEFAULT_SHEET_NAME;
  const firstSheet = workbook.Sheets[sheetName];
  const asAoA = firstSheet
    ? (XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: false,
        blankrows: true,
        defval: "",
      }) as unknown[][])
    : [];
  const normalized = normalizeSheetRows(
    asAoA.map((row) => row.map((cell) => toStringCell(cell))),
  );
  const columnCount = normalized[0]?.length ?? 1;
  return {
    fileExtension,
    sheetName,
    rows: normalized,
    rowCount: normalized.length,
    columnCount,
    sourceWorkbookBytes:
      fileExtension === "xlsx" || fileExtension === "xls" ? bytes : null,
  };
}

function trimTrailingEmptyCells(row: string[]): string[] {
  let end = row.length - 1;
  while (end >= 0) {
    const value = row[end];
    if (value !== undefined && value !== "") {
      break;
    }
    end -= 1;
  }
  if (end < 0) {
    return [];
  }
  return row.slice(0, end + 1);
}

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  const trimmedRows = rows.map((row) => trimTrailingEmptyCells(row));
  let end = trimmedRows.length - 1;
  while (end >= 0) {
    if (trimmedRows[end] && trimmedRows[end].length > 0) {
      break;
    }
    end -= 1;
  }
  if (end < 0) {
    return [];
  }
  return trimmedRows.slice(0, end + 1);
}

function getBookType(extension: string): XLSX.BookType {
  if (extension === "csv" || extension === "tsv") {
    return "csv";
  }
  if (extension === "xls") {
    return "xls";
  }
  return "xlsx";
}

export function serializeSpreadsheetBytes(
  filePath: string,
  sheetName: string,
  rows: string[][],
  sourceWorkbookBytes: Uint8Array | null = null,
): Uint8Array {
  const extension = getExtension(filePath);
  const trimmedRows = trimTrailingEmptyRows(rows);
  const rowsToWrite = trimmedRows.length > 0 ? trimmedRows : [[""]];
  const worksheet = XLSX.utils.aoa_to_sheet(rowsToWrite);
  const resolvedSheetName = sheetName || DEFAULT_SHEET_NAME;
  const isExcelWorkbook = extension === "xlsx" || extension === "xls";
  let workbook: XLSX.WorkBook;
  if (isExcelWorkbook && sourceWorkbookBytes) {
    workbook = XLSX.read(sourceWorkbookBytes, {
      type: "array",
      dense: true,
      raw: false,
    });
  } else {
    workbook = XLSX.utils.book_new();
  }
  workbook.Sheets[resolvedSheetName] = worksheet;
  if (!workbook.SheetNames.includes(resolvedSheetName)) {
    workbook.SheetNames.push(resolvedSheetName);
  }
  const result = XLSX.write(workbook, {
    type: "array",
    bookType: getBookType(extension),
    FS: extension === "tsv" ? "\t" : ",",
  });
  return new Uint8Array(result);
}

export function getSpreadsheetColumnLabel(index: number): string {
  if (index < 0) {
    return "";
  }
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}
