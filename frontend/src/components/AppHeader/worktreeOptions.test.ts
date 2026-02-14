import { describe, expect, it } from "vitest";
import {
  buildWorktreeLaunchRequest,
  getActiveWorktreeOptionId,
  normalizeWorktreeOptions,
} from "./worktreeOptions";

describe("worktreeOptions", () => {
  it("normalizes, filters, and sorts backend worktree option payloads", () => {
    const normalized = normalizeWorktreeOptions([
      { name: "beta", path: "/tmp/setta.beta", isActive: false },
      { name: "alpha", path: "/tmp/setta.alpha", isActive: true },
      { name: "invalid-no-path" },
    ]);
    expect(normalized).toEqual([
      {
        id: "/tmp/setta.alpha",
        name: "alpha",
        path: "/tmp/setta.alpha",
        isActive: true,
      },
      {
        id: "/tmp/setta.beta",
        name: "beta",
        path: "/tmp/setta.beta",
        isActive: false,
      },
    ]);
  });

  it("chooses the active option id and falls back to first option", () => {
    expect(
      getActiveWorktreeOptionId([
        { id: "a", name: "a", path: "/a", isActive: false },
        { id: "b", name: "b", path: "/b", isActive: true },
      ]),
    ).toBe("b");
    expect(
      getActiveWorktreeOptionId([
        { id: "a", name: "a", path: "/a", isActive: false },
      ]),
    ).toBe("a");
    expect(getActiveWorktreeOptionId([])).toBeNull();
  });

  it("builds a launch request for workspace switching", () => {
    expect(buildWorktreeLaunchRequest("/tmp/setta.demo")).toEqual({
      workspaceRoot: "/tmp/setta.demo",
      settaFilesLocation: null,
      sshTarget: null,
      sshArgs: null,
      remoteCmd: null,
      localPort: null,
    });
  });
});
