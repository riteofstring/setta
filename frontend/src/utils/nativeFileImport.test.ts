import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importNativeFileToWorkspace } from "./nativeFileImport";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("importNativeFileToWorkspace", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads dropped bytes and writes the file by content id", async () => {
    let writePayload: Record<string, unknown> | null = null;
    let writeCallCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/getFileBrowserRoot")) {
        return jsonResponse({
          rootPath: "/workspace",
          pathSeparator: "/",
          ignorePatterns: [],
        });
      }
      if (url.endsWith("/api/getFolderContents")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/binary/upload")) {
        if (!(init?.body instanceof FormData)) {
          throw new Error("Expected FormData upload body.");
        }
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (url.endsWith("/api/writeFileBrowserFileContent")) {
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON write payload.");
        }
        writeCallCount += 1;
        writePayload = JSON.parse(init.body);
        return jsonResponse({
          path: "/workspace/drop.csv",
          mimeType: "text/csv",
          mtimeNs: 123,
          size: 11,
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const file = new File(["a,b\n1,2\n"], "drop.csv", { type: "text/csv" });
    const result = await importNativeFileToWorkspace(file);

    expect(result).toEqual({
      status: "ok",
      filePath: "/workspace/drop.csv",
      fileName: "drop.csv",
    });
    expect(writePayload).toEqual({
      path: "/workspace/drop.csv",
      contentId: "content-abc",
      expectedMtimeNs: null,
    });
    expect(writeCallCount).toBe(1);
  });

  it("returns upload errors without writing file content", async () => {
    let writeCalled = false;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/getFileBrowserRoot")) {
        return jsonResponse({
          rootPath: "/workspace",
          pathSeparator: "/",
          ignorePatterns: [],
        });
      }
      if (url.endsWith("/api/getFolderContents")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/binary/upload")) {
        return jsonResponse({ detail: "Upload denied." }, 400);
      }
      if (url.endsWith("/api/writeFileBrowserFileContent")) {
        writeCalled = true;
        return jsonResponse({ detail: "unexpected" }, 500);
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const file = new File(["abc"], "drop.csv", { type: "text/csv" });
    const result = await importNativeFileToWorkspace(file);

    expect(result).toEqual({
      status: "failed",
      error: "Upload denied.",
    });
    expect(writeCalled).toBe(false);
  });

  it("resolves write conflicts with a suffixed file name", async () => {
    const writePayloads: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/getFileBrowserRoot")) {
        return jsonResponse({
          rootPath: "/workspace",
          pathSeparator: "/",
          ignorePatterns: [],
        });
      }
      if (url.endsWith("/api/getFolderContents")) {
        return jsonResponse([
          {
            name: "drop.csv",
            fullPath: "/workspace/drop.csv",
            type: "file",
          },
        ]);
      }
      if (url.endsWith("/api/binary/upload")) {
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (url.endsWith("/api/writeFileBrowserFileContent")) {
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON write payload.");
        }
        const payload = JSON.parse(init.body) as Record<string, unknown>;
        writePayloads.push(payload);
        if (writePayloads.length === 1) {
          return jsonResponse({ detail: "File already exists." }, 409);
        }
        return jsonResponse({
          path: "/workspace/drop-2.csv",
          mimeType: "text/csv",
          mtimeNs: 123,
          size: 11,
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const file = new File(["a,b\n1,2\n"], "drop.csv", { type: "text/csv" });
    const result = await importNativeFileToWorkspace(file);

    expect(result).toEqual({
      status: "ok",
      filePath: "/workspace/drop-2.csv",
      fileName: "drop-2.csv",
    });
    expect(writePayloads).toEqual([
      {
        path: "/workspace/drop-1.csv",
        contentId: "content-abc",
        expectedMtimeNs: null,
      },
      {
        path: "/workspace/drop-2.csv",
        contentId: "content-abc",
        expectedMtimeNs: null,
      },
    ]);
  });

  it("keeps retrying write conflicts beyond three attempts", async () => {
    const writePayloads: Array<Record<string, unknown>> = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/getFileBrowserRoot")) {
        return jsonResponse({
          rootPath: "/workspace",
          pathSeparator: "/",
          ignorePatterns: [],
        });
      }
      if (url.endsWith("/api/getFolderContents")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/api/binary/upload")) {
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (url.endsWith("/api/writeFileBrowserFileContent")) {
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON write payload.");
        }
        const payload = JSON.parse(init.body) as Record<string, unknown>;
        writePayloads.push(payload);
        if (writePayloads.length <= 5) {
          return jsonResponse({ detail: "File already exists." }, 409);
        }
        return jsonResponse({
          path: "/workspace/drop-5.csv",
          mimeType: "text/csv",
          mtimeNs: 123,
          size: 11,
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const file = new File(["a,b\n1,2\n"], "drop.csv", { type: "text/csv" });
    const result = await importNativeFileToWorkspace(file);

    expect(result).toEqual({
      status: "ok",
      filePath: "/workspace/drop-5.csv",
      fileName: "drop-5.csv",
    });
    expect(writePayloads.length).toBe(6);
    expect(writePayloads[0]?.path).toBe("/workspace/drop.csv");
    expect(writePayloads[5]?.path).toBe("/workspace/drop-5.csv");
  });
});
