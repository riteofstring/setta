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

// Document objects are replaced rather than mutated, so one detached snapshot per version serves
// every command context that names it. Weak keys release the snapshot with the version it copied.
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

// Package applicability only reads its target, so presence checks that run on every paint — the
// section header trigger — can ask about the live section instead of detaching a snapshot for it.
// Host callbacks always receive the detached contexts built above.
export function createLiveSectionCommandContext(
  host: WorkspaceHost,
  section: WorkspaceSection,
): WorkspaceSectionCommandContext {
  return { host, scope: "section", section, selectedSections: [section] };
}
