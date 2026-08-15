import type {
  WorkspaceCreationCommand,
  WorkspaceMenuActionContext,
  WorkspaceMenuActionDefinition,
} from "./workspaceMenuTypes";

const MENU_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const MENU_ACTION_SCOPES = new Set<WorkspaceMenuActionContext["scope"]>([
  "pane",
  "section",
  "item",
  "outline",
]);

let registeredCreationCommands: ReadonlyArray<WorkspaceCreationCommand> = [];
let registeredMenuActions: ReadonlyArray<WorkspaceMenuActionDefinition> = [];

function assertMenuId(role: string, id: string, ids: Set<string>): void {
  if (!MENU_ID_PATTERN.test(id)) {
    throw new Error(`Workspace ${role} has invalid id ${JSON.stringify(id)}.`);
  }
  if (ids.has(id)) {
    throw new Error(`Workspace ${role} registered duplicate id ${id}.`);
  }
  ids.add(id);
}

function assertLabel(role: string, id: string, label: string): void {
  if (label.trim() === "") {
    throw new Error(`Workspace ${role} ${id} requires a non-empty label.`);
  }
}

function assertIcon(role: string, id: string, icon: unknown): void {
  if (icon !== undefined && typeof icon !== "function") {
    throw new Error(`Workspace ${role} ${id} icon must be a component.`);
  }
}

// Like section-kind and item-handler registration, each call replaces the complete host-owned
// set. Hosts register before mounting the canvas; the package owns the built-in structural items.
export function registerWorkspaceCreationCommands(
  commands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  if (!Array.isArray(commands)) {
    throw new Error("Workspace creation commands must be an array.");
  }
  const ids = new Set<string>();
  registeredCreationCommands = commands.map((command) => {
    assertMenuId("creation command", command.id, ids);
    assertLabel("creation command", command.id, command.label);
    if (command.group.trim() === "") {
      throw new Error(`Workspace creation command ${command.id} requires a non-empty group.`);
    }
    assertIcon("creation command", command.id, command.icon);
    if (typeof command.createSection !== "function") {
      throw new Error(`Workspace creation command ${command.id} requires createSection.`);
    }
    if (command.isDisabled !== undefined && typeof command.isDisabled !== "function") {
      throw new Error(`Workspace creation command ${command.id} isDisabled must be a function.`);
    }
    return Object.freeze({ ...command, group: command.group.trim(), label: command.label.trim() });
  });
}

export function registerWorkspaceMenuActions(
  actions: ReadonlyArray<WorkspaceMenuActionDefinition>,
): void {
  if (!Array.isArray(actions)) {
    throw new Error("Workspace menu actions must be an array.");
  }
  const ids = new Set<string>();
  registeredMenuActions = actions.map((action) => {
    assertMenuId("menu action", action.id, ids);
    assertLabel("menu action", action.id, action.label);
    if (!MENU_ACTION_SCOPES.has(action.scope)) {
      throw new Error(
        `Workspace menu action ${action.id} has unknown scope ${String(action.scope)}.`,
      );
    }
    assertIcon("menu action", action.id, action.icon);
    if (typeof action.onSelect !== "function") {
      throw new Error(`Workspace menu action ${action.id} requires onSelect.`);
    }
    if (action.isDisabled !== undefined && typeof action.isDisabled !== "function") {
      throw new Error(`Workspace menu action ${action.id} isDisabled must be a function.`);
    }
    return Object.freeze({ ...action, label: action.label.trim() });
  });
}

export function getWorkspaceCreationCommands(): ReadonlyArray<WorkspaceCreationCommand> {
  return registeredCreationCommands;
}

export function getWorkspaceMenuActions<Scope extends WorkspaceMenuActionContext["scope"]>(
  scope: Scope,
): ReadonlyArray<Extract<WorkspaceMenuActionDefinition, { scope: Scope }>> {
  return registeredMenuActions.filter(
    (action): action is Extract<WorkspaceMenuActionDefinition, { scope: Scope }> =>
      action.scope === scope,
  );
}
