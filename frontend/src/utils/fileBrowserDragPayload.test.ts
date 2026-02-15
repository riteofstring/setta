import { describe, expect, it } from "vitest";
import {
  FILE_BROWSER_DRAG_MIME_TYPE,
  getFileBrowserDragPayload,
  setFileBrowserDragPayload,
} from "./fileBrowserDragPayload";

type MockDataTransfer = {
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
};

function createMockDataTransfer(): MockDataTransfer {
  const data = new Map<string, string>();
  return {
    setData(type: string, value: string) {
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
  };
}

describe("fileBrowserDragPayload", () => {
  it("round-trips payload via custom mime type", () => {
    const transfer = createMockDataTransfer();
    setFileBrowserDragPayload(transfer as unknown as DataTransfer, {
      name: "sheet.csv",
      fullPath: "/tmp/sheet.csv",
      type: "file",
    });

    expect(
      getFileBrowserDragPayload(transfer as unknown as DataTransfer),
    ).toEqual({
      name: "sheet.csv",
      fullPath: "/tmp/sheet.csv",
      type: "file",
    });
  });

  it("falls back to prefixed text/plain payload", () => {
    const transfer = createMockDataTransfer();
    const serialized = JSON.stringify({
      name: "tasks.xlsx",
      fullPath: "/tmp/tasks.xlsx",
      type: "file",
    });
    transfer.setData("text/plain", `setta:file-browser-node:${serialized}`);

    expect(
      getFileBrowserDragPayload(transfer as unknown as DataTransfer),
    ).toEqual({
      name: "tasks.xlsx",
      fullPath: "/tmp/tasks.xlsx",
      type: "file",
    });
  });

  it("returns null for invalid payloads", () => {
    const transfer = createMockDataTransfer();
    transfer.setData(FILE_BROWSER_DRAG_MIME_TYPE, '{"name":1}');

    expect(
      getFileBrowserDragPayload(transfer as unknown as DataTransfer),
    ).toBeNull();
    expect(getFileBrowserDragPayload(null)).toBeNull();
  });
});
