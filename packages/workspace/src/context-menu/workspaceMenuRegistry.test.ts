import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { getWorkspaceCreationCommands } from "./creationCommandStore";
import { registerWorkspaceCreationCommands } from "./workspaceMenuRegistry";

describe("workspace creation command registry", () => {
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
  });

  afterEach(() => host.dispose());

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

    registerWorkspaceCreationCommands(host, commands);
    commands.length = 0;

    expect(getWorkspaceCreationCommands(host)).toEqual([
      expect.objectContaining({
        id: "host-note",
        label: "Host note",
        group: "Host",
      }),
    ]);
    expect(Object.isFrozen(getWorkspaceCreationCommands(host)[0])).toBe(true);

    registerWorkspaceCreationCommands(host, []);
    expect(getWorkspaceCreationCommands(host)).toEqual([]);
  });

  it("rejects malformed and duplicate creation definitions specifically", () => {
    expect(() =>
      registerWorkspaceCreationCommands(host, [
        { id: "bad id", label: "Bad", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/invalid id/);
    expect(() =>
      registerWorkspaceCreationCommands(host, [
        { id: "same", label: "One", group: "Host", createSection: vi.fn() },
        { id: "same", label: "Two", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/duplicate id same/);
    expect(() =>
      registerWorkspaceCreationCommands(host, [
        {
          id: "empty-label",
          label: "  ",
          group: "Host",
          createSection: vi.fn(),
        },
      ]),
    ).toThrow(/non-empty label/);
  });

  // A chord makes the command a key binding, so an unusable one is rejected where it is written
  // rather than at the keypress that would never match it.
  it("rejects an unusable creation chord", () => {
    expect(() =>
      registerWorkspaceCreationCommands(host, [
        {
          id: "blank-chord",
          label: "Blank",
          group: "Host",
          chord: "  ",
          createSection: vi.fn(),
        },
      ]),
    ).toThrow(/chord must be a chord string or null/);
    expect(() =>
      registerWorkspaceCreationCommands(host, [
        {
          id: "odd-chord",
          label: "Odd",
          group: "Host",
          chord: "Mod + Grab",
          createSection: vi.fn(),
        },
      ]),
    ).toThrow(/unknown key grab/);
    expect(getWorkspaceCreationCommands(host)).toEqual([]);
  });
});
