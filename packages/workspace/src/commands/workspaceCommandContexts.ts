import type {
  Position,
  WorkspaceItem,
  WorkspaceSection,
} from "../document/types";
import {
  cloneFrozenWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "../document/workspaceSnapshot";
import type {
  WorkspaceItemCommandContext,
  WorkspacePaneCommandContext,
  WorkspaceSectionCommandContext,
} from "./workspaceCommandTypes";
import type { WorkspaceHost } from "../workspaceHost";

const sectionSnapshots = new WeakMap<
  WorkspaceSection,
  WorkspaceSnapshot<WorkspaceSection>
>();
const itemSnapshots = new WeakMap<
  WorkspaceItem,
  WorkspaceSnapshot<WorkspaceItem>
>();

function getSectionSnapshot(
  section: WorkspaceSection,
): WorkspaceSnapshot<WorkspaceSection> {
  const cached = sectionSnapshots.get(section);
  if (cached) {
    return cached;
  }
  const snapshot = cloneFrozenWorkspaceSnapshot(section);
  sectionSnapshots.set(section, snapshot);
  return snapshot;
}

function getItemSnapshot(
  item: WorkspaceItem,
): WorkspaceSnapshot<WorkspaceItem> {
  const cached = itemSnapshots.get(item);
  if (cached) {
    return cached;
  }
  const snapshot = cloneFrozenWorkspaceSnapshot(item);
  itemSnapshots.set(item, snapshot);
  return snapshot;
}

export function createPaneCommandContext(
  host: WorkspaceHost,
  workspacePosition: Position | null,
): WorkspacePaneCommandContext {
  return Object.freeze({
    host,
    scope: "pane" as const,
    workspacePosition:
      workspacePosition === null
        ? null
        : cloneFrozenWorkspaceSnapshot(workspacePosition),
  });
}

export function createSectionCommandContext(
  host: WorkspaceHost,
  section: WorkspaceSection,
  selectedSections: ReadonlyArray<WorkspaceSection>,
): WorkspaceSectionCommandContext {
  return Object.freeze({
    host,
    scope: "section" as const,
    section: getSectionSnapshot(section),
    selectedSections: Object.freeze(selectedSections.map(getSectionSnapshot)),
  });
}

export function createItemCommandContext(
  host: WorkspaceHost,
  section: WorkspaceSection,
  item: WorkspaceItem,
): WorkspaceItemCommandContext {
  return Object.freeze({
    host,
    scope: "item" as const,
    section: getSectionSnapshot(section),
    item: getItemSnapshot(item),
  });
}

export function createLiveSectionCommandContext(
  host: WorkspaceHost,
  section: WorkspaceSection,
): WorkspaceSectionCommandContext {
  return { host, scope: "section", section, selectedSections: [section] };
}
