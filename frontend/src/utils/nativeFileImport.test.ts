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
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/getFileBrowserRoot")) {
        return jsonResponse({
          rootPath: "/workspace",
          pathSeparator: "/",
          ignorePatterns: [],
        });
      }
      if (url.endsWith("/api/checkIfFileExists")) {
        return jsonResponse(false);
      }
      if (url.endsWith("/api/createFile")) {
        return jsonResponse(null);
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
  });

  it("returns upload errors without writing file content", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/getFileBrowserRoot")) {
        return jsonResponse({
          rootPath: "/workspace",
          pathSeparator: "/",
          ignorePatterns: [],
        });
      }
      if (url.endsWith("/api/checkIfFileExists")) {
        return jsonResponse(false);
      }
      if (url.endsWith("/api/createFile")) {
        return jsonResponse(null);
      }
      if (url.endsWith("/api/binary/upload")) {
        return jsonResponse({ detail: "Upload denied." }, 400);
      }
      if (url.endsWith("/api/writeFileBrowserFileContent")) {
        throw new Error(
          "Write endpoint should not be called after upload failure.",
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const file = new File(["abc"], "drop.csv", { type: "text/csv" });
    const result = await importNativeFileToWorkspace(file);

    expect(result).toEqual({
      status: "failed",
      error: "Upload denied.",
    });
  });
});
