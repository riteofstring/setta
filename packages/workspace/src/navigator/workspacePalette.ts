import type { ComponentType } from "react";
import {
  createItemCommandContext,
  createPaneCommandContext,
  createSectionCommandContext,
} from "../commands/workspaceCommandContexts";
import {
  getWorkspaceCommands,
  type RegisteredWorkspaceCommand,
} from "../commands/workspaceCommandRegistry";
import { resolveWorkspaceCommandEntries } from "../commands/workspaceCommandResolution";
import type {
  WorkspaceCommandContext,
  WorkspaceCommandIconProps,
  WorkspaceCommandScope,
} from "../commands/workspaceCommandTypes";
import {
  getWorkspaceCreationCommand,
  getWorkspaceCreationCommands,
} from "../context-menu/creationCommandStore";
import type {
  WorkspaceCreationCommand,
  WorkspaceCreationContext,
} from "../context-menu/workspaceMenuTypes";
import { getActiveSectionIds } from "../document/activeSections";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { getWorkspaceKeyBindings } from "../keybindings/workspaceKeyBindingRegistry";
import { createWorkspaceSectionFromCommand } from "../section/createSectionAction";
import type { WorkspaceHost } from "../workspaceHost";

const PALETTE_CREATION_CONTEXT: WorkspaceCreationContext = Object.freeze({
  workspacePosition: null,
});

const PALETTE_DECLINED_RESULT = Object.freeze({
  ran: false,
  statusMessage: null,
});

const PALETTE_CREATION_DISABLED_REASON =
  "Section creation is disabled in this workspace.";
const PALETTE_CREATION_UNAVAILABLE_REASON =
  "This creation command is currently unavailable.";

type WorkspacePaletteRunResult = Readonly<{
  ran: boolean;
  statusMessage: string | null;
}>;

type WorkspacePaletteEntry = Readonly<{
  checked: boolean | null;
  description?: string;
  disabled: boolean;
  disabledReason: string | null;
  group: string;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  id: string;
  keyBindingId?: string;
  keywords: ReadonlyArray<string>;
  label: string;
  run: () => WorkspacePaletteRunResult;
  shortcutLabel?: string;
}>;

type WorkspacePaletteContexts = Readonly<{
  item: WorkspaceCommandContext | null;
  pane: WorkspaceCommandContext;
  section: WorkspaceCommandContext | null;
}>;

function getLiveActiveSections(
  host: WorkspaceHost,
): Array<WorkspaceSection> | null {
  const state = getWorkspaceDocumentStore(host).getState();
  const activeIds = getActiveSectionIds(host);
  const sections: Array<WorkspaceSection> = [];
  for (const id of activeIds) {
    const section = state.sections[id];
    if (!section) {
      return null;
    }
    sections.push(section);
  }
  return sections;
}

function resolveWorkspacePaletteSectionContext(
  host: WorkspaceHost,
  activeSections: Array<WorkspaceSection> | null,
): WorkspaceCommandContext | null {
  if (activeSections === null) {
    return null;
  }
  const primarySection = activeSections[0];
  return primarySection
    ? createSectionCommandContext(host, primarySection, activeSections)
    : null;
}

function resolveWorkspacePaletteItemContext(
  host: WorkspaceHost,
  activeSections: Array<WorkspaceSection> | null,
): WorkspaceCommandContext | null {
  if (activeSections === null || activeSections.length !== 1) {
    return null;
  }
  const section = activeSections[0];
  const itemTree = section?.itemTree;
  if (!section || !itemTree || itemTree.selectedItemIds.length !== 1) {
    return null;
  }
  const selectedItemId = itemTree.selectedItemIds[0];
  const item = selectedItemId ? itemTree.items[selectedItemId] : undefined;
  return item ? createItemCommandContext(host, section, item) : null;
}

function resolveWorkspacePaletteContexts(
  host: WorkspaceHost,
): WorkspacePaletteContexts {
  const activeSections = getLiveActiveSections(host);
  return Object.freeze({
    item: resolveWorkspacePaletteItemContext(host, activeSections),
    pane: createPaneCommandContext(host, null),
    section: resolveWorkspacePaletteSectionContext(host, activeSections),
  });
}

function getPaletteCommandContext(
  contexts: WorkspacePaletteContexts,
  scope: WorkspaceCommandScope,
): WorkspaceCommandContext | null {
  return contexts[scope];
}

function getPaletteCommandKeyBinding(
  command: RegisteredWorkspaceCommand,
  keyBindingsById: ReadonlyMap<
    string,
    { chordLabel: string | null; id: string }
  >,
): { keyBindingId?: string; shortcutLabel?: string } {
  if (command.origin !== "package") {
    return {};
  }
  const keyBinding = keyBindingsById.get(command.definition.id);
  if (!keyBinding) {
    return {};
  }
  return {
    keyBindingId: keyBinding.id,
    ...(keyBinding.chordLabel === null
      ? {}
      : { shortcutLabel: keyBinding.chordLabel }),
  };
}

