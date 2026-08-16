import { getReactFlowStore } from "../canvas/store";
import { getItemDndStateStore } from "../dnd/itemDndState";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { isGroupSection } from "../document/documentSelectors";
import { getWorkspaceItemFactory } from "../document/sectionKindRegistry";
import {
  deleteSections,
  groupSections,
  setSectionsPositionLocked,
} from "../document/sectionMutations";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import type {
  WorkspaceSection,
  WorkspaceSectionItemTree,
} from "../document/types";
import { canUngroupWorkspaceSections } from "../document/ungroupSections";
import {
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  deleteWorkspaceItems,
  insertWorkspaceItem,
} from "../items/itemAuthoringActions";
import { setGroupOverflowMode } from "../section/groupOverflowAction";
import { ungroupSections } from "../section/ungroupAction";
import { canGroupWorkspaceSections } from "../shell/workspaceInspectorModel";
import type {
  WorkspaceItemCommandContext,
  WorkspacePackageCommandDefinition,
  WorkspaceSectionCommandContext,
} from "./workspaceCommandTypes";

const MISSING_SECTION_REASON =
  "This section is no longer part of the workspace.";
const MISSING_ITEM_REASON = "This parameter is no longer part of the section.";
const STRUCTURE_REASON = "Structural editing is disabled in this workspace.";
const LAYOUT_REASON = "Layout editing is disabled in this workspace.";
const ITEM_DRAG_REASON =
  "Finish the parameter drag before adding or deleting parameters.";
const SECTION_LOCKED_REASON =
  "Unlock this section to add or delete parameters.";

// A command context names its target; the current document, capabilities, and drag state decide
// whether the command applies and whether it can run. Resolving both from live state keeps an
// open menu, the Inspector, and a keyboard chord in agreement while the workspace changes.
type LiveSectionTargets = {
  complete: boolean;
  section: WorkspaceSection | null;
  sections: ReadonlyArray<WorkspaceSection>;
  state: WorkspaceDocumentState;
};

function getLiveSectionTargets(
  context: WorkspaceSectionCommandContext,
): LiveSectionTargets {
  const state = getWorkspaceDocumentStore(context.host).getState();
  const sections = context.selectedSections.flatMap((selected) => {
    const section = state.sections[selected.id];
    return section ? [section] : [];
  });
  return {
    complete: sections.length === context.selectedSections.length,
    section: state.sections[context.section.id] ?? null,
    sections,
    state,
  };
}

function getLiveItemSection(
  context: WorkspaceItemCommandContext,
): WorkspaceSection | null {
  return (
    getWorkspaceDocumentStore(context.host).getState().sections[
      context.section.id
    ] ?? null
  );
}

function getStructureReason(host: WorkspaceSectionCommandContext["host"]): string | null {
  return getWorkspaceCapabilitiesStore(host).getState().canEditStructure
    ? null
    : STRUCTURE_REASON;
}

function getLayoutReason(host: WorkspaceSectionCommandContext["host"]): string | null {
  return getWorkspaceCapabilitiesStore(host).getState().canEditLayout
    ? null
    : LAYOUT_REASON;
}

function getSelectedSectionIds(
  context: WorkspaceSectionCommandContext,
): Array<string> {
  return context.selectedSections.map((section) => section.id);
}

function areAllSectionsLocked(targets: LiveSectionTargets): boolean {
  return (
    targets.complete &&
    targets.sections.length > 0 &&
    targets.sections.every((section) => section.positionAndSizeLocked)
  );
}

function formatSectionCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

// Item authoring shares one precondition set: the host allows structural edits, no parameter drag
// is in flight, and the owning section is unlocked.
function getItemAuthoringReason(
  host: WorkspaceSectionCommandContext["host"],
  section: WorkspaceSection | null,
): string | null {
  const structureReason = getStructureReason(host);
  if (structureReason) {
    return structureReason;
  }
  if (!section) {
    return MISSING_SECTION_REASON;
  }
  if (getItemDndStateStore(host).getState().activeId !== null) {
    return ITEM_DRAG_REASON;
  }
  return section.positionAndSizeLocked ? SECTION_LOCKED_REASON : null;
}

function getLiveItemTree(
  section: WorkspaceSection | null,
): WorkspaceSectionItemTree | null {
  return section?.itemTree ?? null;
}

function getRootItemCount(itemTree: WorkspaceSectionItemTree): number {
  return itemTree.items[itemTree.rootId]?.children.length ?? 0;
}

