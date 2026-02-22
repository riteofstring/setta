import { describe, expect, it } from "vitest";

import {
  isReservedProjectName,
  joinLauncherPath,
  normalizeNewProjectName,
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
