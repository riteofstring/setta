import { route_get_folder_contents } from "utils/generatedEndpoints";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedWorkspacePythonSignal,
  hasPythonSignalsInRoot,
  loadWorkspacePythonSignal,
  setCachedWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_folder_contents: vi.fn(),
}));

const mockedGetFolderContents = vi.mocked(route_get_folder_contents);

describe("workspacePythonSignals", () => {
  beforeEach(() => {
    mockedGetFolderContents.mockReset();
  });

  it("detects python marker files and python sources at workspace root", () => {
    expect(
      hasPythonSignalsInRoot([
        { type: "file", name: "README.md" },
        { type: "file", name: "requirements.txt" },
      ]),
    ).toBe(true);
    expect(
      hasPythonSignalsInRoot([
        { type: "file", name: "scripts/build.py" },
        { type: "directory", name: "src" },
      ]),
    ).toBe(true);
    expect(
      hasPythonSignalsInRoot([
        { type: "file", name: "Pipfile" },
        { type: "file", name: "README.md" },
      ]),
    ).toBe(true);
    expect(
      hasPythonSignalsInRoot([
        { type: "directory", name: "backend" },
        { type: "file", name: "package.json" },
      ]),
    ).toBe(false);
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
    let resolveRequest: ((value: {
      data: Array<{ name: string; type: string; fullPath: string }>;
      status: number;
      hasResponse: boolean;
    }) => void) | null = null;

    mockedGetFolderContents.mockImplementation(
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

    expect(mockedGetFolderContents).toHaveBeenCalledTimes(1);
    expect(mockedGetFolderContents).toHaveBeenCalledWith({
      folderPath: "/workspace/python-app",
      includeMtime: false,
      includeSize: false,
      maxEntries: 5000,
    });

    if (!resolveRequest) {
      throw new Error("Expected root scan request to remain in flight.");
    }
    resolveRequest({
      data: [
        {
          name: "pyproject.toml",
          type: "file",
          fullPath: "/workspace/python-app/pyproject.toml",
        },
      ],
      status: 200,
      hasResponse: true,
    });

    await expect(firstLoad).resolves.toBe(true);
    await expect(secondLoad).resolves.toBe(true);
    expect(getCachedWorkspacePythonSignal(cache, "/workspace/python-app")).toBe(
      true,
    );
  });
});
