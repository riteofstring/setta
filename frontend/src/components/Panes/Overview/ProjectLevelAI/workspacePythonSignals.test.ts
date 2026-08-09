import { getWorkspacePythonSignal } from "openapi/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

vi.mock("openapi/http", () => ({
  getWorkspacePythonSignal: vi.fn(),
}));

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

  it("reuses cached results until the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      const cache: WorkspacePythonSignalCache = new Map();
      mockedGetWorkspacePythonSignal
        .mockResolvedValueOnce(
          buildWorkspacePythonSignalResponse("/workspace/python-app", false),
        )
        .mockResolvedValueOnce(
          buildWorkspacePythonSignalResponse("/workspace/python-app", true),
        );

      await expect(
        loadWorkspacePythonSignal({
          cache,
          rootPath: "/workspace/python-app",
        }),
      ).resolves.toBe(false);
      expect(mockedGetWorkspacePythonSignal).toHaveBeenCalledTimes(1);
      expect(cache.get("/workspace/python-app")).toEqual({
        hasPython: false,
        cachedAtMs: 1000,
      });

      vi.setSystemTime(9000);
      await expect(
        loadWorkspacePythonSignal({
          cache,
          rootPath: "/workspace/python-app",
        }),
      ).resolves.toBe(false);
      expect(mockedGetWorkspacePythonSignal).toHaveBeenCalledTimes(1);

      vi.setSystemTime(17001);
      await expect(
        loadWorkspacePythonSignal({
          cache,
          rootPath: "/workspace/python-app",
        }),
      ).resolves.toBe(true);
      expect(mockedGetWorkspacePythonSignal).toHaveBeenCalledTimes(2);
      expect(cache.get("/workspace/python-app")).toEqual({
        hasPython: true,
        cachedAtMs: 17001,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null without hitting the Go-owned endpoint for blank roots", async () => {
    const cache: WorkspacePythonSignalCache = new Map();

    await expect(
      loadWorkspacePythonSignal({
        cache,
        rootPath: "   ",
      }),
    ).resolves.toBeNull();
    expect(mockedGetWorkspacePythonSignal).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
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
    expect(cache.get("/workspace/python-app")).toEqual({
      hasPython: true,
      cachedAtMs: expect.any(Number),
    });
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
    expect(cache.get("/workspace/python-app")).toEqual({
      hasPython: false,
      cachedAtMs: expect.any(Number),
    });
  });
});
