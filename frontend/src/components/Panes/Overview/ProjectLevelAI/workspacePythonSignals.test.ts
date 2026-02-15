import { describe, expect, it } from "vitest";
import {
  getCachedWorkspacePythonSignal,
  hasPythonSignalsInRoot,
  setCachedWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

describe("workspacePythonSignals", () => {
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
});
