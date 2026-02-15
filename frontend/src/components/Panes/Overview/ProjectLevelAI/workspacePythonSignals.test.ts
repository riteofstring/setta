import { describe, expect, it } from "vitest";
import {
  getCachedWorkspacePythonSignal,
  hasPythonSignalsInRoot,
  setCachedWorkspacePythonSignal,
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
        { type: "directory", name: "backend" },
        { type: "file", name: "package.json" },
      ]),
    ).toBe(false);
  });

  it("reads and writes cache entries per workspace root path", () => {
    const cache = new Map<string, boolean>();
    setCachedWorkspacePythonSignal(cache, "/workspace/python-app", true);
    setCachedWorkspacePythonSignal(cache, "/workspace/frontend-app", false);

    expect(getCachedWorkspacePythonSignal(cache, "/workspace/python-app")).toBe(
      true,
    );
    expect(
      getCachedWorkspacePythonSignal(cache, "/workspace/frontend-app"),
    ).toBe(false);
    expect(
      getCachedWorkspacePythonSignal(cache, "/workspace/unknown"),
    ).toBeNull();
  });
});
