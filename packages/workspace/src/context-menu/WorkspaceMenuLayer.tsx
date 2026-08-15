import { useEffect } from "react";
import { useReactFlow } from "../canvas/store";
import {
  useWorkspaceCapabilities,
  type WorkspaceCapabilitiesState,
} from "../document/capabilities";
import { getSectionOrThrow, isGroupSection } from "../document/documentSelectors";
import {
  deleteSections,
  groupSections,
  setSectionsPositionLocked,
} from "../document/sectionMutations";
import { useWorkspaceDocument, type WorkspaceDocumentState } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { canUngroupWorkspaceSections } from "../document/ungroupSections";
import { setGroupOverflowMode } from "../section/groupOverflowAction";
import { ungroupSections } from "../section/ungroupAction";
import { canGroupWorkspaceSections } from "../shell/workspaceInspectorModel";
import { WorkspaceActionMenu, type WorkspaceMenuEntry } from "./WorkspaceMenuCore";
import { WorkspacePaneMenu } from "./WorkspacePaneMenu";
import { getWorkspaceCreationCommands, getWorkspaceMenuActions } from "./workspaceMenuRegistry";
import {
  closeWorkspaceMenu,
  useWorkspaceMenuState,
  type WorkspaceMenuInvocation,
} from "./workspaceMenuState";
import type {
  WorkspaceMenuActionContext,
  WorkspaceMenuActionDefinition,
} from "./workspaceMenuTypes";

function invokeHostAction(
  action: WorkspaceMenuActionDefinition,
  context: WorkspaceMenuActionContext,
): void {
  if (action.scope !== context.scope) {
    throw new Error(
      `Workspace menu action ${action.id} cannot receive ${context.scope} context for ${action.scope}.`,
    );
  }
  switch (action.scope) {
    case "pane":
      action.onSelect(context as Extract<WorkspaceMenuActionContext, { scope: "pane" }>);
      return;
    case "section":
      action.onSelect(context as Extract<WorkspaceMenuActionContext, { scope: "section" }>);
      return;
    case "item":
      action.onSelect(context as Extract<WorkspaceMenuActionContext, { scope: "item" }>);
      return;
    case "outline":
      action.onSelect(context as Extract<WorkspaceMenuActionContext, { scope: "outline" }>);
  }
}

function isHostActionDisabled(
  action: WorkspaceMenuActionDefinition,
  context: WorkspaceMenuActionContext,
): boolean {
  if (!action.isDisabled) {
    return false;
  }
  if (action.scope !== context.scope) {
    throw new Error(
      `Workspace menu action ${action.id} cannot test ${context.scope} context for ${action.scope}.`,
    );
  }
  switch (action.scope) {
    case "pane":
      return action.isDisabled(context as Extract<WorkspaceMenuActionContext, { scope: "pane" }>);
    case "section":
      return action.isDisabled(
        context as Extract<WorkspaceMenuActionContext, { scope: "section" }>,
      );
    case "item":
      return action.isDisabled(context as Extract<WorkspaceMenuActionContext, { scope: "item" }>);
    case "outline":
      return action.isDisabled(
        context as Extract<WorkspaceMenuActionContext, { scope: "outline" }>,
      );
  }
}

function getHostActionEntries(
  context: WorkspaceMenuActionContext,
): ReadonlyArray<WorkspaceMenuEntry> {
  return getWorkspaceMenuActions(context.scope).map((action) => ({
    id: `host-${action.scope}-${action.id}`,
    label: action.label,
    icon: action.icon,
    disabled: isHostActionDisabled(action, context),
    onSelect: () => {
      closeWorkspaceMenu();
      invokeHostAction(action, context);
    },
  }));
}

type SectionMenuInvocation = Extract<WorkspaceMenuInvocation, { kind: "section" }>;

type SectionMenuResolution = {
  capabilities: WorkspaceCapabilitiesState;
  documentState: WorkspaceDocumentState;
  invocation: SectionMenuInvocation;
  section: WorkspaceSection;
  sections: ReadonlyArray<WorkspaceSection>;
};

function getOverflowMenuEntry({
  capabilities,
  invocation,
  section,
}: SectionMenuResolution): WorkspaceMenuEntry | null {
  if (!isGroupSection(section)) {
    return null;
  }
  if (invocation.surface === "context-menu" && invocation.sectionIds.length !== 1) {
    return null;
  }
  return {
    id: "workspace-group-overflow",
    label: "Overflow Mode",
    checked: section.overflowMode,
    disabled: !capabilities.canEditLayout || section.positionAndSizeLocked,
    onSelect: () => {
      closeWorkspaceMenu();
      setGroupOverflowMode(section.id, !section.overflowMode);
    },
  };
}

function getUngroupMenuEntry({
  capabilities,
  documentState,
  invocation,
  section,
  sections,
}: SectionMenuResolution): WorkspaceMenuEntry | null {
  const applicable =
    invocation.surface === "header" ? isGroupSection(section) : sections.some(isGroupSection);
  if (!applicable) {
    return null;
  }
  return {
    id: "workspace-ungroup",
    label: "Ungroup",
    disabled:
      !capabilities.canEditStructure || !canUngroupWorkspaceSections(documentState, sections),
    onSelect: () => {
      closeWorkspaceMenu();
      ungroupSections(invocation.sectionIds);
    },
  };
}

