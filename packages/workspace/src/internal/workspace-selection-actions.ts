import {
  deriveWorkspaceParentLookup,
  type WorkspaceCapabilities,
  type WorkspaceDocument,
} from "../core.js";
import {
  planWorkspaceRootStacking,
  workspaceRootStackingMatches,
  type WorkspaceRootStackingAction,
} from "./workspace-root-stacking.js";
import { normalizeWorkspaceSelectionRoots } from "./workspace-selection.js";

export type WorkspaceSelectionActionId =
  | "bring-forward"
  | "bring-to-front"
  | "delete"
  | "group"
  | "lock"
  | "send-backward"
  | "send-to-back"
  | "ungroup"
  | "unlock";

type WorkspaceSelectionAction = Readonly<{
  disabledReason: string | null;
  id: WorkspaceSelectionActionId;
  label: string;
}>;

export type WorkspaceSelectionActionPlan = Readonly<{
  actions: readonly WorkspaceSelectionAction[];
  sectionIds: readonly string[];
  summary: string;
}>;

const stackingActions = [
  ["bring-to-front", "Bring to front", "Selected sections are already at the front."],
  ["bring-forward", "Bring forward", "Selected sections cannot move farther forward."],
  ["send-backward", "Send backward", "Selected sections cannot move farther backward."],
  ["send-to-back", "Send to back", "Selected sections are already at the back."],
] as const satisfies readonly (readonly [
  action: WorkspaceRootStackingAction,
  label: string,
  unchangedReason: string,
])[];

function selectedNoun(count: number): "section" | "sections" {
  return count === 1 ? "section" : "sections";
}

function alreadyStateReason(count: number, state: "locked" | "unlocked"): string {
  return count === 1
    ? `The selected section is already ${state}.`
    : `All selected sections are already ${state}.`;
}

function layoutDisabledReason(capabilities: WorkspaceCapabilities): string | null {
  return capabilities.editLayout ? null : "Turn on layout editing to use this action.";
}

function structureDisabledReason(capabilities: WorkspaceCapabilities): string | null {
  return capabilities.editStructure ? null : "Turn on structure editing to use this action.";
}

function stackingActionItems(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
  capabilities: WorkspaceCapabilities,
): readonly WorkspaceSelectionAction[] {
  const selectionReason = sectionIds.length === 0 ? "Select at least one section." : null;
  const policyReason = layoutDisabledReason(capabilities);
  return stackingActions.map(([id, label, unchangedReason]) => {
    const plannedRoots = planWorkspaceRootStacking(document, sectionIds, id);
    return {
      disabledReason:
        selectionReason ??
        policyReason ??
        (workspaceRootStackingMatches(document.rootSections, plannedRoots)
          ? unchangedReason
          : null),
      id,
      label,
    };
  });
}

function groupDisabledReason(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
  capabilities: WorkspaceCapabilities,
): string {
  const policyReason = structureDisabledReason(capabilities);
  if (policyReason) {
    return policyReason;
  }
  if (sectionIds.length < 2) {
    return "Select at least two sibling sections to group.";
  }
  const parentLookup = deriveWorkspaceParentLookup(document);
  const parentIds = new Set(sectionIds.map((sectionId) => parentLookup.get(sectionId) ?? null));
  if (parentIds.size > 1) {
    return "Selected sections must share one parent to be grouped.";
  }
  return "Configure a group factory to group sections.";
}

function ungroupDisabledReason(
  sectionIds: readonly string[],
  capabilities: WorkspaceCapabilities,
): string {
  const policyReason = structureDisabledReason(capabilities);
  if (policyReason) {
    return policyReason;
  }
  return sectionIds.length === 1
    ? "Grouping actions are not configured for this workspace."
    : "Select one workspace group to ungroup.";
}

function stateActionItems(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
  capabilities: WorkspaceCapabilities,
): readonly WorkspaceSelectionAction[] {
  const noun = selectedNoun(sectionIds.length);
  const selectionReason = sectionIds.length === 0 ? "Select at least one section." : null;
  const policyReason = layoutDisabledReason(capabilities);
  const allLocked = sectionIds.every(
    (sectionId) => document.sections[sectionId]?.positionAndSizeLocked,
  );
  const allUnlocked = sectionIds.every(
    (sectionId) => !document.sections[sectionId]?.positionAndSizeLocked,
  );
  return [
    {
      disabledReason:
        selectionReason ??
        policyReason ??
        (allLocked ? alreadyStateReason(sectionIds.length, "locked") : null),
      id: "lock",
      label: `Lock ${noun}`,
    },
    {
      disabledReason:
        selectionReason ??
        policyReason ??
        (allUnlocked ? alreadyStateReason(sectionIds.length, "unlocked") : null),
      id: "unlock",
      label: `Unlock ${noun}`,
    },
  ];
}

export function planWorkspaceSelectionActions(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
  capabilities: WorkspaceCapabilities,
): WorkspaceSelectionActionPlan {
  const sectionIds = normalizeWorkspaceSelectionRoots(document, selectedSectionIds);
  const noun = selectedNoun(sectionIds.length);
  const actions: readonly WorkspaceSelectionAction[] = [
    ...stateActionItems(document, sectionIds, capabilities),
    ...stackingActionItems(document, sectionIds, capabilities),
    {
      disabledReason: groupDisabledReason(document, sectionIds, capabilities),
      id: "group",
      label: "Group sections",
    },
    {
      disabledReason: ungroupDisabledReason(sectionIds, capabilities),
      id: "ungroup",
      label: "Ungroup section",
    },
    {
      disabledReason:
        sectionIds.length === 0
          ? "Select at least one section."
          : structureDisabledReason(capabilities),
      id: "delete",
      label: `Delete ${noun}`,
    },
  ];
  return {
    actions,
    sectionIds,
    summary: `${String(sectionIds.length)} ${noun} selected`,
  };
}
