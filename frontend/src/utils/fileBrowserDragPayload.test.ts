import { describe, expect, it } from "vitest";
import {
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
  it("writes both custom and text/plain drag payloads", () => {
    const transfer = createMockDataTransfer();
    const payload = {
      name: "sheet.csv",
      fullPath: "/tmp/sheet.csv",
      type: "file",
    } as const;

    setFileBrowserDragPayload(transfer as unknown as DataTransfer, {
      ...payload,
    });

    expect(
      getFileBrowserDragPayload(transfer as unknown as DataTransfer),
    ).toEqual(payload);
    expect(transfer.getData("text/plain")).toBe(
      `setta:file-browser-node:${JSON.stringify(payload)}`,
    );
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
    transfer.setData("text/plain", 'setta:file-browser-node:{"name":1}');

    expect(
      getFileBrowserDragPayload(transfer as unknown as DataTransfer),
    ).toBeNull();
    expect(getFileBrowserDragPayload(null)).toBeNull();
  });
});
