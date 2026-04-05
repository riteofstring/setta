import { GoHTTPRoutes, GoRoutePrefixes } from "utils/generatedRoutes";
import {
  createFolderContentItem,
  createRootResponse,
  createWriteFileContentResponse,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importNativeFileToWorkspace } from "./nativeFileImport";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function matchesGoHTTPRoute(input: unknown, routePath: string): boolean {
  const url = new URL(String(input), "http://setta.test");
  return url.pathname === `${GoRoutePrefixes.api}${routePath}`;
}

function buildFolderContentsResponse(
  folderPath: string,
  items: ReturnType<typeof createFolderContentItem>[],
) {
  return {
    folderPath,
    items,
  };
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
      const url = input;
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFileBrowserRoot)) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFolderContents)) {
        return jsonResponse(buildFolderContentsResponse("/workspace", []));
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.binaryUpload)) {
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
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.writeFileBrowserFileContent)) {
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON write payload.");
        }
        writeCallCount += 1;
        writePayload = JSON.parse(init.body);
        return jsonResponse(
          createWriteFileContentResponse({
            path: "/workspace/drop.csv",
            mimeType: "text/csv",
            mtimeNs: 123,
            size: 11,
          }),
        );
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
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
      const url = input;
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFileBrowserRoot)) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFolderContents)) {
        return jsonResponse(buildFolderContentsResponse("/workspace", []));
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.binaryUpload)) {
        return jsonResponse({ detail: "Upload denied." }, 400);
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.writeFileBrowserFileContent)) {
        writeCalled = true;
        return jsonResponse({ detail: "unexpected" }, 500);
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
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
      const url = input;
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFileBrowserRoot)) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFolderContents)) {
        return jsonResponse(
          buildFolderContentsResponse("/workspace", [
            createFolderContentItem({
              name: "drop.csv",
              fullPath: "/workspace/drop.csv",
              type: "file",
            }),
          ]),
        );
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.binaryUpload)) {
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.writeFileBrowserFileContent)) {
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON write payload.");
        }
        const payload = JSON.parse(init.body) as Record<string, unknown>;
        writePayloads.push(payload);
        if (writePayloads.length === 1) {
          return jsonResponse({ detail: "File already exists." }, 409);
        }
        return jsonResponse(
          createWriteFileContentResponse({
            path: "/workspace/drop-2.csv",
            mimeType: "text/csv",
            mtimeNs: 123,
            size: 11,
          }),
        );
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
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
      const url = input;
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFileBrowserRoot)) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.getFolderContents)) {
        return jsonResponse(buildFolderContentsResponse("/workspace", []));
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.binaryUpload)) {
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (matchesGoHTTPRoute(url, GoHTTPRoutes.writeFileBrowserFileContent)) {
        if (typeof init?.body !== "string") {
          throw new Error("Expected JSON write payload.");
        }
        const payload = JSON.parse(init.body) as Record<string, unknown>;
        writePayloads.push(payload);
        if (writePayloads.length <= 5) {
          return jsonResponse({ detail: "File already exists." }, 409);
        }
        return jsonResponse(
          createWriteFileContentResponse({
            path: "/workspace/drop-5.csv",
            mimeType: "text/csv",
            mtimeNs: 123,
            size: 11,
          }),
        );
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
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
