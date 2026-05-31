import type { ConversationListItem, WorkspaceSummary } from "@generated/backend";

export type SidebarNavigationCommand =
  | {
      nextExpandedWorkspaceId: string;
      selectWorkspace: boolean;
      type: "activateWorkspace";
      workspaceId: string;
    }
  | { type: "createWorkspaceConversation"; workspaceId: string }
  | { type: "closeWorkspace"; workspaceId: string }
  | { type: "openRecentWorkspace"; rootPath: string; workspaceId: string }
  | { type: "removeRecentWorkspace"; workspaceId: string }
  | { type: "selectConversation"; conversationId: string }
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
  conversations: ConversationListItem[];
  expandedWorkspaceId: string;
  recentWorkspaces: WorkspaceSummary[];
  selectedConversationId: string;
  selectedWorkspaceId: string;
  visibleConversationLimit: number;
}

export function selectSidebarNavigationItems({
  activeWorkspaces,
  conversations,
  expandedWorkspaceId,
  recentWorkspaces,
  selectedConversationId,
  selectedWorkspaceId,
  visibleConversationLimit,
}: SidebarNavigationInput): SidebarNavigationItem[] {
  const items: SidebarNavigationItem[] = [];
  const activeWorkspaceIds = new Set(activeWorkspaces.map((workspace) => workspace.id));

  for (const workspace of activeWorkspaces) {
    const selected = workspace.id === selectedWorkspaceId;
    const expanded = workspace.id === expandedWorkspaceId;
    items.push({
      commands: {
        close: { type: "closeWorkspace", workspaceId: workspace.id },
        createConversation: { type: "createWorkspaceConversation", workspaceId: workspace.id },
        primary: {
          nextExpandedWorkspaceId: expanded ? "" : workspace.id,
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

    if (selected && expanded) {
      items.push(
        ...conversationItems({
          conversations,
          selectedConversationId,
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
  conversations,
  selectedConversationId,
  visibleConversationLimit,
  workspaceId,
}: {
  conversations: ConversationListItem[];
  selectedConversationId: string;
  visibleConversationLimit: number;
  workspaceId: string;
}) {
  if (conversations.length === 0) {
    return [
      {
        id: `conversation-empty:${workspaceId}`,
        kind: "emptyConversationList",
        label: "No chats",
        workspaceId,
      } satisfies SidebarNavigationItem,
    ];
  }

  const visibleCount = visibleConversationCount(
    conversations,
    selectedConversationId,
    visibleConversationLimit,
  );
  const visibleConversations = conversations.slice(0, visibleCount);
  const items: SidebarNavigationItem[] = visibleConversations.map((conversation) => ({
    commands: {
      primary: { conversationId: conversation.conversation.id, type: "selectConversation" },
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