function isWorkspaceMenuEntry(entry: WorkspaceMenuEntry | null): entry is WorkspaceMenuEntry {
  return entry !== null;
}

function getGroupMenuEntries(resolution: SectionMenuResolution): Array<WorkspaceMenuEntry> {
  return [getOverflowMenuEntry(resolution), getUngroupMenuEntry(resolution)].filter(
    isWorkspaceMenuEntry,
  );
}

function getContextMenuEntries(
  resolution: SectionMenuResolution,
  groupEntries: ReadonlyArray<WorkspaceMenuEntry>,
): ReadonlyArray<WorkspaceMenuEntry> {
  const { capabilities, documentState, invocation, sections } = resolution;
  const allLocked = sections.every((section) => section.positionAndSizeLocked);
  const canGroup = canGroupWorkspaceSections(documentState, sections);
  return [
    {
      id: "workspace-group",
      label: "Group",
      disabled: !capabilities.canEditStructure || !canGroup,
      onSelect: () => {
        closeWorkspaceMenu();
        useReactFlow.setState({ nodesSelectionDims: null });
        groupSections(invocation.sectionIds, `group-${crypto.randomUUID()}`);
      },
    },
    ...groupEntries,
    {
      id: "workspace-delete",
      label: "Delete",
      disabled: !capabilities.canEditStructure,
      onSelect: () => {
        closeWorkspaceMenu();
        useReactFlow.setState({ nodesSelectionDims: null });
        deleteSections(invocation.sectionIds);
      },
    },
    {
      id: "workspace-lock",
      label: allLocked ? "Unlock Position & Size" : "Lock Position & Size",
      disabled: !capabilities.canEditLayout,
      onSelect: () => {
        closeWorkspaceMenu();
        setSectionsPositionLocked(invocation.sectionIds, !allLocked);
      },
    },
  ];
}

function getPackageMenuEntries(
  invocation: SectionMenuInvocation,
  groupEntries: ReadonlyArray<WorkspaceMenuEntry>,
  contextEntries: ReadonlyArray<WorkspaceMenuEntry>,
): ReadonlyArray<WorkspaceMenuEntry> {
  return invocation.surface === "header" ? groupEntries : contextEntries;
}

function getSectionMenuGroups(
  packageEntries: ReadonlyArray<WorkspaceMenuEntry>,
  hostEntries: ReadonlyArray<WorkspaceMenuEntry>,
): Array<{ entries: ReadonlyArray<WorkspaceMenuEntry> }> {
  const groups: Array<{ entries: ReadonlyArray<WorkspaceMenuEntry> }> = [];
  if (packageEntries.length > 0) {
    groups.push({ entries: packageEntries });
  }
  if (hostEntries.length > 0) {
    groups.push({ entries: hostEntries });
  }
  return groups;
}

function getSectionMenuAriaLabel(context: SectionMenuInvocation["context"]): string {
  return context.scope === "outline"
    ? "Workspace Outline section actions"
    : "Workspace section actions";
}

function SectionActionMenu({ invocation }: { invocation: SectionMenuInvocation }) {
  const documentState = useWorkspaceDocument((state) => state);
  const capabilities = useWorkspaceCapabilities((state) => state);
  const sections = invocation.sectionIds.map((id) => getSectionOrThrow(documentState, id));
  const section = getSectionOrThrow(documentState, invocation.context.section.id);
  const resolution = { capabilities, documentState, invocation, section, sections };
  const groupEntries = getGroupMenuEntries(resolution);
  const contextEntries = getContextMenuEntries(resolution, groupEntries);
  const packageEntries = getPackageMenuEntries(invocation, groupEntries, contextEntries);
  const hostEntries = getHostActionEntries(invocation.context);
  return (
    <WorkspaceActionMenu
      ariaLabel={getSectionMenuAriaLabel(invocation.context)}
      clientPoint={invocation.clientPoint}
      direction={invocation.direction}
      groups={getSectionMenuGroups(packageEntries, hostEntries)}
      initialFocus={invocation.initialFocus}
      invocationSequence={invocation.sequence}
      kind="section"
    />
  );
}

export function WorkspaceMenuLayer() {
  const invocation = useWorkspaceMenuState((state) => state.invocation);
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const viewportGestureActive = useReactFlow(
    (state) => state.viewportInteractionActive || state.paneDragging,
  );

  useEffect(() => {
    if (viewportGestureActive) {
      closeWorkspaceMenu(false);
    }
  }, [viewportGestureActive]);

  useEffect(() => {
    return () => closeWorkspaceMenu(false);
  }, []);

  if (!invocation) {
    return null;
  }
  if (invocation.kind === "pane") {
    return (
      <WorkspacePaneMenu
        actions={getHostActionEntries(invocation.context)}
        canEditStructure={canEditStructure}
        commands={getWorkspaceCreationCommands()}
        invocation={invocation}
        key={invocation.sequence}
      />
    );
  }
  if (invocation.kind === "section") {
    return <SectionActionMenu invocation={invocation} />;
  }
  const hostEntries = getHostActionEntries(invocation.context);
  return (
    <WorkspaceActionMenu
      ariaLabel="Workspace item actions"
      clientPoint={invocation.clientPoint}
      direction={invocation.direction}
      groups={[{ entries: hostEntries }]}
      invocationSequence={invocation.sequence}
      kind="item"
    />
  );
}
