import type {
  WorkspaceCommandScope,
  WorkspaceCommandSurface,
} from "../commands/workspaceCommandTypes";
import type {
  WorkspaceToolbarContribution,
  WorkspaceToolbarPlacement,
} from "./workspaceToolbarTypes";
import type { WorkspaceHost } from "../workspaceHost";

const TOOLBAR_SURFACE: WorkspaceCommandSurface = "toolbar";
const TOOLBAR_SCOPE: WorkspaceCommandScope = "pane";
const PLACEMENTS: ReadonlyArray<WorkspaceToolbarPlacement> = [
  "before-viewport",
  "before-minimap",
];
const KINDS: ReadonlyArray<WorkspaceToolbarContribution["kind"]> = [
  "command",
  "creation",
];

const contributionsByHost = new WeakMap<
  WorkspaceHost,
  ReadonlyArray<WorkspaceToolbarContribution>
>();

type WorkspaceToolbarCommandSummary = {
  id: string;
  scope: WorkspaceCommandScope;
  surfaces: ReadonlyArray<WorkspaceCommandSurface>;
};

type WorkspaceToolbarCommandCatalog = Readonly<{
  commandIds: ReadonlySet<string>;
  creationCommandIds: ReadonlySet<string>;
  toolbarCommandIds: ReadonlySet<string>;
}>;

export function createWorkspaceToolbarCommandCatalog(
  commands: ReadonlyArray<WorkspaceToolbarCommandSummary>,
  creationCommands: ReadonlyArray<{ id: string }>,
): WorkspaceToolbarCommandCatalog {
  return Object.freeze({
    commandIds: new Set(commands.map((command) => command.id)),
    creationCommandIds: new Set(creationCommands.map((command) => command.id)),
    toolbarCommandIds: new Set(
      commands
        .filter(
          (command) =>
            command.scope === TOOLBAR_SCOPE &&
            command.surfaces.includes(TOOLBAR_SURFACE),
        )
        .map((command) => command.id),
    ),
  });
}

function assertContributionCommand(
  contribution: WorkspaceToolbarContribution,
  catalog: WorkspaceToolbarCommandCatalog,
): void {
  const { commandId, kind } = contribution;
  if (typeof commandId !== "string" || commandId.trim() === "") {
    throw new Error(
      `Workspace toolbar contribution requires a command id, not ${JSON.stringify(commandId)}.`,
    );
  }
  if (kind === "creation") {
    if (!catalog.creationCommandIds.has(commandId)) {
      throw new Error(
        `Workspace toolbar contribution names unregistered creation command ${commandId}.`,
      );
    }
    return;
  }
  if (!catalog.commandIds.has(commandId)) {
    throw new Error(
      `Workspace toolbar contribution names unregistered command ${commandId}.`,
    );
  }
  if (!catalog.toolbarCommandIds.has(commandId)) {
    throw new Error(
      `Workspace command ${commandId} cannot be contributed because it does not offer the toolbar surface in the pane scope.`,
    );
  }
}

function validateContribution(
  contribution: WorkspaceToolbarContribution,
  keys: Set<string>,
  catalog: WorkspaceToolbarCommandCatalog,
): WorkspaceToolbarContribution {
  if (!KINDS.includes(contribution.kind)) {
    throw new Error(
      `Workspace toolbar contribution has unknown kind ${JSON.stringify(contribution.kind)}.`,
    );
  }
  assertContributionCommand(contribution, catalog);
  const key = `${contribution.kind}:${contribution.commandId}`;
  if (keys.has(key)) {
    throw new Error(
      `Workspace toolbar contribution lists ${contribution.kind} ${contribution.commandId} twice.`,
    );
  }
  keys.add(key);
  if (!PLACEMENTS.includes(contribution.placement)) {
    throw new Error(
      `Workspace toolbar contribution ${contribution.commandId} has unknown placement ${JSON.stringify(contribution.placement)}.`,
    );
  }
  if (typeof contribution.icon !== "function") {
    throw new Error(
      `Workspace toolbar contribution ${contribution.commandId} requires an icon component.`,
    );
  }
  if (
    contribution.description !== undefined &&
    (typeof contribution.description !== "string" ||
      contribution.description.trim() === "")
  ) {
    throw new Error(
      `Workspace toolbar contribution ${contribution.commandId} description must be non-empty text.`,
    );
  }
  return Object.freeze({
    ...contribution,
    ...(contribution.description === undefined
      ? {}
      : { description: contribution.description.trim() }),
  });
}

export function assertWorkspaceToolbarContributions(
  contributions: ReadonlyArray<WorkspaceToolbarContribution>,
  catalog: WorkspaceToolbarCommandCatalog,
): ReadonlyArray<WorkspaceToolbarContribution> {
  const keys = new Set<string>();
  return Object.freeze(
    contributions.map((contribution) =>
      validateContribution(contribution, keys, catalog),
    ),
  );
}

export function getWorkspaceToolbarContributions(
  host: WorkspaceHost,
  placement?: WorkspaceToolbarPlacement,
): ReadonlyArray<WorkspaceToolbarContribution> {
  const registeredContributions = contributionsByHost.get(host) ?? [];
  if (placement === undefined) {
    return registeredContributions;
  }
  return registeredContributions.filter(
    (contribution) => contribution.placement === placement,
  );
}

export function setWorkspaceToolbarContributions(
  host: WorkspaceHost,
  contributions: ReadonlyArray<WorkspaceToolbarContribution>,
): void {
  contributionsByHost.set(host, contributions);
}
