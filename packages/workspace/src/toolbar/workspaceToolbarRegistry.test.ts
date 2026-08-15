import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceCommands,
  registerWorkspaceCommands,
} from "../commands/workspaceCommandRegistry";
import type { WorkspaceCommandDefinition } from "../commands/workspaceCommandTypes";
import { registerWorkspaceCreationCommands } from "../context-menu/workspaceMenuRegistry";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { getWorkspaceToolbarContributions } from "./workspaceToolbarContributions";
import { registerWorkspaceToolbarContributions } from "./workspaceToolbarRegistry";
import type { WorkspaceToolbarContribution } from "./workspaceToolbarTypes";

function Icon() {
  return null;
}

const toolbarCommand: WorkspaceCommandDefinition = {
  id: "host-toolbar-action",
  scope: "pane",
  surfaces: ["context-menu", "toolbar"],
  label: "Host toolbar action",
  run: () => {},
};

const paneMenuCommand: WorkspaceCommandDefinition = {
  id: "host-pane-action",
  scope: "pane",
  surfaces: ["context-menu"],
  label: "Host pane action",
  run: () => {},
};

const creationCommand: WorkspaceCreationCommand = {
  id: "host-note",
  label: "Host note",
  group: "Host",
  createSection: () => {
    throw new Error("The registry test never creates a section.");
  },
};

function contribution(
  overrides: Partial<WorkspaceToolbarContribution> = {},
): WorkspaceToolbarContribution {
  return {
    kind: "command",
    commandId: toolbarCommand.id,
    icon: Icon,
    placement: "before-minimap",
    ...overrides,
  };
}

describe("workspace toolbar contributions", () => {
  afterEach(() => {
    registerWorkspaceToolbarContributions([]);
    registerWorkspaceCommands([]);
    registerWorkspaceCreationCommands([]);
  });

  it("registers contributions over both command vocabularies and replaces the whole set", () => {
    registerWorkspaceCommands([toolbarCommand]);
    registerWorkspaceCreationCommands([creationCommand]);
    registerWorkspaceToolbarContributions([
      contribution({
        kind: "creation",
        commandId: creationCommand.id,
        placement: "before-viewport",
      }),
      contribution({ description: " Report the workspace " }),
    ]);

    expect(getWorkspaceToolbarContributions("before-viewport")).toHaveLength(1);
    expect(getWorkspaceToolbarContributions("before-minimap")).toEqual([
      expect.objectContaining({
        commandId: toolbarCommand.id,
        description: "Report the workspace",
      }),
    ]);

    registerWorkspaceToolbarContributions([contribution({ placement: "before-viewport" })]);

    expect(getWorkspaceToolbarContributions()).toEqual([
      expect.objectContaining({ commandId: toolbarCommand.id, placement: "before-viewport" }),
    ]);
  });

  it("rejects a contribution the command vocabularies cannot answer", () => {
    registerWorkspaceCommands([toolbarCommand, paneMenuCommand]);

    expect(() =>
      registerWorkspaceToolbarContributions([contribution({ commandId: "missing" })]),
    ).toThrow(/names unregistered command missing/);
    expect(() =>
      registerWorkspaceToolbarContributions([contribution({ commandId: paneMenuCommand.id })]),
    ).toThrow(/does not offer the toolbar surface/);
    expect(() =>
      registerWorkspaceToolbarContributions([
        contribution({ kind: "creation", commandId: creationCommand.id }),
      ]),
    ).toThrow(/names unregistered creation command host-note/);
    expect(getWorkspaceToolbarContributions()).toEqual([]);
  });

  it("rejects a repeated command, an unknown placement, a missing icon, and blank description", () => {
    registerWorkspaceCommands([toolbarCommand]);

    expect(() => registerWorkspaceToolbarContributions([contribution(), contribution()])).toThrow(
      /lists command host-toolbar-action twice/,
    );
    expect(() =>
      registerWorkspaceToolbarContributions([
        contribution({ placement: "beside-canvas" as WorkspaceToolbarContribution["placement"] }),
      ]),
    ).toThrow(/unknown placement/);
    expect(() =>
      registerWorkspaceToolbarContributions([
        contribution({ icon: undefined as unknown as WorkspaceToolbarContribution["icon"] }),
      ]),
    ).toThrow(/requires an icon component/);
    expect(() =>
      registerWorkspaceToolbarContributions([contribution({ description: "  " })]),
    ).toThrow(/description must be non-empty text/);
    expect(() =>
      registerWorkspaceToolbarContributions([
        contribution({ kind: "action" as WorkspaceToolbarContribution["kind"] }),
      ]),
    ).toThrow(/unknown kind/);
  });

  it("keeps a section command off the toolbar surface", () => {
    expect(() =>
      registerWorkspaceCommands([
        {
          ...toolbarCommand,
          scope: "section",
          surfaces: ["toolbar"],
        } as unknown as WorkspaceCommandDefinition,
      ]),
    ).toThrow(/cannot use the toolbar surface in the section scope/);
  });

  it("refuses a command registration that would strand a contributed control", () => {
    registerWorkspaceCommands([toolbarCommand]);
    registerWorkspaceToolbarContributions([contribution()]);

    expect(() => registerWorkspaceCommands([paneMenuCommand])).toThrow(
      /names unregistered command host-toolbar-action/,
    );
    expect(() =>
      registerWorkspaceCommands([{ ...toolbarCommand, surfaces: ["context-menu"] }]),
    ).toThrow(/does not offer the toolbar surface/);
    // The refused registration never took effect, so the contributed command is still offered.
    expect(getWorkspaceCommands("pane", "toolbar").map((command) => command.definition.id)).toEqual(
      [toolbarCommand.id],
    );
  });

  it("refuses a creation registration that would strand a contributed control", () => {
    registerWorkspaceCreationCommands([creationCommand]);
    registerWorkspaceToolbarContributions([
      contribution({ kind: "creation", commandId: creationCommand.id }),
    ]);

    expect(() => registerWorkspaceCreationCommands([])).toThrow(
      /names unregistered creation command host-note/,
    );
  });

  it("requires an array", () => {
    expect(() =>
      registerWorkspaceToolbarContributions(
        undefined as unknown as ReadonlyArray<WorkspaceToolbarContribution>,
      ),
    ).toThrow(/must be an array/);
  });

  it("does not run host command code to decide the toolbar's contents", () => {
    const getDisabledReason = vi.fn(() => null);
    registerWorkspaceCommands([{ ...toolbarCommand, getDisabledReason }]);
    registerWorkspaceToolbarContributions([contribution()]);

    expect(getDisabledReason).not.toHaveBeenCalled();
  });
});
