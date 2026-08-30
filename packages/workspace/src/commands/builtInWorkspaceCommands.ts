import { getReactFlowStore } from "../canvas/store";
import {
  autoLayoutTopLevelSections,
  getWorkspaceTopLevelAutoLayoutDisabledReason,
} from "../auto-layout/topLevelAutoLayout";
import {
  copyWorkspaceSelection,
  duplicateWorkspaceSelection,
  getWorkspaceClipboardAvailability,
  pasteWorkspaceClipboard,
} from "../clipboard/operations";
import { getItemDndStateStore } from "../dnd/itemDndState";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { isGroupSection } from "../document/documentSelectors";
import { getWorkspaceItemFactory } from "../document/sectionKindRegistry";
import {
  getWorkspaceHistoryState,
  redoWorkspace,
  undoWorkspace,
} from "../history/workspaceHistory";
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

function getStructureReason(
  host: WorkspaceSectionCommandContext["host"],
): string | null {
  return getWorkspaceCapabilitiesStore(host).getState().canEditStructure
    ? null
    : STRUCTURE_REASON;
}

function getLayoutReason(
  host: WorkspaceSectionCommandContext["host"],
): string | null {
  return getWorkspaceCapabilitiesStore(host).getState().canEditLayout
    ? null
    : LAYOUT_REASON;
}

function hasWorkspaceClipboardAuthority(
  host: WorkspaceSectionCommandContext["host"],
): boolean {
  return getWorkspaceClipboardAvailability(host).authority !== null;
}

function getWorkspaceClipboardDisabledReason(
  host: WorkspaceSectionCommandContext["host"],
  operation: "copy" | "duplicate" | "paste",
): string | null {
  return getWorkspaceClipboardAvailability(host)[operation].disabledReason;
}

const undoWorkspaceCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.undo",
  scope: "pane",
  surfaces: ["palette"],
  label: "Undo",
  getDisabledReason: (context) =>
    getWorkspaceHistoryState(context.host).undoDisabledReason ?? null,
  run: (context) => {
    undoWorkspace(context.host);
  },
};

const redoWorkspaceCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.redo",
  scope: "pane",
  surfaces: ["palette"],
  label: "Redo",
  getDisabledReason: (context) =>
    getWorkspaceHistoryState(context.host).redoDisabledReason ?? null,
  run: (context) => {
    redoWorkspace(context.host);
  },
};

const copySectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.copy-sections",
  scope: "section",
  surfaces: ["context-menu", "outline", "palette"],
  label: "Copy",
  keywords: ["clipboard"],
  isApplicable: (context) => hasWorkspaceClipboardAuthority(context.host),
  getDisabledReason: (context) =>
    getWorkspaceClipboardDisabledReason(context.host, "copy"),
  run: (context) => {
    void copyWorkspaceSelection(context.host);
  },
};

const pasteSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.paste-sections",
  scope: "pane",
  surfaces: ["context-menu", "palette"],
  label: "Paste",
  keywords: ["clipboard"],
  isApplicable: (context) => hasWorkspaceClipboardAuthority(context.host),
  getDisabledReason: (context) =>
    getWorkspaceClipboardDisabledReason(context.host, "paste"),
  run: (context) => {
    void pasteWorkspaceClipboard(context.host);
  },
};

const autoLayoutTopLevelCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.auto-layout-top-level",
  scope: "pane",
  surfaces: ["context-menu", "palette"],
  label: "Auto Layout",
  keywords: ["arrange", "pack", "layout"],
  getDisabledReason: (context) =>
    getWorkspaceTopLevelAutoLayoutDisabledReason(context.host),
  getStatusMessage: () => "Top-level sections arranged.",
  run: (context) => {
    autoLayoutTopLevelSections(context.host);
  },
};

const duplicateSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.duplicate-sections",
  scope: "section",
  surfaces: ["context-menu", "outline", "palette"],
  label: "Duplicate",
  keywords: ["copy", "clipboard"],
  isApplicable: (context) => hasWorkspaceClipboardAuthority(context.host),
  getDisabledReason: (context) =>
    getWorkspaceClipboardDisabledReason(context.host, "duplicate"),
  run: (context) => {
    void duplicateWorkspaceSelection(context.host);
  },
};

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
  surfaces: ["context-menu", "inspector", "outline", "palette"],
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
  surfaces: ["context-menu", "header", "outline", "palette"],
  label: "Overflow Mode",

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
  surfaces: ["context-menu", "header", "inspector", "outline", "palette"],
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
  run: (context) =>
    ungroupSections(context.host, getSelectedSectionIds(context)),
};

const deleteSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.delete-sections",
  scope: "section",
  tone: "danger",
  surfaces: ["context-menu", "inspector", "outline", "palette"],
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

const lockSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.lock-sections",
  scope: "section",
  surfaces: ["context-menu", "outline", "palette"],
  label: "Lock Position & Size",
  isApplicable: (context) =>
    !areAllSectionsLocked(getLiveSectionTargets(context)),
  getDisabledReason: (context) => getLayoutReason(context.host),
  getStatusMessage: (context) =>
    `${formatSectionCount(context.selectedSections.length, "section")} locked.`,
  run: (context) =>
    setSectionsPositionLocked(
      context.host,
      getSelectedSectionIds(context),
      true,
    ),
};

const unlockSectionsCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.unlock-sections",
  scope: "section",
  surfaces: ["context-menu", "outline", "palette"],
  label: "Unlock Position & Size",
  isApplicable: (context) =>
    areAllSectionsLocked(getLiveSectionTargets(context)),
  getDisabledReason: (context) => getLayoutReason(context.host),
  getStatusMessage: (context) =>
    `${formatSectionCount(context.selectedSections.length, "section")} unlocked.`,
  run: (context) =>
    setSectionsPositionLocked(
      context.host,
      getSelectedSectionIds(context),
      false,
    ),
};

const insertItemCommand: WorkspacePackageCommandDefinition = {
  id: "workspace.insert-item",
  scope: "section",
  surfaces: ["inspector-parameters", "palette"],
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
  surfaces: ["inspector-parameters", "palette"],
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
  surfaces: ["inspector-parameters", "palette"],
  label: "Delete selected parameters",
  isApplicable: (context) =>
    hasSectionItemTree(context) && getSelectedItemCount(context) > 1,
  getDisabledReason: (context) =>
    getItemAuthoringReason(
      context.host,
      getLiveSectionTargets(context).section,
    ),
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
  surfaces: ["context-menu", "inspector-parameters", "palette"],
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

export const builtInWorkspaceCommands: ReadonlyArray<WorkspacePackageCommandDefinition> =
  Object.freeze([
    undoWorkspaceCommand,
    redoWorkspaceCommand,
    copySectionsCommand,
    pasteSectionsCommand,
    autoLayoutTopLevelCommand,
    duplicateSectionsCommand,
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
