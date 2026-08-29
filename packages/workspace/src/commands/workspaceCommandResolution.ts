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
  keywords: ReadonlyArray<string>;
  label: string;
  origin: "host" | "package";
  run: () => WorkspaceCommandResult;
  tone: "danger" | null;
};

type WorkspaceCommandResult = {
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

function getCommandEvaluators(
  command: RegisteredWorkspaceCommand,
): WorkspaceCommandEvaluators {
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
  return runWorkspaceCommand(
    getWorkspaceCommandOrThrow(context.host, id),
    context,
  );
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
    keywords: command.definition.keywords ?? [],
    label: command.definition.label,
    origin: command.origin,
    run: () => runWorkspaceCommand(command, context),
    tone: (command.definition as WorkspaceCommandPresentation).tone ?? null,
  };
}

export function resolveWorkspaceCommandEntry(
  id: string,
  context: WorkspaceCommandContext,
): WorkspaceCommandEntry {
  const command = getWorkspaceCommandOrThrow(context.host, id);
  assertCommandScope(command, context);
  return toWorkspaceCommandEntry(command, context);
}

export function resolveWorkspaceCommandEntries(
  surface: WorkspaceCommandSurface,
  context: WorkspaceCommandContext,
): ReadonlyArray<WorkspaceCommandEntry> {
  return getWorkspaceCommands(context.host, context.scope, surface)
    .filter((command) => isCommandApplicable(command, context))
    .map((command) => toWorkspaceCommandEntry(command, context));
}

export function hasApplicableWorkspaceCommands(
  surface: WorkspaceCommandSurface,
  context: WorkspaceCommandContext,
): boolean {
  return getWorkspaceCommands(context.host, context.scope, surface).some(
    (command) =>
      command.origin === "host" || isCommandApplicable(command, context),
  );
}

export function useWorkspaceCommandState(): void {
  useWorkspaceDocument((state) => state);
  useWorkspaceCapabilities((state) => state);
  useItemDndState((state) => state.activeId);
}

export function useWorkspaceCommandEntries(
  surface: WorkspaceCommandSurface,
  contexts: ReadonlyArray<WorkspaceCommandContext>,
): ReadonlyArray<WorkspaceCommandEntry> {
  useWorkspaceCommandState();
  return contexts.flatMap((context) =>
    resolveWorkspaceCommandEntries(surface, context),
  );
}
