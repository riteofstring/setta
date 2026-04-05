import { getWorkspacePythonSignal } from "openapi/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedWorkspacePythonSignal,
  loadWorkspacePythonSignal,
  setCachedWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

vi.mock("openapi/http", () => ({
  getWorkspacePythonSignal: vi.fn(),
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: function <T>(promise: Promise<T>) {
    return promise;
  },
}));

const mockedGetWorkspacePythonSignal = vi.mocked(getWorkspacePythonSignal);

function buildWorkspacePythonSignalResponse(
  folderPath: string,
  hasPython: boolean,
) {
  return {
    data: {
      folderPath,
      hasPython,
    },
    status: 200,
    hasResponse: true,
  };
}

describe("workspacePythonSignals", () => {
  beforeEach(() => {
    mockedGetWorkspacePythonSignal.mockReset();
  });

  it("reads and writes cache entries per workspace root path", () => {
    const cache: WorkspacePythonSignalCache = new Map();
    setCachedWorkspacePythonSignal(cache, "/workspace/python-app", true, 1000);
    setCachedWorkspacePythonSignal(
      cache,
      "/workspace/frontend-app",
      false,
      1001,
    );

    expect(
      getCachedWorkspacePythonSignal(
        cache,
        "/workspace/python-app",
        2000,
        5000,
      ),
    ).toBe(true);
    expect(
      getCachedWorkspacePythonSignal(
        cache,
        "/workspace/frontend-app",
        2000,
        5000,
      ),
    ).toBe(false);
    expect(
      getCachedWorkspacePythonSignal(cache, "/workspace/unknown"),
    ).toBeNull();
    expect(
      getCachedWorkspacePythonSignal(
        cache,
        "/workspace/python-app",
        7001,
        5000,
      ),
    ).toBeNull();
    expect(cache.has("/workspace/python-app")).toBe(false);
  });

  it("evicts oldest entries when cache grows beyond the cap", () => {
    const cache: WorkspacePythonSignalCache = new Map();
    setCachedWorkspacePythonSignal(cache, "/workspace/a", true, 1000, 2);
    setCachedWorkspacePythonSignal(cache, "/workspace/b", false, 1001, 2);
    setCachedWorkspacePythonSignal(cache, "/workspace/c", true, 1002, 2);

    expect(Array.from(cache.keys())).toEqual(["/workspace/b", "/workspace/c"]);
  });

  it("keeps default cache hits across short revalidation windows", () => {
    const cache: WorkspacePythonSignalCache = new Map();
    setCachedWorkspacePythonSignal(cache, "/workspace/a", true, 1000);

    expect(getCachedWorkspacePythonSignal(cache, "/workspace/a", 9000)).toBe(
      true,
    );
    expect(getCachedWorkspacePythonSignal(cache, "/workspace/a", 17001)).toBe(
      null,
    );
  });

  it("dedupes in-flight root scans for the same workspace path", async () => {
    const cache: WorkspacePythonSignalCache = new Map();
    let resolveRequest:
      | ((value: {
          data: {
            folderPath: string;
            hasPython: boolean;
          };
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;

    mockedGetWorkspacePythonSignal.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const firstLoad = loadWorkspacePythonSignal({
      cache,
      rootPath: "/workspace/python-app",
      revalidate: true,
    });
    const secondLoad = loadWorkspacePythonSignal({
      cache,
      rootPath: "/workspace/python-app",
      revalidate: true,
    });

    expect(mockedGetWorkspacePythonSignal).toHaveBeenCalledTimes(1);
    expect(mockedGetWorkspacePythonSignal).toHaveBeenCalledWith({
      body: {
        folderPath: "/workspace/python-app",
      },
    });

    if (!resolveRequest) {
      throw new Error("Expected root scan request to remain in flight.");
    }
    resolveRequest({
      ...buildWorkspacePythonSignalResponse("/workspace/python-app", true),
    });

    await expect(firstLoad).resolves.toBe(true);
    await expect(secondLoad).resolves.toBe(true);
    expect(getCachedWorkspacePythonSignal(cache, "/workspace/python-app")).toBe(
      true,
    );
  });

  it("returns null when the Go-owned workspace python signal endpoint fails", async () => {
    const cache: WorkspacePythonSignalCache = new Map();
    mockedGetWorkspacePythonSignal.mockResolvedValue({
      data: undefined,
      status: 500,
      hasResponse: true,
    });

    await expect(
      loadWorkspacePythonSignal({
        cache,
        rootPath: "/workspace/python-app",
        revalidate: true,
      }),
    ).resolves.toBeNull();
    expect(cache.size).toBe(0);
  });

  it("uses the Go-owned endpoint response to populate the cache", async () => {
    const cache: WorkspacePythonSignalCache = new Map();
    mockedGetWorkspacePythonSignal.mockResolvedValue(
      buildWorkspacePythonSignalResponse("/workspace/python-app", false),
    );

    await expect(
      loadWorkspacePythonSignal({
        cache,
        rootPath: "/workspace/python-app",
      }),
    ).resolves.toBe(false);
    expect(getCachedWorkspacePythonSignal(cache, "/workspace/python-app")).toBe(
      false,
    );
  });
});
