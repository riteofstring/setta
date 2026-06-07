import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";

export type SidebarNavigationCommand =
  | {
      nextExpanded: boolean;
      selectWorkspace: boolean;
      type: "activateWorkspace";
      workspaceId: string;
    }
  | { type: "createWorkspaceConversation"; workspaceId: string }
  | { type: "closeWorkspace"; workspaceId: string }
  | { type: "openRecentWorkspace"; rootPath: string; workspaceId: string }
  | { type: "removeRecentWorkspace"; workspaceId: string }
  | { type: "selectConversation"; conversationId: string; workspaceId: string }
  | { type: "showMoreConversations" };

export type SidebarNavigationItem =
  | {
      commands: {
        close: SidebarNavigationCommand;
        createConversation: SidebarNavigationCommand;
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
      commands: {
        primary: SidebarNavigationCommand;
      };
      conversation: ConversationListItem;
      id: string;
      kind: "conversation";
      label: string;
      selected: boolean;
      unread: boolean;
    }
  | {
      id: string;
      kind: "emptyConversationList";
      label: string;
      workspaceId: string;
    }
  | {
      commands: {
        primary: SidebarNavigationCommand;
      };
      hiddenCount: number;
      id: string;
      kind: "moreConversations";
      label: string;
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
  activeWorkspaces: WorkspaceSummary[];
  expandedWorkspaceIds: ReadonlySet<string>;
  recentWorkspaces: WorkspaceSummary[];
  selectedConversationId: string;
  selectedWorkspaceId: string;
  visibleConversationLimit: number;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationList | undefined>;
}

export interface SidebarWorkspaceConversationList {
  conversations: ConversationListItem[];
  error: string | null;
  loading: boolean;
}

export function selectSidebarNavigationItems({
  activeWorkspaces,
  expandedWorkspaceIds,
  recentWorkspaces,
  selectedConversationId,
  selectedWorkspaceId,
  visibleConversationLimit,
  workspaceConversationLists,
}: SidebarNavigationInput): SidebarNavigationItem[] {
  const items: SidebarNavigationItem[] = [];
  const activeWorkspaceIds = new Set(activeWorkspaces.map((workspace) => workspace.id));

  for (const workspace of activeWorkspaces) {
    const selected = workspace.id === selectedWorkspaceId;
    const expanded = expandedWorkspaceIds.has(workspace.id);
    items.push({
      commands: {
        close: { type: "closeWorkspace", workspaceId: workspace.id },
        createConversation: { type: "createWorkspaceConversation", workspaceId: workspace.id },
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
    });

    if (expanded) {
      items.push(
        ...conversationItems({
          conversationList: workspaceConversationLists[workspace.id],
          selectedConversationId: selected ? selectedConversationId : "",
          visibleConversationLimit,
          workspaceId: workspace.id,
        }),
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

function conversationItems({
  conversationList,
  selectedConversationId,
  visibleConversationLimit,
  workspaceId,
}: {
  conversationList: SidebarWorkspaceConversationList | undefined;
  selectedConversationId: string;
  visibleConversationLimit: number;
  workspaceId: string;
}) {
  if (
    !conversationList ||
    (conversationList.loading && conversationList.conversations.length === 0)
  ) {
    return [];
  }
  if (conversationList.error) {
    return [conversationStatusItem(workspaceId, conversationList.error)];
  }
  const { conversations } = conversationList;
  if (conversations.length === 0) {
    return [conversationStatusItem(workspaceId, "No chats")];
  }

  const visibleCount = visibleConversationCount(
    conversations,
    selectedConversationId,
    visibleConversationLimit,
  );
  const visibleConversations = conversations.slice(0, visibleCount);
  const items: SidebarNavigationItem[] = visibleConversations.map((conversation) => ({
    commands: {
      primary: {
        conversationId: conversation.conversation.id,
        type: "selectConversation",
        workspaceId,
      },
    },
    conversation,
    id: `conversation:${conversation.conversation.id}`,
    kind: "conversation",
    label: conversation.conversation.title,
    selected: conversation.conversation.id === selectedConversationId,
    unread: conversation.latestReadRelevantMarker > conversation.readMarker,
  }));

  if (visibleCount < conversations.length) {
    items.push({
      commands: {
        primary: { type: "showMoreConversations" },
      },
      hiddenCount: conversations.length - visibleCount,
      id: `conversation-more:${workspaceId}`,
      kind: "moreConversations",
      label: "More chats",
      workspaceId,
    });
  }

  return items;
}

function conversationStatusItem(workspaceId: string, label: string) {
  return {
    id: `conversation-empty:${workspaceId}`,
    kind: "emptyConversationList",
    label,
    workspaceId,
  } satisfies SidebarNavigationItem;
}

function visibleConversationCount(
  conversations: ConversationListItem[],
  selectedConversationId: string,
  visibleConversationLimit: number,
) {
  const safeLimit = Math.max(0, visibleConversationLimit);
  const selectedIndex = conversations.findIndex(
    (item) => item.conversation.id === selectedConversationId,
  );
  if (selectedIndex >= safeLimit) {
    return Math.min(conversations.length, selectedIndex + 1);
  }
  return Math.min(conversations.length, safeLimit);
}