function runWorkspacePaletteCommand(
  host: WorkspaceHost,
  id: string,
  scope: WorkspaceCommandScope,
): WorkspacePaletteRunResult {
  const context = getPaletteCommandContext(
    resolveWorkspacePaletteContexts(host),
    scope,
  );
  if (context === null) {
    return PALETTE_DECLINED_RESULT;
  }
  const entry = resolveWorkspaceCommandEntries("palette", context).find(
    (candidate) => candidate.id === id,
  );
  if (!entry) {
    return PALETTE_DECLINED_RESULT;
  }
  if (entry.disabled) {
    return {
      ran: false,
      statusMessage: entry.disabledReason,
    };
  }
  return entry.run();
}

function resolveWorkspacePaletteCommandEntries(
  host: WorkspaceHost,
  contexts: WorkspacePaletteContexts,
  keyBindingsById: ReadonlyMap<
    string,
    { chordLabel: string | null; id: string }
  >,
): Array<WorkspacePaletteEntry> {
  const entries: Array<WorkspacePaletteEntry> = [];
  for (const scope of ["pane", "section", "item"] as const) {
    const context = getPaletteCommandContext(contexts, scope);
    if (context === null) {
      continue;
    }
    for (const entry of resolveWorkspaceCommandEntries("palette", context)) {
      const command = getWorkspaceCommands(host, scope, "palette").find(
        (candidate) => candidate.definition.id === entry.id,
      );
      if (!command) {
        throw new Error(`Workspace palette lost command ${entry.id}.`);
      }
      entries.push(
        Object.freeze({
          checked: entry.checked,
          disabled: entry.disabled,
          disabledReason: entry.disabledReason,
          group: "Commands",
          ...(entry.icon ? { icon: entry.icon } : {}),
          id: `command:${entry.id}`,
          ...getPaletteCommandKeyBinding(command, keyBindingsById),
          keywords: Object.freeze([...entry.keywords]),
          label: entry.label,
          run: () => runWorkspacePaletteCommand(host, entry.id, scope),
        }),
      );
    }
  }
  return entries;
}

function runWorkspacePaletteCreation(
  host: WorkspaceHost,
  id: string,
): WorkspacePaletteRunResult {
  const command = getWorkspaceCreationCommand(host, id);
  if (!command) {
    return PALETTE_DECLINED_RESULT;
  }
  const disabledReason = getWorkspacePaletteCreationDisabledReason(
    host,
    command,
  );
  if (disabledReason) {
    return { ran: false, statusMessage: disabledReason };
  }
  return {
    ran: createWorkspaceSectionFromCommand(host, command),
    statusMessage: null,
  };
}

function getWorkspacePaletteCreationDisabledReason(
  host: WorkspaceHost,
  command: WorkspaceCreationCommand,
): string | null {
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditStructure) {
    return PALETTE_CREATION_DISABLED_REASON;
  }
  return command.isDisabled?.(PALETTE_CREATION_CONTEXT)
    ? PALETTE_CREATION_UNAVAILABLE_REASON
    : null;
}

function resolveWorkspacePaletteCreationEntries(
  host: WorkspaceHost,
  keyBindingsById: ReadonlyMap<
    string,
    { chordLabel: string | null; id: string }
  >,
): Array<WorkspacePaletteEntry> {
  return getWorkspaceCreationCommands(host).map((command) => {
    const keyBinding = keyBindingsById.get(command.id);
    const disabledReason = getWorkspacePaletteCreationDisabledReason(
      host,
      command,
    );
    return Object.freeze({
      checked: null,
      description: command.group,
      disabled: disabledReason !== null,
      disabledReason,
      group: "Create",
      ...(command.icon ? { icon: command.icon } : {}),
      id: `creation:${command.id}`,
      ...(keyBinding ? { keyBindingId: keyBinding.id } : {}),
      keywords: Object.freeze([command.group]),
      label: command.label,
      run: () => runWorkspacePaletteCreation(host, command.id),
      ...(keyBinding?.chordLabel === null || keyBinding === undefined
        ? {}
        : { shortcutLabel: keyBinding.chordLabel }),
    });
  });
}

export function resolveWorkspacePaletteEntries(
  host: WorkspaceHost,
): ReadonlyArray<WorkspacePaletteEntry> {
  const keyBindingsById = new Map(
    getWorkspaceKeyBindings(host).map((binding) => [binding.id, binding]),
  );
  return Object.freeze([
    ...resolveWorkspacePaletteCommandEntries(
      host,
      resolveWorkspacePaletteContexts(host),
      keyBindingsById,
    ),
    ...resolveWorkspacePaletteCreationEntries(host, keyBindingsById),
  ]);
}
