import { useEffect } from "react";
import { useReactFlow } from "../canvas/store";
import {
  useWorkspaceCommandEntries,
  type WorkspaceCommandEntry,
} from "../commands/workspaceCommandResolution";
import type { WorkspaceCommandSurface } from "../commands/workspaceCommandTypes";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getWorkspaceCreationCommands } from "./creationCommandStore";
import { WorkspaceActionMenu, type WorkspaceMenuEntry } from "./WorkspaceMenuCore";
import {
  closeWorkspaceMenu,
  useWorkspaceMenuState,
  type WorkspaceMenuInvocation,
} from "./workspaceMenuState";
import { WorkspacePaneMenu } from "./WorkspacePaneMenu";

// Menus render whatever the command registry offers for their surface: package commands first,
// host commands in their own group, both invoked through the same execution path.
function toMenuEntry(entry: WorkspaceCommandEntry): WorkspaceMenuEntry {
  return {
    id: entry.id,
    label: entry.label,
    ...(entry.icon ? { icon: entry.icon } : {}),
    ...(entry.checked === null ? {} : { checked: entry.checked }),
    ...(entry.disabledReason === null ? {} : { description: entry.disabledReason }),
    disabled: entry.disabled,
    onSelect: () => {
      closeWorkspaceMenu();
      entry.run();
    },
  };
}

function getMenuGroups(
  entries: ReadonlyArray<WorkspaceCommandEntry>,
): Array<{ entries: ReadonlyArray<WorkspaceMenuEntry> }> {
  const groups: Array<{ entries: ReadonlyArray<WorkspaceMenuEntry> }> = [];
  for (const origin of ["package", "host"] as const) {
    const originEntries = entries.filter((entry) => entry.origin === origin).map(toMenuEntry);
    if (originEntries.length > 0) {
      groups.push({ entries: originEntries });
    }
  }
  return groups;
}

type SectionMenuInvocation = Extract<WorkspaceMenuInvocation, { kind: "section" }>;

function getSectionMenuAriaLabel(surface: SectionMenuInvocation["surface"]): string {
  return surface === "outline" ? "Workspace Outline section actions" : "Workspace section actions";
}

function SectionActionMenu({ invocation }: { invocation: SectionMenuInvocation }) {
  const entries = useWorkspaceCommandEntries(invocation.surface, [invocation.context]);
  return (
    <WorkspaceActionMenu
      ariaLabel={getSectionMenuAriaLabel(invocation.surface)}
      clientPoint={invocation.clientPoint}
      direction={invocation.direction}
      groups={getMenuGroups(entries)}
      initialFocus={invocation.initialFocus}
      invocationSequence={invocation.sequence}
      kind="section"
    />
  );
}

type ItemMenuInvocation = Extract<WorkspaceMenuInvocation, { kind: "item" }>;

const ITEM_MENU_SURFACE: WorkspaceCommandSurface = "context-menu";

function ItemActionMenu({ invocation }: { invocation: ItemMenuInvocation }) {
  const entries = useWorkspaceCommandEntries(ITEM_MENU_SURFACE, [invocation.context]);
  return (
    <WorkspaceActionMenu
      ariaLabel="Workspace item actions"
      clientPoint={invocation.clientPoint}
      direction={invocation.direction}
      groups={getMenuGroups(entries)}
      invocationSequence={invocation.sequence}
      kind="item"
    />
  );
}

type PaneMenuInvocation = Extract<WorkspaceMenuInvocation, { kind: "pane" }>;

function PaneActionMenu({
  canEditStructure,
  invocation,
}: {
  canEditStructure: boolean;
  invocation: PaneMenuInvocation;
}) {
  const entries = useWorkspaceCommandEntries("context-menu", [invocation.context]);
  return (
    <WorkspacePaneMenu
      actions={entries.map(toMenuEntry)}
      canEditStructure={canEditStructure}
      commands={getWorkspaceCreationCommands()}
      invocation={invocation}
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
      <PaneActionMenu
        canEditStructure={canEditStructure}
        invocation={invocation}
        key={invocation.sequence}
      />
    );
  }
  if (invocation.kind === "section") {
    return <SectionActionMenu invocation={invocation} />;
  }
  return <ItemActionMenu invocation={invocation} />;
}
