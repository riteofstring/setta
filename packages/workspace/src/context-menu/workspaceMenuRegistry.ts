import { listWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import {
  assertWorkspaceKeyBindingsForCreationCommands,
  invalidateResolvedWorkspaceKeyBindings,
} from "../keybindings/workspaceKeyBindingRegistry";
import {
  assertWorkspaceToolbarContributions,
  createWorkspaceToolbarCommandCatalog,
  getWorkspaceToolbarContributions,
} from "../toolbar/workspaceToolbarContributions";
import { setWorkspaceCreationCommands } from "./creationCommandStore";
import type { WorkspaceCreationCommand } from "./workspaceMenuTypes";
import type { WorkspaceHost } from "../workspaceHost";

const CREATION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/u;

function assertCreationId(id: string, ids: Set<string>): void {
  if (!CREATION_ID_PATTERN.test(id)) {
    throw new Error(
      `Workspace creation command has invalid id ${JSON.stringify(id)}.`,
    );
  }
  if (ids.has(id)) {
    throw new Error(
      `Workspace creation command registered duplicate id ${id}.`,
    );
  }
  ids.add(id);
}

function assertCreationText(id: string, role: string, value: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Workspace creation command ${id} requires a non-empty ${role}.`,
    );
  }
}

function assertCreationFunction(
  id: string,
  role: string,
  value: unknown,
  required: boolean,
): void {
  if (value === undefined) {
    if (required) {
      throw new Error(`Workspace creation command ${id} requires ${role}.`);
    }
    return;
  }
  if (typeof value !== "function") {
    throw new Error(
      `Workspace creation command ${id} ${role} must be a function.`,
    );
  }
}

function assertCreationChord(id: string, chord: unknown): void {
  if (chord === undefined || chord === null) {
    return;
  }
  if (typeof chord !== "string" || chord.trim() === "") {
    throw new Error(
      `Workspace creation command ${id} chord must be a chord string or null.`,
    );
  }
}

function validateCreationCommand(
  command: WorkspaceCreationCommand,
  ids: Set<string>,
): WorkspaceCreationCommand {
  assertCreationId(command.id, ids);
  assertCreationText(command.id, "label", command.label);
  assertCreationText(command.id, "group", command.group);
  assertCreationChord(command.id, command.chord);
  if (command.icon !== undefined && typeof command.icon !== "function") {
    throw new Error(
      `Workspace creation command ${command.id} icon must be a component.`,
    );
  }
  assertCreationFunction(
    command.id,
    "createSection",
    command.createSection,
    true,
  );
  assertCreationFunction(command.id, "isDisabled", command.isDisabled, false);
  return Object.freeze({
    ...command,
    group: command.group.trim(),
    label: command.label.trim(),
  });
}

export function registerWorkspaceCreationCommands(
  host: WorkspaceHost,
  commands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  if (!Array.isArray(commands)) {
    throw new Error("Workspace creation commands must be an array.");
  }
  const ids = new Set<string>();
  const validated = commands.map((command) =>
    validateCreationCommand(command, ids),
  );
  assertWorkspaceKeyBindingsForCreationCommands(host, validated);
  assertWorkspaceToolbarContributions(
    getWorkspaceToolbarContributions(host),
    createWorkspaceToolbarCommandCatalog(
      listWorkspaceCommands(host).map((command) => command.definition),
      validated,
    ),
  );
  setWorkspaceCreationCommands(host, validated);
  invalidateResolvedWorkspaceKeyBindings(host);
}
