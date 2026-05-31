import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { listInstalledEditorApps, openWorkspaceInEditor } from "./editor-apps";

describe("editor apps", () => {
  test("lists installed editors in shell menu order", async () => {
    const homeDir = "/Users/setta";
    const existingPaths = new Set([
      join(homeDir, "Applications", "Cursor.app"),
      "/System/Library/CoreServices/Finder.app",
    ]);

    const editors = await listInstalledEditorApps(async (appPath) => `icon:${appPath}`, {
      homeDir,
      pathExists: async (appPath) => existingPaths.has(appPath),
    });

    expect(editors).toEqual([
      {
        displayName: "Cursor",
        iconDataUrl: `icon:${join(homeDir, "Applications", "Cursor.app")}`,
        id: "cursor",
      },
      {
        displayName: "Finder",
        iconDataUrl: "icon:/System/Library/CoreServices/Finder.app",
        id: "finder",
      },
    ]);
  });

  test("opens a workspace with the selected editor app", async () => {
    const homeDir = "/Users/setta";
    const cursorPath = join(homeDir, "Applications", "Cursor.app");
    const runOpenApp = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await openWorkspaceInEditor("cursor", "/tmp/project", {
      homeDir,
      openPath: async () => "",
      pathExists: async (appPath) => appPath === cursorPath,
      runOpenApp,
    });

    expect(runOpenApp).toHaveBeenCalledWith(cursorPath, "/tmp/project");
  });

  test("opens Finder with the workspace path", async () => {
    const openPath = vi.fn<() => Promise<string>>().mockResolvedValue("");

    await openWorkspaceInEditor("finder", "/tmp/project", {
      openPath,
      pathExists: async (appPath) => appPath === "/System/Library/CoreServices/Finder.app",
    });

    expect(openPath).toHaveBeenCalledWith("/tmp/project");
  });

  test("fails clearly when the selected editor is unavailable", async () => {
    await expect(
      openWorkspaceInEditor("zed", "/tmp/project", {
        openPath: async () => "",
        pathExists: async () => false,
      }),
    ).rejects.toThrow("Zed is not installed");
  });
});
