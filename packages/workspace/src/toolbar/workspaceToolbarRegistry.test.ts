import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost } from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
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
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
  });

  afterEach(() => host.dispose());

  it("registers contributions over both command vocabularies and replaces the whole set", () => {
    registerWorkspaceCommands(host, [toolbarCommand]);
    registerWorkspaceCreationCommands(host, [creationCommand]);
    registerWorkspaceToolbarContributions(host, [
      contribution({
        kind: "creation",
        commandId: creationCommand.id,
        placement: "before-viewport",
      }),
      contribution({ description: " Report the workspace " }),
    ]);

    expect(getWorkspaceToolbarContributions(host, "before-viewport")).toHaveLength(1);
    expect(getWorkspaceToolbarContributions(host, "before-minimap")).toEqual([
      expect.objectContaining({
        commandId: toolbarCommand.id,
        description: "Report the workspace",
      }),
    ]);

    registerWorkspaceToolbarContributions(host, [
      contribution({ placement: "before-viewport" }),
    ]);

    expect(getWorkspaceToolbarContributions(host)).toEqual([
      expect.objectContaining({
        commandId: toolbarCommand.id,
        placement: "before-viewport",
      }),
    ]);
  });

  it("rejects a contribution the command vocabularies cannot answer", () => {
    registerWorkspaceCommands(host, [toolbarCommand, paneMenuCommand]);

    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({ commandId: "missing" }),
      ]),
    ).toThrow(/names unregistered command missing/);
    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({ commandId: paneMenuCommand.id }),
      ]),
    ).toThrow(/does not offer the toolbar surface/);
    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({ kind: "creation", commandId: creationCommand.id }),
      ]),
    ).toThrow(/names unregistered creation command host-note/);
    expect(getWorkspaceToolbarContributions(host)).toEqual([]);
  });

  it("rejects a repeated command, an unknown placement, a missing icon, and blank description", () => {
    registerWorkspaceCommands(host, [toolbarCommand]);

    expect(() =>
      registerWorkspaceToolbarContributions(host, [contribution(), contribution()]),
    ).toThrow(/lists command host-toolbar-action twice/);
    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({
          placement:
            "beside-canvas" as WorkspaceToolbarContribution["placement"],
        }),
      ]),
    ).toThrow(/unknown placement/);
    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({
          icon: undefined as unknown as WorkspaceToolbarContribution["icon"],
        }),
      ]),
    ).toThrow(/requires an icon component/);
    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({ description: "  " }),
      ]),
    ).toThrow(/description must be non-empty text/);
    expect(() =>
      registerWorkspaceToolbarContributions(host, [
        contribution({
          kind: "action" as WorkspaceToolbarContribution["kind"],
        }),
      ]),
    ).toThrow(/unknown kind/);
  });

  it("keeps a section command off the toolbar surface", () => {
    expect(() =>
      registerWorkspaceCommands(host, [
        {
          ...toolbarCommand,
          scope: "section",
          surfaces: ["toolbar"],
        } as unknown as WorkspaceCommandDefinition,
      ]),
    ).toThrow(/cannot use the toolbar surface in the section scope/);
  });

  it("refuses a command registration that would strand a contributed control", () => {
    registerWorkspaceCommands(host, [toolbarCommand]);
    registerWorkspaceToolbarContributions(host, [contribution()]);

    expect(() => registerWorkspaceCommands(host, [paneMenuCommand])).toThrow(
      /names unregistered command host-toolbar-action/,
    );
    expect(() =>
      registerWorkspaceCommands(host, [
        { ...toolbarCommand, surfaces: ["context-menu"] },
      ]),
    ).toThrow(/does not offer the toolbar surface/);
    // The refused registration never took effect, so the contributed command is still offered.
    expect(
      getWorkspaceCommands(host, "pane", "toolbar").map(
        (command) => command.definition.id,
      ),
    ).toEqual([toolbarCommand.id]);
  });

  it("refuses a creation registration that would strand a contributed control", () => {
    registerWorkspaceCreationCommands(host, [creationCommand]);
    registerWorkspaceToolbarContributions(host, [
      contribution({ kind: "creation", commandId: creationCommand.id }),
    ]);

    expect(() => registerWorkspaceCreationCommands(host, [])).toThrow(
      /names unregistered creation command host-note/,
    );
  });

  it("requires an array", () => {
    expect(() =>
      registerWorkspaceToolbarContributions(
        host,
        undefined as unknown as ReadonlyArray<WorkspaceToolbarContribution>,
      ),
    ).toThrow(/must be an array/);
  });

  it("does not run host command code to decide the toolbar's contents", () => {
    const getDisabledReason = vi.fn(() => null);
    registerWorkspaceCommands(host, [{ ...toolbarCommand, getDisabledReason }]);
    registerWorkspaceToolbarContributions(host, [contribution()]);

    expect(getDisabledReason).not.toHaveBeenCalled();
  });
});
