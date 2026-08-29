import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore";
import {
  assertWorkspaceToolbarContributions,
  createWorkspaceToolbarCommandCatalog,
  getWorkspaceToolbarContributions,
} from "../toolbar/workspaceToolbarContributions";
import { builtInWorkspaceCommands } from "./builtInWorkspaceCommands";
import type {
  WorkspaceCommandDefinition,
  WorkspaceCommandScope,
  WorkspaceCommandSurface,
  WorkspacePackageCommandDefinition,
} from "./workspaceCommandTypes";
import type { WorkspaceHost } from "../workspaceHost";

const COMMAND_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/u;
const PACKAGE_COMMAND_PREFIX = "workspace.";

// A scope decides which surfaces can offer a command: pane commands only exist where the pane
// itself is the target, and item commands never reach a section header or the section action row.
const SURFACES_BY_SCOPE: Record<
  WorkspaceCommandScope,
  ReadonlyArray<WorkspaceCommandSurface>
> = {
  pane: ["context-menu", "toolbar"],
  section: [
    "context-menu",
    "header",
    "inspector",
    "inspector-parameters",
    "outline",
  ],
  item: ["context-menu", "inspector-parameters"],
};

export type RegisteredWorkspaceCommand = {
  definition: WorkspaceCommandDefinition | WorkspacePackageCommandDefinition;
  origin: "host" | "package";
};

const packageCommands: ReadonlyArray<RegisteredWorkspaceCommand> =
  Object.freeze(
    builtInWorkspaceCommands.map((definition) =>
      Object.freeze<RegisteredWorkspaceCommand>({
        definition,
        origin: "package",
      }),
    ),
  );

const hostCommandsByHost = new WeakMap<
  WorkspaceHost,
  ReadonlyArray<RegisteredWorkspaceCommand>
>();

function getHostCommands(
  host: WorkspaceHost,
): ReadonlyArray<RegisteredWorkspaceCommand> {
  return hostCommandsByHost.get(host) ?? [];
}

function assertCommandFunction(
  id: string,
  role: string,
  value: unknown,
  required: boolean,
): void {
  if (value === undefined) {
    if (required) {
      throw new Error(`Workspace command ${id} requires ${role}.`);
    }
    return;
  }
  if (typeof value !== "function") {
    throw new Error(`Workspace command ${id} ${role} must be a function.`);
  }
}

function assertCommandId(id: string, ids: Set<string>): void {
  if (typeof id !== "string" || !COMMAND_ID_PATTERN.test(id)) {
    throw new Error(`Workspace command has invalid id ${JSON.stringify(id)}.`);
  }
  if (id.startsWith(PACKAGE_COMMAND_PREFIX)) {
    throw new Error(
      `Workspace command ${id} uses the reserved ${PACKAGE_COMMAND_PREFIX} package prefix.`,
    );
  }
  if (ids.has(id)) {
    throw new Error(`Workspace command registered duplicate id ${id}.`);
  }
  ids.add(id);
}

function assertCommandSurfaces(
  id: string,
  scope: WorkspaceCommandScope,
  surfaces: ReadonlyArray<WorkspaceCommandSurface>,
): void {
  if (!Array.isArray(surfaces) || surfaces.length === 0) {
    throw new Error(`Workspace command ${id} requires at least one surface.`);
  }
  const allowed = SURFACES_BY_SCOPE[scope];
  const seen = new Set<WorkspaceCommandSurface>();
  for (const surface of surfaces) {
    if (!allowed.includes(surface)) {
      throw new Error(
        `Workspace command ${id} cannot use the ${String(surface)} surface in the ${scope} scope.`,
      );
    }
    if (seen.has(surface)) {
      throw new Error(
        `Workspace command ${id} lists the ${surface} surface twice.`,
      );
    }
    seen.add(surface);
  }
}

