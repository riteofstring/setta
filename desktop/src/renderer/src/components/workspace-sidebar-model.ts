import type { NavigatorItem, WorkspaceSummary } from "@generated/backend";

import type { ConversationNavigatorWorkspaceState } from "../stores/conversation-navigator-store";
import type { ConversationPaneWorkspaceState } from "../stores/conversation-pane-store";

export type SidebarNavigationCommand =
  | {
      nextExpanded: boolean;
      selectWorkspace: boolean;
      type: "activateWorkspace";
      workspaceId: string;
    }
  | { type: "closeWorkspace"; workspaceId: string }
  | { type: "loadMoreConversations"; workspaceId: string }
  | { type: "openRecentWorkspace"; rootPath: string; workspaceId: string }
  | {
      conversationId: string;
      title: string;
      type: "presentConversation";
      workspaceId: string;
    }
  | { type: "removeRecentWorkspace"; workspaceId: string };

export type SidebarNavigationItem =
  | {
      commands: {
        close: SidebarNavigationCommand;
        primary: SidebarNavigationCommand;
      };
      expanded: boolean;
      id: string;
      kind: "activeWorkspace";
      label: string;
      selected: boolean;
      workspace: WorkspaceSummary;
    }
  | {
      commands: { primary: SidebarNavigationCommand };
      focused: boolean;
      id: string;
      item: NavigatorItem;
      kind: "conversation";
      label: string;
      lineageParentTitle: string | null;
      openPaneCount: number;
    }
  | {
      id: string;
      kind: "conversationStatus";
      label: string;
      workspaceId: string;
    }
  | {
      commands: { primary: SidebarNavigationCommand };
      id: string;
      kind: "loadMoreConversations";
      label: string;
      loading: boolean;
      workspaceId: string;
    }
  | {
      commands: {
        primary: SidebarNavigationCommand;
        remove: SidebarNavigationCommand;
      };
      id: string;
      kind: "recentWorkspace";
      label: string;
      workspace: WorkspaceSummary;
    };

export interface SidebarNavigationInput {
  activeWorkspaces: readonly WorkspaceSummary[];
  conversationPanes: ReadonlyMap<string, ConversationPaneWorkspaceState>;
  conversationQuery: string;
  conversationWorkspaces: Readonly<Record<string, ConversationNavigatorWorkspaceState | undefined>>;
  expandedWorkspaceIds: ReadonlySet<string>;
  recentWorkspaces: readonly WorkspaceSummary[];
  selectedWorkspaceId: string;
}

export function selectSidebarNavigationItems({
  activeWorkspaces,
  conversationPanes,
  conversationQuery,
  conversationWorkspaces,
  expandedWorkspaceIds,
  recentWorkspaces,
  selectedWorkspaceId,
}: SidebarNavigationInput): SidebarNavigationItem[] {
  const items: SidebarNavigationItem[] = [];
  const activeWorkspaceIds = new Set(activeWorkspaces.map((workspace) => workspace.id));

  for (const workspace of activeWorkspaces) {
    const selected = workspace.id === selectedWorkspaceId;
    const expanded = expandedWorkspaceIds.has(workspace.id);
    items.push(activeWorkspaceItem(workspace, selected, expanded));
    if (expanded) {
      items.push(
        ...conversationItems(
          workspace.id,
          conversationWorkspaces[workspace.id],
          conversationPanes.get(workspace.id),
          conversationQuery,
        ),
      );
    }
  }

  for (const workspace of recentWorkspaces) {
    if (activeWorkspaceIds.has(workspace.id)) {
      continue;
    }
    items.push({
      commands: {
        primary: {
          rootPath: workspace.rootPath,
          type: "openRecentWorkspace",
          workspaceId: workspace.id,
        },
        remove: { type: "removeRecentWorkspace", workspaceId: workspace.id },
      },
      id: `recent-workspace:${workspace.id}`,
      kind: "recentWorkspace",
      label: workspace.displayName,
      workspace,
    });
  }

  return items;
}

function activeWorkspaceItem(
  workspace: WorkspaceSummary,
  selected: boolean,
  expanded: boolean,
): SidebarNavigationItem {
  return {
    commands: {
      close: { type: "closeWorkspace", workspaceId: workspace.id },
      primary: {
        nextExpanded: selected ? !expanded : true,
        selectWorkspace: !selected,
        type: "activateWorkspace",
        workspaceId: workspace.id,
      },
    },
    expanded,
    id: `active-workspace:${workspace.id}`,
    kind: "activeWorkspace",
    label: workspace.displayName,
    selected,
    workspace,
  };
}

function conversationItems(
  workspaceId: string,
  workspace: ConversationNavigatorWorkspaceState | undefined,
  panes: ConversationPaneWorkspaceState | undefined,
  query: string,
): SidebarNavigationItem[] {
  if (!workspace || (workspace.loading && workspace.items.length === 0)) {
    return [conversationStatusItem(workspaceId, "Loading conversations…")];
  }
  if (workspace.error && workspace.items.length === 0) {
    return [conversationStatusItem(workspaceId, workspace.error)];
  }
  const titlesByConversationId = new Map(
    workspace.items.map((item) => [item.conversation.id, item.conversation.title] as const),
  );
  const items = workspace.items.map((item) =>
    conversationItem(workspaceId, panes, item, titlesByConversationId),
  );
  appendConversationNavigationTail(items, workspaceId, workspace, query);
  return items;
}

function conversationItem(
  workspaceId: string,
  panes: ConversationPaneWorkspaceState | undefined,
  item: NavigatorItem,
  titlesByConversationId: ReadonlyMap<string, string>,
): SidebarNavigationItem {
  const conversationId = item.conversation.id;
  return {
    commands: {
      primary: {
        conversationId,
        title: item.conversation.title,
        type: "presentConversation",
        workspaceId,
      },
    },
    focused: panes?.focusedConversationId === conversationId,
    id: `conversation:${conversationId}`,
    item,
    kind: "conversation",
    label: item.conversation.title,
    lineageParentTitle: item.branch
      ? (titlesByConversationId.get(item.branch.parentConversationId) ?? null)
      : null,
    openPaneCount: panes?.paneIdsByConversationId.get(conversationId)?.length ?? 0,
  };
}

function appendConversationNavigationTail(
  items: SidebarNavigationItem[],
  workspaceId: string,
  workspace: ConversationNavigatorWorkspaceState,
  query: string,
): void {
  if (workspace.error) {
    items.push(conversationStatusItem(workspaceId, workspace.error));
  } else if (workspace.items.length === 0) {
    items.push(
      conversationStatusItem(
        workspaceId,
        query.trim() === "" ? "No conversations" : "No matching conversations",
      ),
    );
  }
  if (workspace.nextCursor) {
    items.push({
      commands: { primary: { type: "loadMoreConversations", workspaceId } },
      id: `conversation-more:${workspaceId}`,
      kind: "loadMoreConversations",
      label: workspace.loading ? "Loading older conversations…" : "Load older conversations",
      loading: workspace.loading,
      workspaceId,
    });
  }
}

function conversationStatusItem(workspaceId: string, label: string): SidebarNavigationItem {
  return {
    id: `conversation-status:${workspaceId}:${label}`,
    kind: "conversationStatus",
    label,
    workspaceId,
  };
}
