/* @vitest-environment jsdom */

import {
  downloadBinary,
  getFileBrowserFileContent,
  getFileBrowserFileStat,
  writeFileBrowserFileContent,
  type FilebrowserFileContentResponse,
  type FilebrowserFileStatResponse,
  type FilebrowserWriteFileContentResponse,
} from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileBrowserSpreadsheetEditor } from "./FileBrowserSpreadsheetEditor";
import {
  getSpreadsheetDensityMetrics,
  getSpreadsheetGlideDensityMultiplier,
  getSpreadsheetGlideTheme,
  getSpreadsheetGridTemplateColumns,
  getSpreadsheetGridWidth,
  SPREADSHEET_FILTER_INPUT_CLASS_NAME,
  SpreadsheetRow,
} from "./fileBrowserSpreadsheetGrid";
import {
  applySpreadsheetCellUpdates,
  canSaveSpreadsheetDraft,
  getFilteredSortedSpreadsheetRowIndexes,
  isSpreadsheetLoadRequestStale,
  shouldAnnounceSpreadsheetAutoReload,
  shouldClearSpreadsheetDirtyAfterSave,
  shouldIgnoreSpreadsheetSaveResult,
} from "./fileBrowserSpreadsheetState";

const openAPI = vi.hoisted(() => ({
  getFileBrowserFileContent: vi.fn(),
  getFileBrowserFileStat: vi.fn(),
  writeFileBrowserFileContent: vi.fn(),
}));

const { downloadBinaryMock } = vi.hoisted(() => ({
  downloadBinaryMock: vi.fn(),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    downloadBinary: downloadBinaryMock,
    getFileBrowserFileContent: openAPI.getFileBrowserFileContent,
    getFileBrowserFileStat: openAPI.getFileBrowserFileStat,
    writeFileBrowserFileContent: openAPI.writeFileBrowserFileContent,
  };
});

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: function <T>(promise: Promise<T>) {
      return promise;
    },
  };
});

type RenderedFileBrowserSpreadsheetEditor = {
  host: HTMLDivElement;
  root: Root;
};

async function renderFileBrowserSpreadsheetEditor() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <FileBrowserSpreadsheetEditor
        selectedFile={{
          name: "report.csv",
          fullPath: "/workspace/report.csv",
        }}
      />,
    );
  });

  return { host, root } satisfies RenderedFileBrowserSpreadsheetEditor;
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await vi.dynamicImportSettled();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
  }
}

async function waitForSpreadsheetCellValue(args: {
  host: HTMLDivElement;
  cellId: string;
  expectedValue: string;
}): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await flushEffects();
    const input = args.host.querySelector(
      `input[data-spreadsheet-cell="${args.cellId}"]`,
    ) as HTMLInputElement | null;
    if (input?.value === args.expectedValue) {
      return;
    }
  }
  throw new Error(
    `Timed out waiting for spreadsheet cell ${args.cellId} to equal ${args.expectedValue}.`,
  );
}

