/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { type FileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import {
  NotificationTypeEnum,
  SpreadsheetGridDensityEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpreadsheetArea } from "./SpreadsheetArea";

const mocks = vi.hoisted(() => ({
  addTemporaryNotification: vi.fn(),
  callOpenAPI: vi.fn(),
  dispatchOptimisticProjectStateUpdate: vi.fn(),
  getFileBrowserDragPayload: vi.fn(),
  importNativeFileToWorkspace: vi.fn(),
  setCurrEffectiveSectionImplValue: vi.fn(),
  setSpreadsheetFilePath: vi.fn((request: unknown) => request),
}));

const mockSectionImpl = vi.hoisted(() => ({
  activeSheet: "Sheet1",
  autoReloadOnExternalChange: false,
  density: "compact",
  filePath: "",
  isFrozen: false,
  readOnly: false,
  showRowNumbers: true,
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: (
    selector: (state: { transform: [number, number, number] }) => unknown,
  ) => selector({ transform: [0, 0, 1] }),
}));

vi.mock("openapi/http", () => ({
  setSpreadsheetFilePath: mocks.setSpreadsheetFilePath,
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: mocks.callOpenAPI,
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: mocks.addTemporaryNotification,
}));

vi.mock("state/actions/sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate:
    mocks.dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType: () => mockSectionImpl,
  getCurrProjectConfigId: () => "project-config-1",
  setCurrEffectiveSectionImplValue: mocks.setCurrEffectiveSectionImplValue,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: object) => unknown) => selector({}),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: true,
  }),
}));

vi.mock("utils/fileBrowserDragPayload", () => ({
  getFileBrowserDragPayload: mocks.getFileBrowserDragPayload,
}));

vi.mock("utils/nativeFileImport", () => ({
  importNativeFileToWorkspace: mocks.importNativeFileToWorkspace,
}));

vi.mock(
  "components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor",
  () => ({
    FileBrowserSpreadsheetEditor: ({
      selectedFile,
    }: {
      selectedFile: { fullPath: string } | null;
    }) => (
      <div data-testid="spreadsheet-editor">
        {selectedFile?.fullPath ?? "no-file"}
      </div>
    ),
  }),
);

describe("SpreadsheetArea", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mocks.addTemporaryNotification.mockReset();
    mocks.callOpenAPI.mockReset();
    mocks.dispatchOptimisticProjectStateUpdate.mockReset();
    mocks.getFileBrowserDragPayload.mockReset();
    mocks.importNativeFileToWorkspace.mockReset();
    mocks.setCurrEffectiveSectionImplValue.mockReset();
    mocks.setSpreadsheetFilePath.mockClear();
    mockSectionImpl.filePath = "";
    mockSectionImpl.activeSheet = "Sheet1";
    mockSectionImpl.readOnly = false;
    mockSectionImpl.showRowNumbers = true;
    mockSectionImpl.density = SpreadsheetGridDensityEnum.compact;
    mockSectionImpl.autoReloadOnExternalChange = false;
    mockSectionImpl.isFrozen = false;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  async function renderArea() {
    await act(async () => {
      root.render(<SpreadsheetArea sectionId="section-1" />);
    });
  }

  function getDropZone(): HTMLDivElement {
    const zone = host.querySelector(".section-main") as HTMLDivElement | null;
    expect(zone).not.toBeNull();
    return zone!;
  }

  function createDropEvent(type: string, file: File | null): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        dropEffect: "",
        files: {
          item: (index: number) => (index === 0 ? file : null),
        },
      },
    });
    return event;
  }

  async function dispatchDropEvent({
    file = null,
    payload = null,
  }: {
    file?: File | null;
    payload?: FileBrowserDragPayload | null;
  } = {}) {
    mocks.getFileBrowserDragPayload.mockReturnValue(payload);
    const zone = getDropZone();
    await act(async () => {
      zone.dispatchEvent(createDropEvent("drop", file));
      await Promise.resolve();
    });
  }

  it("persists workspace spreadsheet drops through the live component path", async () => {
    await renderArea();

    await dispatchDropEvent({
      payload: {
        type: "file",
        name: "budget.xlsx",
        fullPath: "/workspace/budget.xlsx",
      },
    });

    expect(mocks.dispatchOptimisticProjectStateUpdate).toHaveBeenCalledTimes(1);
    const request =
      mocks.dispatchOptimisticProjectStateUpdate.mock.calls[0]?.[0];
    expect(request).toBeDefined();

    const nextState = {};
    request.apply(nextState);
    expect(mocks.setCurrEffectiveSectionImplValue).toHaveBeenCalledWith(
      nextState,
      "section-1",
      {
        filePath: "/workspace/budget.xlsx",
        activeSheet: "Sheet1",
      },
    );

    await request.send("frontend-op-1");
    expect(mocks.setSpreadsheetFilePath).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-config-1",
        sectionId: "section-1",
        filePath: "/workspace/budget.xlsx",
        activeSheet: "Sheet1",
        frontendOpId: "frontend-op-1",
      },
    });
    expect(mocks.callOpenAPI).toHaveBeenCalledTimes(1);
  });

  it("falls back to native spreadsheet files through the live component path", async () => {
    mocks.importNativeFileToWorkspace.mockResolvedValue({
      status: "ok",
      filePath: "/workspace/budget.csv",
    });
    await renderArea();

    const nativeFile = new File(["a,b"], "budget.csv", { type: "text/csv" });
    await dispatchDropEvent({
      file: nativeFile,
      payload: {
        type: "folder",
        name: "reports",
        fullPath: "/workspace/reports",
      },
    });

    expect(mocks.importNativeFileToWorkspace).toHaveBeenCalledWith(nativeFile);
    expect(mocks.dispatchOptimisticProjectStateUpdate).toHaveBeenCalledTimes(1);
    const request =
      mocks.dispatchOptimisticProjectStateUpdate.mock.calls[0]?.[0];
    const nextState = {};
    request.apply(nextState);
    expect(mocks.setCurrEffectiveSectionImplValue).toHaveBeenCalledWith(
      nextState,
      "section-1",
      {
        filePath: "/workspace/budget.csv",
        activeSheet: "Sheet1",
      },
    );
  });

  it("rejects invalid spreadsheet drops through the live component path", async () => {
    await renderArea();

    await dispatchDropEvent({
      payload: {
        type: "file",
        name: "notes.md",
        fullPath: "/workspace/notes.md",
      },
    });

    expect(mocks.dispatchOptimisticProjectStateUpdate).not.toHaveBeenCalled();
    expect(mocks.addTemporaryNotification).toHaveBeenCalledWith(
      "Spreadsheet sections accept only CSV, TSV, XLS, or XLSX files.",
      NotificationTypeEnum.warning,
    );
  });

  it("ignores drops with no supported source", async () => {
    await renderArea();

    await dispatchDropEvent();

    expect(mocks.dispatchOptimisticProjectStateUpdate).not.toHaveBeenCalled();
    expect(mocks.importNativeFileToWorkspace).not.toHaveBeenCalled();
    expect(mocks.addTemporaryNotification).not.toHaveBeenCalled();
  });
});