function validateHostCommand(
  command: WorkspaceCommandDefinition,
  ids: Set<string>,
): RegisteredWorkspaceCommand {
  assertCommandId(command.id, ids);
  if (typeof command.label !== "string" || command.label.trim() === "") {
    throw new Error(
      `Workspace command ${command.id} requires a non-empty label.`,
    );
  }
  if (!Object.hasOwn(SURFACES_BY_SCOPE, command.scope)) {
    throw new Error(
      `Workspace command ${command.id} has unknown scope ${String(command.scope)}.`,
    );
  }
  assertCommandSurfaces(command.id, command.scope, command.surfaces);
  if (command.icon !== undefined && typeof command.icon !== "function") {
    throw new Error(
      `Workspace command ${command.id} icon must be a component.`,
    );
  }
  assertCommandFunction(command.id, "run", command.run, true);
  assertCommandFunction(
    command.id,
    "getDisabledReason",
    command.getDisabledReason,
    false,
  );
  assertCommandFunction(
    command.id,
    "getStatusMessage",
    command.getStatusMessage,
    false,
  );
  assertCommandFunction(command.id, "isChecked", command.isChecked, false);
  return Object.freeze<RegisteredWorkspaceCommand>({
    definition: Object.freeze({
      ...command,
      label: command.label.trim(),
      surfaces: Object.freeze([...command.surfaces]),
    }),
    origin: "host",
  });
}

// Like section-kind and item-handler registration, each call replaces the complete host-owned set.
// Package commands are always registered, so a host command that reuses a package id, an unknown
// scope, or a surface its scope cannot reach fails here instead of at invocation time. A toolbar
// contribution names a command, so the standing contributions are revalidated against the new
// catalog: a registration that would drop a contributed command, or stop offering the toolbar
// surface, fails here rather than leaving a control that cannot resolve.
export function registerWorkspaceCommands(
  host: WorkspaceHost,
  commands: ReadonlyArray<WorkspaceCommandDefinition>,
): void {
  if (!Array.isArray(commands)) {
    throw new Error("Workspace commands must be an array.");
  }
  const ids = new Set(packageCommands.map((command) => command.definition.id));
  const validated = Object.freeze(
    commands.map((command) => validateHostCommand(command, ids)),
  );
  assertWorkspaceToolbarContributions(
    getWorkspaceToolbarContributions(host),
    createWorkspaceToolbarCommandCatalog(
      [...packageCommands, ...validated].map((command) => command.definition),
      getWorkspaceCreationCommands(host),
    ),
  );
  hostCommandsByHost.set(host, validated);
  getCommandsBySurfaceKey(host).clear();
}

// Section headers ask for their surface on every document change, so the composed per-surface list
// is built once per registration instead of once per question.
const commandsBySurfaceKeyByHost = new WeakMap<
  WorkspaceHost,
  Map<string, ReadonlyArray<RegisteredWorkspaceCommand>>
>();

function getCommandsBySurfaceKey(
  host: WorkspaceHost,
): Map<string, ReadonlyArray<RegisteredWorkspaceCommand>> {
  const existing = commandsBySurfaceKeyByHost.get(host);
  if (existing) {
    return existing;
  }
  const cache = new Map<string, ReadonlyArray<RegisteredWorkspaceCommand>>();
  commandsBySurfaceKeyByHost.set(host, cache);
  return cache;
}

export function getWorkspaceCommands(
  host: WorkspaceHost,
  scope: WorkspaceCommandScope,
  surface: WorkspaceCommandSurface,
): ReadonlyArray<RegisteredWorkspaceCommand> {
  const key = `${scope}:${surface}`;
  const cache = getCommandsBySurfaceKey(host);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const commands = Object.freeze(
    [...packageCommands, ...getHostCommands(host)].filter(
      (command) =>
        command.definition.scope === scope &&
        command.definition.surfaces.includes(surface),
    ),
  );
  cache.set(key, commands);
  return commands;
}

// Every registered command, in registration order, for the surfaces that address commands by id
// instead of asking for a surface's set.
export function listWorkspaceCommands(
  host: WorkspaceHost,
): ReadonlyArray<RegisteredWorkspaceCommand> {
  return [...packageCommands, ...getHostCommands(host)];
}

export function getWorkspaceCommandOrThrow(
  host: WorkspaceHost,
  id: string,
): RegisteredWorkspaceCommand {
  const command = listWorkspaceCommands(host).find(
    (candidate) => candidate.definition.id === id,
  );
  if (!command) {
    throw new Error(`Workspace command ${id} is not registered.`);
  }
  return command;
}