function hasSectionItemTree(context: WorkspaceSectionCommandContext): boolean {
  return getLiveItemTree(getLiveSectionTargets(context).section) !== null;
}

function getSelectedItemCount(context: WorkspaceSectionCommandContext): number {
  return (
    getLiveItemTree(getLiveSectionTargets(context).section)?.selectedItemIds
      .length ?? 0
  );
}

const groupSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.group-sections",
  scope: "section",
  surfaces: ["context-menu", "inspector", "outline"],
  label: "Group",
  getDisabledReason: (context) => {
    const structureReason = getStructureReason(context.host);
    if (structureReason) {
      return structureReason;
    }
    const targets = getLiveSectionTargets(context);
    if (!targets.complete) {
      return MISSING_SECTION_REASON;
    }
    if (targets.sections.length < 2) {
      return "Grouping needs at least two selected sections.";
    }
    return canGroupWorkspaceSections(targets.state, targets.sections)
      ? null
      : "Grouping is unavailable because these sections do not share one parent.";
  },
  getStatusMessage: (context) =>
    `${formatSectionCount(context.selectedSections.length, "section")} grouped.`,
  run: (context) => {
    getReactFlowStore(context.host).setState({ nodesSelectionDims: null });
    groupSections(
      context.host,
      getSelectedSectionIds(context),
      `group-${crypto.randomUUID()}`,
    );
  },
};

const toggleGroupOverflowCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.toggle-group-overflow",
  scope: "section",
  surfaces: ["context-menu", "header", "outline"],
  label: "Overflow Mode",
  // Frozen main offers the bounded/auto toggle for one group at a time. A header invocation always
  // carries its own section, so the same rule covers both surfaces.
  isApplicable: (context) => {
    const { section } = getLiveSectionTargets(context);
    return (
      context.selectedSections.length === 1 &&
      section !== null &&
      isGroupSection(section)
    );
  },
  isChecked: (context) =>
    getLiveSectionTargets(context).section?.overflowMode ?? false,
  getDisabledReason: (context) => {
    const layoutReason = getLayoutReason(context.host);
    if (layoutReason) {
      return layoutReason;
    }
    const { section } = getLiveSectionTargets(context);
    if (!section) {
      return MISSING_SECTION_REASON;
    }
    return section.positionAndSizeLocked
      ? "Unlock this section to change its overflow mode."
      : null;
  },
  run: (context) => {
    const { section } = getLiveSectionTargets(context);
    if (!section) {
      throw new Error(
        `Cannot change overflow mode for missing section ${context.section.id}.`,
      );
    }
    setGroupOverflowMode(context.host, section.id, !section.overflowMode);
  },
};

const ungroupSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.ungroup-sections",
  scope: "section",
  surfaces: ["context-menu", "header", "inspector", "outline"],
  label: "Ungroup",
  isApplicable: (context) =>
    getLiveSectionTargets(context).sections.some(isGroupSection),
  getDisabledReason: (context) => {
    const structureReason = getStructureReason(context.host);
    if (structureReason) {
      return structureReason;
    }
    const targets = getLiveSectionTargets(context);
    return targets.complete &&
      canUngroupWorkspaceSections(targets.state, targets.sections)
      ? null
      : "Ungrouping is unavailable because every selected section must be an unlocked group.";
  },
  getStatusMessage: (context) =>
    context.selectedSections.length === 1
      ? "Group ungrouped."
      : `${context.selectedSections.length} groups ungrouped.`,
  run: (context) => ungroupSections(context.host, getSelectedSectionIds(context)),
};

const deleteSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.delete-sections",
  scope: "section",
  tone: "danger",
  surfaces: ["context-menu", "inspector", "outline"],
  label: "Delete",
  getDisabledReason: (context) => {
    const structureReason = getStructureReason(context.host);
    if (structureReason) {
      return structureReason;
    }
    return getLiveSectionTargets(context).complete
      ? null
      : MISSING_SECTION_REASON;
  },
  getStatusMessage: (context) =>
    `${formatSectionCount(context.selectedSections.length, "section")} deleted.`,
  run: (context) => {
    getReactFlowStore(context.host).setState({ nodesSelectionDims: null });
    deleteSections(context.host, getSelectedSectionIds(context));
  },
};

