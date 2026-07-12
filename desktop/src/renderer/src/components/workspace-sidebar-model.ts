import type {
  ConversationListItem,
  WorkflowDefinition,
  WorkspaceSummary,
} from "@generated/backend";

export type SidebarNavigationCommand =
  | {
      nextExpanded: boolean;
      selectWorkspace: boolean;
      type: "activateWorkspace";
      workspaceId: string;
    }
  | { type: "createWorkspaceConversation"; workspaceId: string }
  | { type: "closeWorkspace"; workspaceId: string }
  | { type: "deleteConversation"; conversationId: string; workspaceId: string }
  | { type: "openRecentWorkspace"; rootPath: string; workspaceId: string }
  | { type: "removeRecentWorkspace"; workspaceId: string }
  | { type: "selectConversation"; conversationId: string; workspaceId: string }
  | { type: "selectWorkflowDefinition"; definitionId: string; workspaceId: string }
  | { type: "showMoreConversations" }
  | { type: "setConversationPinned"; conversationId: string; pinned: boolean; workspaceId: string };

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
        delete: SidebarNavigationCommand;
        pin: SidebarNavigationCommand;
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
      id: string;
      kind: "emptyWorkflowList";
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
    }
  | {
      id: string;
      kind: "sectionHeader";
      label: string;
      section: "conversations" | "workflows";
      workspaceId: string;
    }
  | {
      commands: {
        primary: SidebarNavigationCommand;
      };
      definition: WorkflowDefinition;
      id: string;
      kind: "workflowDefinition";
      label: string;
      selected: boolean;
    };

export interface SidebarNavigationInput {
  activeWorkspaces: WorkspaceSummary[];
  expandedWorkspaceIds: ReadonlySet<string>;
  recentWorkspaces: WorkspaceSummary[];
  selectedConversationId: string;
  selectedWorkflowDefinitionIdsByWorkspaceId: Record<string, string | undefined>;
  selectedWorkspaceId: string;
  visibleConversationLimit: number;
  workspaceConversationLists: Record<string, SidebarWorkspaceConversationList | undefined>;
  workspaceWorkflowDefinitionLists: Record<
    string,
    SidebarWorkspaceWorkflowDefinitionList | undefined
  >;
}

export interface SidebarWorkspaceConversationList {
  conversations: ConversationListItem[];
  error: string | null;
  loading: boolean;
}

export interface SidebarWorkspaceWorkflowDefinitionList {
  definitions: WorkflowDefinition[];
  error: string | null;
  loading: boolean;
}

export function selectSidebarNavigationItems({
  activeWorkspaces,
  expandedWorkspaceIds,
  recentWorkspaces,
  selectedConversationId,
  selectedWorkflowDefinitionIdsByWorkspaceId,
  selectedWorkspaceId,
  visibleConversationLimit,
  workspaceConversationLists,
  workspaceWorkflowDefinitionLists,
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
      const workflowRows = workflowItems({
        selectedWorkflowDefinitionId:
          selectedWorkflowDefinitionIdsByWorkspaceId[workspace.id] ?? "",
        workflowDefinitionList: workspaceWorkflowDefinitionLists[workspace.id],
        workspaceId: workspace.id,
      });
      const conversationRows = conversationItems({
        conversationList: workspaceConversationLists[workspace.id],
        selectedConversationId: selected ? selectedConversationId : "",
        visibleConversationLimit,
        workspaceId: workspace.id,
      });
      items.push(
        ...sectionedWorkspaceRows({
          conversationRows,
          workflowRows,
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

function sectionedWorkspaceRows({
  conversationRows,
  workflowRows,
  workspaceId,
}: {
  conversationRows: SidebarNavigationItem[];
  workflowRows: SidebarNavigationItem[];
  workspaceId: string;
}) {
  const items: SidebarNavigationItem[] = [];
  if (workflowRows.length > 0) {
    items.push(sectionHeaderItem(workspaceId, "workflows", "Workflows"), ...workflowRows);
  }
  if (conversationRows.length > 0) {
    items.push(
      sectionHeaderItem(workspaceId, "conversations", "Conversations"),
      ...conversationRows,
    );
  }
  return items;
}

function sectionHeaderItem(
  workspaceId: string,
  section: "conversations" | "workflows",
  label: string,
) {
  return {
    id: `section:${workspaceId}:${section}`,
    kind: "sectionHeader",
    label,
    section,
    workspaceId,
  } satisfies SidebarNavigationItem;
}

function workflowItems({
  selectedWorkflowDefinitionId,
  workflowDefinitionList,
  workspaceId,
}: {
  selectedWorkflowDefinitionId: string;
  workflowDefinitionList: SidebarWorkspaceWorkflowDefinitionList | undefined;
  workspaceId: string;
}) {
  if (
    !workflowDefinitionList ||
    (workflowDefinitionList.loading && workflowDefinitionList.definitions.length === 0)
  ) {
    return [];
  }
  if (workflowDefinitionList.error) {
    return [workflowStatusItem(workspaceId, workflowDefinitionList.error)];
  }
  if (workflowDefinitionList.definitions.length === 0) {
    return [workflowStatusItem(workspaceId, "No workflows")];
  }
  return workflowDefinitionList.definitions.map((definition) => ({
    commands: {
      primary: {
        definitionId: definition.id,
        type: "selectWorkflowDefinition",
        workspaceId,
      },
    },
    definition,
    id: `workflow:${definition.id}`,
    kind: "workflowDefinition",
    label: definition.name,
    selected: definition.id === selectedWorkflowDefinitionId,
  })) satisfies SidebarNavigationItem[];
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
      delete: {
        conversationId: conversation.conversation.id,
        type: "deleteConversation",
        workspaceId,
      },
      pin: {
        conversationId: conversation.conversation.id,
        pinned: conversation.pinnedAt === "",
        type: "setConversationPinned",
        workspaceId,
      },
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

function workflowStatusItem(workspaceId: string, label: string) {
  return {
    id: `workflow-empty:${workspaceId}`,
    kind: "emptyWorkflowList",
    label,
    workspaceId,
  } satisfies SidebarNavigationItem;
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
