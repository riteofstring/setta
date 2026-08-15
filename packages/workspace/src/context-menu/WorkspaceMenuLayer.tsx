import { useEffect } from "react";
import { useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionOrThrow, isGroupSection } from "../document/documentSelectors";
import {
  deleteSections,
  groupSections,
  setSectionsPositionLocked,
} from "../document/sectionMutations";
import { useWorkspaceDocument } from "../document/stores";
import { canUngroupWorkspaceSections } from "../document/ungroupSections";
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

function SectionActionMenu({
  invocation,
}: {
  invocation: Extract<WorkspaceMenuInvocation, { kind: "section" }>;
}) {
  const documentState = useWorkspaceDocument((state) => state);
  const capabilities = useWorkspaceCapabilities((state) => state);
  const sections = invocation.sectionIds.map((id) => getSectionOrThrow(documentState, id));
  const allLocked = sections.every((section) => section.positionAndSizeLocked);
  const canGroup = canGroupWorkspaceSections(documentState, sections);
  const hasGroupSelection = sections.some(isGroupSection);
  const canUngroup = canUngroupWorkspaceSections(documentState, sections);
  const packageEntries: ReadonlyArray<WorkspaceMenuEntry> = [
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
    ...(hasGroupSelection
      ? [
          {
            id: "workspace-ungroup",
            label: "Ungroup",
            disabled: !capabilities.canEditStructure || !canUngroup,
            onSelect: () => {
              closeWorkspaceMenu();
              ungroupSections(invocation.sectionIds);
            },
          },
        ]
      : []),
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
  const hostEntries = getHostActionEntries(invocation.context);
  return (
    <WorkspaceActionMenu
      ariaLabel={
        invocation.context.scope === "outline"
          ? "Workspace Outline section actions"
          : "Workspace section actions"
      }
      clientPoint={invocation.clientPoint}
      direction={invocation.direction}
      groups={[
        { entries: packageEntries },
        ...(hostEntries.length > 0 ? [{ entries: hostEntries }] : []),
      ]}
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