describe("FileBrowserSpreadsheetEditor layout", () => {
  beforeEach(() => {
    downloadBinaryMock.mockReset();
    openAPI.getFileBrowserFileContent.mockReset();
    openAPI.getFileBrowserFileStat.mockReset();
    openAPI.writeFileBrowserFileContent.mockReset();
    document.body.innerHTML = "";
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof ResizeObserver;
  });

  function createFileContentResponse(
    options: Partial<FilebrowserFileContentResponse> = {},
  ): FilebrowserFileContentResponse {
    return {
      contentId: "",
      mimeType: "",
      mtimeNs: 0,
      path: "",
      size: 0,
      ...options,
    };
  }

  function createFileStatResponse(
    options: Partial<FilebrowserFileStatResponse> = {},
  ): FilebrowserFileStatResponse {
    return {
      mtimeNs: 0,
      path: "",
      size: 0,
      ...options,
    };
  }

  function createWriteFileContentResponse(
    options: Partial<FilebrowserWriteFileContentResponse> = {},
  ): FilebrowserWriteFileContentResponse {
    return {
      mimeType: "",
      mtimeNs: 0,
      path: "",
      size: 0,
      ...options,
    };
  }

  it("uses compact spreadsheet sizing defaults", () => {
    const compact = getSpreadsheetDensityMetrics("compact");
    expect(compact.headerHeight).toBeLessThanOrEqual(24);
    expect(compact.rowHeight).toBeLessThanOrEqual(24);
    expect(compact.indexColumnWidth).toBeLessThanOrEqual(40);
    expect(compact.dataColumnWidth).toBeLessThanOrEqual(92);
    expect(getSpreadsheetGridWidth(2)).toBe(
      compact.indexColumnWidth + compact.dataColumnWidth * 2,
    );
    expect(getSpreadsheetGridTemplateColumns(3)).toContain("repeat(3");
  });

  it("supports row-number-less grid sizing and comfortable density", () => {
    const comfortable = getSpreadsheetDensityMetrics("comfortable");
    expect(comfortable.rowHeight).toBeGreaterThan(
      getSpreadsheetDensityMetrics("compact").rowHeight,
    );
    expect(getSpreadsheetGridWidth(2, false, "compact")).toBe(
      getSpreadsheetDensityMetrics("compact").dataColumnWidth * 2,
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
          height: getSpreadsheetDensityMetrics("compact").rowHeight,
        }}
        sourceRows={[["task", "status"]]}
        displayedRowIndexes={[0]}
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

  it("returns the same rows reference when edits do not change cell values", () => {
    const rows = [["a0", "a1"]];
    const next = applySpreadsheetCellUpdates({
      rows,
      columnCount: 2,
      edits: [{ rowIndex: 0, columnIndex: 1, value: "a1" }],
    });

    expect(next).toBe(rows);
  });

  it("identifies stale spreadsheet load completions", () => {
    expect(
      isSpreadsheetLoadRequestStale({
        activeRequestId: 2,
        requestId: 1,
        currentSelectedPath: "/tmp/a.csv",
        requestedPath: "/tmp/a.csv",
      }),
    ).toBe(true);
    expect(
      isSpreadsheetLoadRequestStale({
        activeRequestId: 1,
        requestId: 1,
        currentSelectedPath: "/tmp/b.csv",
        requestedPath: "/tmp/a.csv",
      }),
    ).toBe(true);
    expect(
      isSpreadsheetLoadRequestStale({
        activeRequestId: 1,
        requestId: 1,
        currentSelectedPath: "/tmp/a.csv",
        requestedPath: "/tmp/a.csv",
      }),
    ).toBe(false);
  });

  it("announces auto-reload status only for successful non-cancelled reloads", () => {
    expect(
      shouldAnnounceSpreadsheetAutoReload({
        reloadSucceeded: true,
        isCancelled: false,
      }),
    ).toBe(true);
    expect(
      shouldAnnounceSpreadsheetAutoReload({
        reloadSucceeded: false,
        isCancelled: false,
      }),
    ).toBe(false);
    expect(
      shouldAnnounceSpreadsheetAutoReload({
        reloadSucceeded: true,
        isCancelled: true,
      }),
    ).toBe(false);
  });

  it("allows save only when the loaded sheet path matches selection", () => {
    expect(
      canSaveSpreadsheetDraft({
        sheetPath: "/tmp/a.csv",
        selectedPath: "/tmp/a.csv",
      }),
    ).toBe(true);
    expect(
      canSaveSpreadsheetDraft({
        sheetPath: "/tmp/a.csv",
        selectedPath: "/tmp/b.csv",
      }),
    ).toBe(false);
    expect(
      canSaveSpreadsheetDraft({
        sheetPath: "/tmp/a.csv",
        selectedPath: null,
      }),
    ).toBe(false);
  });

  it("treats save results for another selected file as stale", () => {
    expect(
      shouldIgnoreSpreadsheetSaveResult({
        savingPath: "/tmp/a.csv",
        currentSelectedPath: "/tmp/a.csv",
      }),
    ).toBe(false);
    expect(
      shouldIgnoreSpreadsheetSaveResult({
        savingPath: "/tmp/a.csv",
        currentSelectedPath: "/tmp/b.csv",
      }),
    ).toBe(true);
    expect(
      shouldIgnoreSpreadsheetSaveResult({
        savingPath: "/tmp/a.csv",
        currentSelectedPath: null,
      }),
    ).toBe(true);
  });

  it("clears dirty state only when no edits occurred during save", () => {
    expect(
      shouldClearSpreadsheetDirtyAfterSave({
        saveStartEditVersion: 8,
        currentEditVersion: 8,
      }),
    ).toBe(true);
    expect(
      shouldClearSpreadsheetDirtyAfterSave({
        saveStartEditVersion: 8,
        currentEditVersion: 9,
      }),
    ).toBe(false);
  });

  it("filters and numerically sorts displayed row indexes", () => {
    const indexes = getFilteredSortedSpreadsheetRowIndexes({
      baseIndexes: [0, 1, 2],
      rows: [
        ["alpha", "2"],
        ["beta", "10"],
        ["alpha", "1"],
      ],
      columnCount: 2,
      normalizedFilter: "alpha",
      sortState: {
        columnIndex: 1,
        direction: "asc",
      },
    });

    expect(indexes).toEqual([2, 0]);
  });

  it("loads spreadsheet cells through the Go file-content and binary routes", async () => {
    vi.mocked(getFileBrowserFileContent).mockResolvedValue({
      data: createFileContentResponse({
        path: "/workspace/report.csv",
        contentId: "content-1",
        mimeType: "text/csv",
        mtimeNs: 123,
        size: 23,
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(downloadBinary).mockResolvedValue({
      data: new Blob(["name,status\nalpha,ready\n"], {
        type: "text/csv",
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(getFileBrowserFileStat).mockResolvedValue({
      data: createFileStatResponse({
        path: "/workspace/report.csv",
        mtimeNs: 123,
        size: 23,
      }),
      status: 200,
      hasResponse: true,
    });
    vi.mocked(writeFileBrowserFileContent).mockResolvedValue({
      data: createWriteFileContentResponse({
        path: "/workspace/report.csv",
        mimeType: "text/csv",
        mtimeNs: 124,
        size: 23,
      }),
      status: 200,
      hasResponse: true,
    });

    const { host, root } = await renderFileBrowserSpreadsheetEditor();

    try {
      await waitForSpreadsheetCellValue({
        host,
        cellId: "1:0",
        expectedValue: "alpha",
      });

      expect(getFileBrowserFileContent).toHaveBeenCalledWith({
        body: {
          path: "/workspace/report.csv",
          maxBytes: 8 * 1024 * 1024,
        },
      });
      expect(downloadBinary).toHaveBeenCalledWith({
        path: { contentId: "content-1" },
      });
      expect(host.textContent).toContain("report.csv");
      expect(
        (
          host.querySelector(
            'input[data-spreadsheet-cell="1:0"]',
          ) as HTMLInputElement | null
        )?.value,
      ).toBe("alpha");
      expect(
        (
          host.querySelector(
            'input[data-spreadsheet-cell="1:1"]',
          ) as HTMLInputElement | null
        )?.value,
      ).toBe("ready");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
