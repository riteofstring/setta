import { describe, expect, it } from "vitest";

import { joinLauncherPath, normalizeNewProjectName } from "./LauncherHomePage";

describe("LauncherHomePage path helpers", () => {
  it("normalizes a new project name", () => {
    expect(normalizeNewProjectName(" my/new\\project ")).toBe("mynewproject");
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
