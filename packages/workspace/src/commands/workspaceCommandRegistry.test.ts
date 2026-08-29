import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  getWorkspaceCommandOrThrow,
  getWorkspaceCommands,
  registerWorkspaceCommands,
} from "./workspaceCommandRegistry";
import type { WorkspaceCommandDefinition } from "./workspaceCommandTypes";

function hostCommand(
  overrides: Partial<WorkspaceCommandDefinition> = {},
): WorkspaceCommandDefinition {
  return {
    id: "host-report",
    scope: "section",
    surfaces: ["context-menu"],
    label: "Report selection",
    run: vi.fn(),
    ...overrides,
  } as WorkspaceCommandDefinition;
}

describe("workspace command registry", () => {
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
  });

  afterEach(() => host.dispose());

  it("offers package commands before host commands on each surface", () => {
    registerWorkspaceCommands(host, [
      hostCommand({ surfaces: ["context-menu", "header"] }),
    ]);

    expect(
      getWorkspaceCommands(host, "section", "header").map((command) => [
        command.origin,
        command.definition.id,
      ]),
    ).toEqual([
      ["package", "workspace.toggle-group-overflow"],
      ["package", "workspace.ungroup-sections"],
      ["host", "host-report"],
    ]);
    expect(
      getWorkspaceCommands(host, "item", "context-menu").map(
        (command) => command.definition.id,
      ),
    ).toEqual(["workspace.delete-item"]);
    expect(getWorkspaceCommands(host, "pane", "context-menu")).toEqual([]);
  });

  it("replaces the previous host registration atomically", () => {
    registerWorkspaceCommands(host, [hostCommand()]);
    registerWorkspaceCommands(host, [
      hostCommand({ id: "host-second", label: "Second" }),
    ]);

    expect(
      getWorkspaceCommands(host, "section", "context-menu")
        .filter((command) => command.origin === "host")
        .map((command) => command.definition.id),
    ).toEqual(["host-second"]);

    registerWorkspaceCommands(host, []);
    expect(
      getWorkspaceCommands(host, "section", "context-menu").every(
        (command) => command.origin === "package",
      ),
    ).toBe(true);
  });

  it("offers palette commands in every scope and normalizes keywords", () => {
    const commands = [
      {
        id: "palette-pane",
        scope: "pane",
        surfaces: ["palette"],
        label: "Pane action",
        keywords: ["  canvas  ", "workspace"],
        run: vi.fn(),
      },
      {
        id: "palette-section",
        scope: "section",
        surfaces: ["palette"],
        label: "Section action",
        run: vi.fn(),
      },
      {
        id: "palette-item",
        scope: "item",
        surfaces: ["palette"],
        label: "Item action",
        run: vi.fn(),
      },
    ] satisfies ReadonlyArray<WorkspaceCommandDefinition>;

    registerWorkspaceCommands(host, commands);

    expect(
      getWorkspaceCommands(host, "pane", "palette").find(
        (command) => command.definition.id === "palette-pane",
      )?.definition.keywords,
    ).toEqual(["canvas", "workspace"]);
    expect(
      getWorkspaceCommands(host, "section", "palette").some(
        (command) => command.definition.id === "palette-section",
      ),
    ).toBe(true);
    expect(
      getWorkspaceCommands(host, "item", "palette").some(
        (command) => command.definition.id === "palette-item",
      ),
    ).toBe(true);
  });

  it("rejects invalid identity, scope, and surface registrations", () => {
    expect(() =>
      registerWorkspaceCommands(host, [hostCommand({ id: "bad id" })]),
    ).toThrow(/invalid id/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({ id: "workspace.ungroup-sections" }),
      ]),
    ).toThrow(/reserved workspace\. package prefix/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({ id: "same" }),
        hostCommand({ id: "same" }),
      ]),
    ).toThrow(/duplicate id same/);
    expect(() =>
      registerWorkspaceCommands(host, [hostCommand({ label: "  " })]),
    ).toThrow(/non-empty label/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({
          scope: "picture",
        } as unknown as Partial<WorkspaceCommandDefinition>),
      ]),
    ).toThrow(/unknown scope picture/);
    expect(() =>
      registerWorkspaceCommands(host, [hostCommand({ surfaces: [] })]),
    ).toThrow(/at least one surface/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({ scope: "pane", surfaces: ["header"] }),
      ]),
    ).toThrow(/cannot use the header surface in the pane scope/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({ surfaces: ["context-menu", "context-menu"] }),
      ]),
    ).toThrow(/lists the context-menu surface twice/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({
          run: undefined,
        } as unknown as Partial<WorkspaceCommandDefinition>),
      ]),
    ).toThrow(/requires run/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({
          getDisabledReason: "never",
        } as unknown as Partial<WorkspaceCommandDefinition>),
      ]),
    ).toThrow(/getDisabledReason must be a function/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({
          keywords: "section" as unknown as ReadonlyArray<string>,
        }),
      ]),
    ).toThrow(/keywords must be an array/);
    expect(() =>
      registerWorkspaceCommands(host, [hostCommand({ keywords: [" "] })]),
    ).toThrow(/keywords must contain non-empty text/);
    expect(() =>
      registerWorkspaceCommands(host, [
        hostCommand({ keywords: ["Section", " Section "] }),
      ]),
    ).toThrow(/lists the Section keyword twice/);
  });

  it("fails clearly when a surface asks for an unknown command id", () => {
    expect(() => getWorkspaceCommandOrThrow(host, "workspace.missing")).toThrow(
      /workspace.missing is not registered/,
    );
    expect(
      getWorkspaceCommandOrThrow(host, "workspace.ungroup-sections").definition
        .label,
    ).toBe("Ungroup");
  });
});
