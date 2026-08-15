import type { ComponentType } from "react";
import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useWorkspaceDocument } from "../document/stores";
import {
  getWorkspaceCommandOrThrow,
  getWorkspaceCommands,
  type RegisteredWorkspaceCommand,
} from "./workspaceCommandRegistry";
import type {
  WorkspaceCommandContext,
  WorkspaceCommandIconProps,
  WorkspaceCommandSurface,
} from "./workspaceCommandTypes";

export type WorkspaceCommandEntry = {
  checked: boolean | null;
  disabled: boolean;
  disabledReason: string | null;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  id: string;
  label: string;
  origin: "host" | "package";
  run: () => WorkspaceCommandResult;
  tone: "danger" | null;
};

export type WorkspaceCommandResult = {
  ran: boolean;
  statusMessage: string | null;
};

type WorkspaceCommandPresentation = {
  tone?: "danger";
};

type WorkspaceCommandEvaluators = {
  getDisabledReason?: (context: WorkspaceCommandContext) => string | null;
  getStatusMessage?: (context: WorkspaceCommandContext) => string;
  isApplicable?: (context: WorkspaceCommandContext) => boolean;
  isChecked?: (context: WorkspaceCommandContext) => boolean;
  run: (context: WorkspaceCommandContext) => void;
};

// Every evaluator is declared against the definition's own scope, and the caller below proves the
// context carries that scope, so the scoped union collapses to one call shape here.
function getCommandEvaluators(command: RegisteredWorkspaceCommand): WorkspaceCommandEvaluators {
  return command.definition as unknown as WorkspaceCommandEvaluators;
}

function assertCommandScope(
  command: RegisteredWorkspaceCommand,
  context: WorkspaceCommandContext,
): void {
  if (command.definition.scope !== context.scope) {
    throw new Error(
      `Workspace command ${command.definition.id} cannot receive ${context.scope} context for ${command.definition.scope}.`,
    );
  }
}

function isCommandApplicable(
  command: RegisteredWorkspaceCommand,
  context: WorkspaceCommandContext,
): boolean {
  assertCommandScope(command, context);
  return getCommandEvaluators(command).isApplicable?.(context) ?? true;
}

// The resolved state a surface painted can go stale before the click reaches the command, so
// execution revalidates the same applicability and disabled rules the surface displayed.
function runWorkspaceCommand(
  command: RegisteredWorkspaceCommand,
  context: WorkspaceCommandContext,
): WorkspaceCommandResult {
  if (!isCommandApplicable(command, context)) {
    return { ran: false, statusMessage: null };
  }
  const evaluators = getCommandEvaluators(command);
  if (evaluators.getDisabledReason?.(context)) {
    return { ran: false, statusMessage: null };
  }
  const statusMessage = evaluators.getStatusMessage?.(context) ?? null;
  evaluators.run(context);
  return { ran: true, statusMessage };
}

export function runWorkspaceCommandById(
  id: string,
  context: WorkspaceCommandContext,
): WorkspaceCommandResult {
  return runWorkspaceCommand(getWorkspaceCommandOrThrow(id), context);
}

function toWorkspaceCommandEntry(
  command: RegisteredWorkspaceCommand,
  context: WorkspaceCommandContext,
): WorkspaceCommandEntry {
  const evaluators = getCommandEvaluators(command);
  const disabledReason = evaluators.getDisabledReason?.(context) ?? null;
  return {
    checked: evaluators.isChecked?.(context) ?? null,
    disabled: disabledReason !== null,
    disabledReason,
    ...(command.definition.icon ? { icon: command.definition.icon } : {}),
    id: command.definition.id,
    label: command.definition.label,
    origin: command.origin,
    run: () => runWorkspaceCommand(command, context),
    tone: (command.definition as WorkspaceCommandPresentation).tone ?? null,
  };
}

// The surfaces that place individual commands by id — the toolbar, whose contributions choose
// both the command and its position — resolve one entry the same way a surface's list does.
export function resolveWorkspaceCommandEntry(
  id: string,
  context: WorkspaceCommandContext,
): WorkspaceCommandEntry {
  const command = getWorkspaceCommandOrThrow(id);
  assertCommandScope(command, context);
  return toWorkspaceCommandEntry(command, context);
}

export function resolveWorkspaceCommandEntries(
  surface: WorkspaceCommandSurface,
  context: WorkspaceCommandContext,
): ReadonlyArray<WorkspaceCommandEntry> {
  return getWorkspaceCommands(context.scope, surface)
    .filter((command) => isCommandApplicable(command, context))
    .map((command) => toWorkspaceCommandEntry(command, context));
}

export function hasApplicableWorkspaceCommands(
  surface: WorkspaceCommandSurface,
  context: WorkspaceCommandContext,
): boolean {
  return getWorkspaceCommands(context.scope, surface).some(
    (command) => command.origin === "host" || isCommandApplicable(command, context),
  );
}

// Command state is derived from the document, the host's capabilities, and the in-flight
// parameter drag. Subscribing here keeps every surface that offers commands repainting on the
// same changes instead of each one remembering which stores its entries depend on.
export function useWorkspaceCommandState(): void {
  useWorkspaceDocument((state) => state);
  useWorkspaceCapabilities((state) => state);
  useItemDndState((state) => state.activeId);
}

// A surface may combine several contexts — the Inspector's parameter row offers section and item
// commands together — so the subscription is per surface rather than per context.
export function useWorkspaceCommandEntries(
  surface: WorkspaceCommandSurface,
  contexts: ReadonlyArray<WorkspaceCommandContext>,
): ReadonlyArray<WorkspaceCommandEntry> {
  useWorkspaceCommandState();
  return contexts.flatMap((context) => resolveWorkspaceCommandEntries(surface, context));
}