// Locking and unlocking are separate commands so every surface can show one stable label instead
// of a label that depends on the selection.
const lockSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.lock-sections",
  scope: "section",
  surfaces: ["context-menu", "outline"],
  label: "Lock Position & Size",
  isApplicable: (context) =>
    !areAllSectionsLocked(getLiveSectionTargets(context)),
  getDisabledReason: (context) => getLayoutReason(context.host),
  getStatusMessage: (context) =>
    `${formatSectionCount(context.selectedSections.length, "section")} locked.`,
  run: (context) =>
    setSectionsPositionLocked(context.host, getSelectedSectionIds(context), true),
};

const unlockSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.unlock-sections",
  scope: "section",
  surfaces: ["context-menu", "outline"],
  label: "Unlock Position & Size",
  isApplicable: (context) =>
    areAllSectionsLocked(getLiveSectionTargets(context)),
  getDisabledReason: (context) => getLayoutReason(context.host),
  getStatusMessage: (context) =>
    `${formatSectionCount(context.selectedSections.length, "section")} unlocked.`,
  run: (context) =>
    setSectionsPositionLocked(context.host, getSelectedSectionIds(context), false),
};

const insertItemCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.insert-item",
  scope: "section",
  surfaces: ["inspector-parameters"],
  label: "Add parameter",
  isApplicable: hasSectionItemTree,
  getDisabledReason: (context) => {
    const { section } = getLiveSectionTargets(context);
    const authoringReason = getItemAuthoringReason(context.host, section);
    if (authoringReason) {
      return authoringReason;
    }
    return section && getWorkspaceItemFactory(context.host, section)
      ? null
      : "This section does not support adding parameters.";
  },
  getStatusMessage: () => "Parameter added.",
  run: (context) => {
    insertWorkspaceItem(context.host, context.section.id);
  },
};

const deleteLastItemCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.delete-last-item",
  scope: "section",
  tone: "danger",
  surfaces: ["inspector-parameters"],
  label: "Remove last parameter",
  isApplicable: (context) =>
    hasSectionItemTree(context) && getSelectedItemCount(context) === 0,
  getDisabledReason: (context) => {
    const { section } = getLiveSectionTargets(context);
    const authoringReason = getItemAuthoringReason(context.host, section);
    if (authoringReason) {
      return authoringReason;
    }
    const itemTree = getLiveItemTree(section);
    return itemTree && getRootItemCount(itemTree) > 0
      ? null
      : "This section has no parameters to remove.";
  },
  getStatusMessage: () => "1 parameter deleted.",
  run: (context) => {
    deleteLastWorkspaceItem(context.host, context.section.id);
  },
};

const deleteSelectedItemsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.delete-selected-items",
  scope: "section",
  tone: "danger",
  surfaces: ["inspector-parameters"],
  label: "Delete selected parameters",
  isApplicable: (context) =>
    hasSectionItemTree(context) && getSelectedItemCount(context) > 1,
  getDisabledReason: (context) =>
    getItemAuthoringReason(context.host, getLiveSectionTargets(context).section),
  getStatusMessage: (context) =>
    `${getSelectedItemCount(context)} parameters deleted.`,
  run: (context) => {
    deleteSelectedWorkspaceItems(context.host, context.section.id);
  },
};

const deleteItemCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.delete-item",
  scope: "item",
  tone: "danger",
  surfaces: ["context-menu", "inspector-parameters"],
  label: "Delete parameter",
  getDisabledReason: (context) => {
    const section = getLiveItemSection(context);
    const authoringReason = getItemAuthoringReason(context.host, section);
    if (authoringReason) {
      return authoringReason;
    }
    return Object.hasOwn(section?.itemTree?.items ?? {}, context.item.id)
      ? null
      : MISSING_ITEM_REASON;
  },
  getStatusMessage: () => "1 parameter deleted.",
  run: (context) => {
    deleteWorkspaceItems(context.host, context.section.id, [context.item.id]);
  },
};

// Registration order is the order every surface offers these commands in.
export const builtInWorkspaceCommands: ReadonlyArray<WorkspacePackageCommandDefinition> =
  Object.freeze([
    groupSectionsCommand,
    toggleGroupOverflowCommand,
    ungroupSectionsCommand,
    deleteSectionsCommand,
    lockSectionsCommand,
    unlockSectionsCommand,
    insertItemCommand,
    deleteLastItemCommand,
    deleteSelectedItemsCommand,
    deleteItemCommand,
  ]);
