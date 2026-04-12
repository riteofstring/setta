/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";
import type { FileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import { describe, expect, it } from "vitest";
import {
  isSupportedSpreadsheetDropTarget,
  resolveSpreadsheetDropTarget,
} from "./SpreadsheetArea";

describe("resolveSpreadsheetDropTarget", () => {
  it("prefers workspace file payloads", () => {
    const payload: FileBrowserDragPayload = {
      type: "file",
      name: "budget.xlsx",
      fullPath: "/workspace/budget.xlsx",
    };

    expect(resolveSpreadsheetDropTarget(payload, null)).toEqual({
      kind: "workspace",
      name: "budget.xlsx",
      path: "/workspace/budget.xlsx",
    });
  });

  it("falls back to the native file when the payload is not a workspace file", () => {
    const payload: FileBrowserDragPayload = {
      type: "folder",
      name: "reports",
      fullPath: "/workspace/reports",
    };
    const nativeFile = new File(["a,b"], "budget.csv", { type: "text/csv" });

    expect(resolveSpreadsheetDropTarget(payload, nativeFile)).toEqual({
      kind: "native",
      file: nativeFile,
    });
  });

  it("returns null when no supported drop source is present", () => {
    const payload: FileBrowserDragPayload = {
      type: "folder",
      name: "reports",
      fullPath: "/workspace/reports",
    };

    expect(resolveSpreadsheetDropTarget(payload, null)).toBeNull();
  });
});

describe("isSupportedSpreadsheetDropTarget", () => {
  it("accepts workspace paths when the full path has a spreadsheet extension", () => {
    expect(
      isSupportedSpreadsheetDropTarget({
        kind: "workspace",
        name: "Budget",
        path: "/workspace/Budget.xlsx",
      }),
    ).toBe(true);
  });

  it("accepts native spreadsheet files", () => {
    expect(
      isSupportedSpreadsheetDropTarget({
        kind: "native",
        file: new File(["a,b"], "budget.csv", { type: "text/csv" }),
      }),
    ).toBe(true);
  });

  it("rejects non-spreadsheet drops", () => {
    expect(
      isSupportedSpreadsheetDropTarget({
        kind: "workspace",
        name: "notes.md",
        path: "/workspace/notes.md",
      }),
    ).toBe(false);
    expect(
      isSupportedSpreadsheetDropTarget({
        kind: "native",
        file: new File(["# notes"], "notes.md", { type: "text/markdown" }),
      }),
    ).toBe(false);
  });
});
