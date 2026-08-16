import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  registerWorkspaceCommands([]);
});

describe("workspace command registry", () => {
  it("offers package commands before host commands on each surface", () => {
    registerWorkspaceCommands([
      hostCommand({ surfaces: ["context-menu", "header"] }),
    ]);

    expect(
      getWorkspaceCommands("section", "header").map((command) => [
        command.origin,
        command.definition.id,
      ]),
    ).toEqual([
      ["package", "workspace.toggle-group-overflow"],
      ["package", "workspace.ungroup-sections"],
      ["host", "host-report"],
    ]);
    expect(
      getWorkspaceCommands("item", "context-menu").map(
        (command) => command.definition.id,
      ),
    ).toEqual(["workspace.delete-item"]);
    expect(getWorkspaceCommands("pane", "context-menu")).toEqual([]);
  });

  it("replaces the previous host registration atomically", () => {
    registerWorkspaceCommands([hostCommand()]);
    registerWorkspaceCommands([
      hostCommand({ id: "host-second", label: "Second" }),
    ]);

    expect(
      getWorkspaceCommands("section", "context-menu")
        .filter((command) => command.origin === "host")
        .map((command) => command.definition.id),
    ).toEqual(["host-second"]);

    registerWorkspaceCommands([]);
    expect(
      getWorkspaceCommands("section", "context-menu").every(
        (command) => command.origin === "package",
      ),
    ).toBe(true);
  });

  it("rejects invalid identity, scope, and surface registrations", () => {
    expect(() =>
      registerWorkspaceCommands([hostCommand({ id: "bad id" })]),
    ).toThrow(/invalid id/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({ id: "workspace.ungroup-sections" }),
      ]),
    ).toThrow(/reserved workspace\. package prefix/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({ id: "same" }),
        hostCommand({ id: "same" }),
      ]),
    ).toThrow(/duplicate id same/);
    expect(() =>
      registerWorkspaceCommands([hostCommand({ label: "  " })]),
    ).toThrow(/non-empty label/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({
          scope: "picture",
        } as unknown as Partial<WorkspaceCommandDefinition>),
      ]),
    ).toThrow(/unknown scope picture/);
    expect(() =>
      registerWorkspaceCommands([hostCommand({ surfaces: [] })]),
    ).toThrow(/at least one surface/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({ scope: "pane", surfaces: ["header"] }),
      ]),
    ).toThrow(/cannot use the header surface in the pane scope/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({ surfaces: ["context-menu", "context-menu"] }),
      ]),
    ).toThrow(/lists the context-menu surface twice/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({
          run: undefined,
        } as unknown as Partial<WorkspaceCommandDefinition>),
      ]),
    ).toThrow(/requires run/);
    expect(() =>
      registerWorkspaceCommands([
        hostCommand({
          getDisabledReason: "never",
        } as unknown as Partial<WorkspaceCommandDefinition>),
      ]),
    ).toThrow(/getDisabledReason must be a function/);
  });

  it("fails clearly when a surface asks for an unknown command id", () => {
    expect(() => getWorkspaceCommandOrThrow("workspace.missing")).toThrow(
      /workspace.missing is not registered/,
    );
    expect(
      getWorkspaceCommandOrThrow("workspace.ungroup-sections").definition.label,
    ).toBe("Ungroup");
  });
});
