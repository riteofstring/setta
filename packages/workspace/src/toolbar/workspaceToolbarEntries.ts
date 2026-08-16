import type { ComponentType } from "react";
import { createPaneCommandContext } from "../commands/workspaceCommandContexts";
import { resolveWorkspaceCommandEntry } from "../commands/workspaceCommandResolution";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes";
import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore";
import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { createWorkspaceSectionFromCommand } from "../section/createSectionAction";
import { getWorkspaceToolbarContributions } from "./workspaceToolbarContributions";
import type { WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceToolbarContribution,
  WorkspaceToolbarPlacement,
} from "./workspaceToolbarTypes";

export type WorkspaceToolbarEntry = Readonly<{
  checked: boolean | null;
  disabled: boolean;
  // The sentence a refusing command shows, which only the command registry's actions have. The
  // creation catalog is a list of sections to make rather than actions over workspace state, and
  // it explains a disabled entry no more here than it does in the pane menu.
  disabledReason: string | null;
  icon: ComponentType<WorkspaceCommandIconProps>;
  key: string;
  label: string;
  run: () => void;
  tooltip: string;
}>;

function getCreationCommandOrThrow(
  host: WorkspaceHost,
  id: string,
): WorkspaceCreationCommand {
  const command = getWorkspaceCreationCommands(host).find(
    (candidate) => candidate.id === id,
  );
  if (!command) {
    throw new Error(`Workspace creation command ${id} is not registered.`);
  }
  return command;
}

// A toolbar control acts from a fixed place on the shell, so it asks for a pane context with no
// position: the creation operation resolves the empty space its section lands in, exactly as it
// does for the chord that creates without a pointer.
function resolveCreationEntry(
  host: WorkspaceHost,
  contribution: WorkspaceToolbarContribution,
): WorkspaceToolbarEntry {
  const command = getCreationCommandOrThrow(host, contribution.commandId);
  const context = Object.freeze({ workspacePosition: null });
  const disabled =
    !getWorkspaceCapabilitiesStore(host).getState().canEditStructure ||
    (command.isDisabled?.(context) ?? false);
  return Object.freeze({
    checked: null,
    disabled,
    disabledReason: null,
    icon: contribution.icon,
    key: `creation:${command.id}`,
    label: command.label,
    run: () => {
      createWorkspaceSectionFromCommand(host, command);
    },
    tooltip: contribution.description ?? command.label,
  });
}

function resolveCommandEntry(
  host: WorkspaceHost,
  contribution: WorkspaceToolbarContribution,
): WorkspaceToolbarEntry {
  const entry = resolveWorkspaceCommandEntry(
    contribution.commandId,
    createPaneCommandContext(host, null),
  );
  return Object.freeze({
    checked: entry.checked,
    disabled: entry.disabled,
    disabledReason: entry.disabledReason,
    icon: contribution.icon,
    key: `command:${entry.id}`,
    label: entry.label,
    run: () => {
      entry.run();
    },
    // A refusing control explains itself where it is, so the reason replaces the description the
    // same way the menus replace an item's own description with it.
    tooltip: entry.disabledReason ?? contribution.description ?? entry.label,
  });
}

export function resolveWorkspaceToolbarEntries(
  host: WorkspaceHost,
  placement: WorkspaceToolbarPlacement,
): ReadonlyArray<WorkspaceToolbarEntry> {
  return getWorkspaceToolbarContributions(host, placement).map(
    (contribution) =>
      contribution.kind === "creation"
        ? resolveCreationEntry(host, contribution)
        : resolveCommandEntry(host, contribution),
  );
}
