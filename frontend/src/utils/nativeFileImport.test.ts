import type {
  FilebrowserFolderContentItem,
  FilebrowserRootResponse,
  FilebrowserWriteFileContentResponse,
} from "openapi/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importNativeFileToWorkspace } from "./nativeFileImport";
import {
  API_ROUTE_PREFIX,
  BINARY_TRANSPORT_ROUTES,
  FILE_BROWSER_TRANSPORT_ROUTES,
} from "./transportRouteConstants";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resolveFetchURL(input: unknown): string {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function matchesGoHTTPRoute(input: unknown, routePath: string): boolean {
  const url = new URL(resolveFetchURL(input), "http://setta.test");
  return url.pathname === `${API_ROUTE_PREFIX}${routePath}`;
}

async function getRequestJSONBody(
  input: unknown,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  if (input instanceof Request) {
    return JSON.parse(await input.clone().text()) as Record<string, unknown>;
  }
  if (typeof init?.body === "string") {
    return JSON.parse(init.body) as Record<string, unknown>;
  }
  throw new Error("Expected JSON request body.");
}

async function getRequestFormData(
  input: unknown,
  init?: RequestInit,
): Promise<FormData> {
  if (input instanceof Request) {
    return await input.clone().formData();
  }
  if (init?.body instanceof FormData) {
    return init.body;
  }
  throw new Error("Expected FormData request body.");
}

function buildFolderContentsResponse(
  folderPath: string,
  items: FilebrowserFolderContentItem[],
) {
  return {
    folderPath,
    items,
  };
}

function createFolderContentItem(
  options: Partial<FilebrowserFolderContentItem> = {},
): FilebrowserFolderContentItem {
  return {
    fullPath: "",
    name: "",
    type: "file",
    ...options,
  };
}

function createRootResponse(
  options: Partial<FilebrowserRootResponse> = {},
): FilebrowserRootResponse {
  return {
    ignorePatterns: [],
    pathSeparator: "/",
    rootPath: "",
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
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFileBrowserRoot,
        )
      ) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFolderContents,
        )
      ) {
        return jsonResponse(buildFolderContentsResponse("/workspace", []));
      }
      if (matchesGoHTTPRoute(input, BINARY_TRANSPORT_ROUTES.upload)) {
        await getRequestFormData(input, init);
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.writeFileBrowserContent,
        )
      ) {
        writeCallCount += 1;
        writePayload = await getRequestJSONBody(input, init);
        return jsonResponse(
          createWriteFileContentResponse({
            path: "/workspace/drop.csv",
            mimeType: "text/csv",
            mtimeNs: 123,
            size: 11,
          }),
        );
      }
      throw new Error(`Unexpected fetch URL: ${resolveFetchURL(input)}`);
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
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFileBrowserRoot,
        )
      ) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFolderContents,
        )
      ) {
        return jsonResponse(buildFolderContentsResponse("/workspace", []));
      }
      if (matchesGoHTTPRoute(input, BINARY_TRANSPORT_ROUTES.upload)) {
        return jsonResponse({ detail: "Upload denied." }, 400);
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.writeFileBrowserContent,
        )
      ) {
        writeCalled = true;
        return jsonResponse({ detail: "unexpected" }, 500);
      }
      throw new Error(`Unexpected fetch URL: ${resolveFetchURL(input)}`);
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
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFileBrowserRoot,
        )
      ) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFolderContents,
        )
      ) {
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
      if (matchesGoHTTPRoute(input, BINARY_TRANSPORT_ROUTES.upload)) {
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.writeFileBrowserContent,
        )
      ) {
        const payload = await getRequestJSONBody(input, init);
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
      throw new Error(`Unexpected fetch URL: ${resolveFetchURL(input)}`);
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
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFileBrowserRoot,
        )
      ) {
        return jsonResponse(
          createRootResponse({
            rootPath: "/workspace",
            pathSeparator: "/",
            ignorePatterns: [],
          }),
        );
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.getFolderContents,
        )
      ) {
        return jsonResponse(buildFolderContentsResponse("/workspace", []));
      }
      if (matchesGoHTTPRoute(input, BINARY_TRANSPORT_ROUTES.upload)) {
        return jsonResponse({
          contentId: "content-abc",
          byteLength: 11,
          mimeType: "text/csv",
          sha256: null,
        });
      }
      if (
        matchesGoHTTPRoute(
          input,
          FILE_BROWSER_TRANSPORT_ROUTES.writeFileBrowserContent,
        )
      ) {
        const payload = await getRequestJSONBody(input, init);
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
      throw new Error(`Unexpected fetch URL: ${resolveFetchURL(input)}`);
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
