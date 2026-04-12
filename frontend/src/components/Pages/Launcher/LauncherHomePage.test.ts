import { describe, expect, it } from "vitest";

import {
  applyDirectoryListingPage,
  isReservedProjectName,
  joinLauncherPath,
  normalizeNewProjectName,
  resolveDirectoryListingLoadResult,
} from "./LauncherHomePage";

describe("LauncherHomePage path helpers", () => {
  it("normalizes a new project name", () => {
    expect(normalizeNewProjectName(" my/new\\project ")).toBe("mynewproject");
  });

  it("rejects dot-segment project names", () => {
    expect(isReservedProjectName(".")).toBe(true);
    expect(isReservedProjectName("..")).toBe(true);
    expect(isReservedProjectName("my-app")).toBe(false);
  });

  it("joins POSIX parent paths", () => {
    expect(joinLauncherPath("/Users/me/workspaces", "demo")).toBe(
      "/Users/me/workspaces/demo",
    );
    expect(joinLauncherPath("/Users/me/workspaces/", "demo")).toBe(
      "/Users/me/workspaces/demo",
    );
  });

  it("joins Windows parent paths", () => {
    expect(joinLauncherPath("C:\\Users\\me\\workspaces", "demo")).toBe(
      "C:\\Users\\me\\workspaces\\demo",
    );
    expect(joinLauncherPath("C:\\Users\\me\\workspaces\\", "demo")).toBe(
      "C:\\Users\\me\\workspaces\\demo",
    );
  });
});

describe("applyDirectoryListingPage", () => {
  it("replaces entries for a fresh directory page", () => {
    const result = applyDirectoryListingPage({
      previousEntries: [
        {
          name: "stale",
          path: "/stale",
          isDirectory: true,
          isSymlink: false,
        },
      ],
      payload: {
        ok: true,
        currentPath: "/tmp",
        parentPath: "/",
        entries: [
          {
            name: "alpha",
            path: "/tmp/alpha",
            isDirectory: true,
            isSymlink: false,
          },
        ],
        hasMore: true,
        nextCursor: "1",
        truncated: false,
        error: null,
      },
      append: false,
    });

    expect(result.entries.map((entry) => entry.name)).toEqual(["alpha"]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("1");
    expect(result.truncated).toBe(false);
    expect(result.error).toBeNull();
  });

  it("appends entries for continuation pages", () => {
    const result = applyDirectoryListingPage({
      previousEntries: [
        {
          name: "alpha",
          path: "/tmp/alpha",
          isDirectory: true,
          isSymlink: false,
        },
      ],
      payload: {
        ok: true,
        currentPath: "/tmp",
        parentPath: "/",
        entries: [
          {
            name: "beta",
            path: "/tmp/beta",
            isDirectory: true,
            isSymlink: false,
          },
        ],
        hasMore: false,
        nextCursor: null,
        truncated: true,
        error: null,
      },
      append: true,
    });

    expect(result.entries.map((entry) => entry.name)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.truncated).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns an explicit error when hasMore is missing nextCursor", () => {
    const result = applyDirectoryListingPage({
      previousEntries: [],
      payload: {
        ok: true,
        currentPath: "/tmp",
        parentPath: "/",
        entries: [],
        hasMore: true,
        nextCursor: null,
        truncated: false,
        error: null,
      },
      append: false,
    });

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.error).toMatch(/continuation cursor/i);
  });
});

describe("resolveDirectoryListingLoadResult", () => {
  it("returns a default error for missing route data", () => {
    const result = resolveDirectoryListingLoadResult({
      data: undefined,
      status: 500,
      hasResponse: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "Failed to load launcher directory listing.",
    });
  });

  it("returns the backend error message for a failed directory payload", () => {
    const result = resolveDirectoryListingLoadResult({
      data: {
        ok: false,
        currentPath: "/tmp",
        parentPath: "/",
        entries: [],
        hasMore: false,
        nextCursor: null,
        truncated: false,
        error: {
          message: "Directory access denied.",
        },
      },
      status: 200,
      hasResponse: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "Directory access denied.",
    });
  });

  it("returns the successful payload for a valid directory response", () => {
    const payload = {
      ok: true,
      currentPath: "/tmp",
      parentPath: "/",
      entries: [
        {
          name: "alpha",
          path: "/tmp/alpha",
          isDirectory: true,
          isSymlink: false,
        },
      ],
      hasMore: false,
      nextCursor: null,
      truncated: false,
      error: null,
    } as const;

    const result = resolveDirectoryListingLoadResult({
      data: payload,
      status: 200,
      hasResponse: true,
    });

    expect(result).toEqual({
      ok: true,
      payload,
    });
  });
});
