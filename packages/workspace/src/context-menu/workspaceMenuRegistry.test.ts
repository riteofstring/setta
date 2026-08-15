import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceCreationCommands,
  registerWorkspaceCreationCommands,
} from "./workspaceMenuRegistry";

afterEach(() => {
  registerWorkspaceCreationCommands([]);
});

describe("workspace creation command registry", () => {
  it("normalizes and replaces creation commands without retaining the caller array", () => {
    const createSection = vi.fn();
    const commands = [
      {
        id: "host-note",
        label: "  Host note  ",
        group: "  Host  ",
        createSection,
      },
    ];

    registerWorkspaceCreationCommands(commands);
    commands.length = 0;

    expect(getWorkspaceCreationCommands()).toEqual([
      expect.objectContaining({ id: "host-note", label: "Host note", group: "Host" }),
    ]);
    expect(Object.isFrozen(getWorkspaceCreationCommands()[0])).toBe(true);

    registerWorkspaceCreationCommands([]);
    expect(getWorkspaceCreationCommands()).toEqual([]);
  });

  it("rejects malformed and duplicate creation definitions specifically", () => {
    expect(() =>
      registerWorkspaceCreationCommands([
        { id: "bad id", label: "Bad", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/invalid id/);
    expect(() =>
      registerWorkspaceCreationCommands([
        { id: "same", label: "One", group: "Host", createSection: vi.fn() },
        { id: "same", label: "Two", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/duplicate id same/);
    expect(() =>
      registerWorkspaceCreationCommands([
        { id: "empty-label", label: "  ", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/non-empty label/);
  });
});
