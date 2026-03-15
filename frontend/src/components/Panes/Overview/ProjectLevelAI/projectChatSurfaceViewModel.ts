import type { ProjectChatAuxView } from "state/definitions";

export const PROJECT_CHAT_CONTENT_SHELL_CLASS =
  "mx-auto w-full max-w-[72rem] px-2";

export type ProjectChatAuxTabId = Exclude<ProjectChatAuxView, "none">;

export type ProjectChatAuxTabDescriptor = {
  id: ProjectChatAuxTabId;
  label: string;
  testId: string;
  active: boolean;
};

type ResolveProjectChatConversationSearchIndexInput = {
  conversationSearchMatchCount: number;
  currentIndex: number | null;
};

type ResolveProjectChatConversationSearchIndexAfterQueryChangeInput =
  ResolveProjectChatConversationSearchIndexInput & {
    hasConversationSearchTerms: boolean;
  };

export function buildProjectChatAuxTabs(
  projectChatAuxView: ProjectChatAuxView,
): Array<ProjectChatAuxTabDescriptor> {
  return [
    {
      id: "skills",
      label: "Skills",
      testId: "project-chat-aux-tab-skills",
      active: projectChatAuxView === "skills",
    },
    {
      id: "mcp",
      label: "MCP",
      testId: "project-chat-aux-tab-mcp",
      active: projectChatAuxView === "mcp",
    },
    {
      id: "slash_commands",
      label: "Slash Commands",
      testId: "project-chat-aux-tab-slash-commands",
      active: projectChatAuxView === "slash_commands",
    },
    {
      id: "ai_settings",
      label: "AI Settings",
      testId: "project-chat-aux-tab-ai-settings",
      active: projectChatAuxView === "ai_settings",
    },
  ];
}

export function getProjectChatReturnTooltipContent(
  projectChatAuxView: ProjectChatAuxView,
): string {
  switch (projectChatAuxView) {
    case "skills":
      return "Leave Skills and reopen chat.";
    case "mcp":
      return "Leave MCP and reopen chat.";
    case "slash_commands":
      return "Leave Slash Commands and reopen chat.";
    case "ai_settings":
      return "Leave AI Settings and reopen chat.";
    default:
      return "Close threads-only view and reopen chat.";
  }
}

export function getProjectChatThreadsTooltipContent(
  showingInlineThreads: boolean,
): string {
  return showingInlineThreads
    ? "Collapse the threads list."
    : "Open the threads list.";
}

export function resolveProjectChatConversationSearchIndexAfterQueryChange({
  hasConversationSearchTerms,
  conversationSearchMatchCount,
  currentIndex,
}: ResolveProjectChatConversationSearchIndexAfterQueryChangeInput):
  | number
  | null {
  if (!hasConversationSearchTerms) {
    return null;
  }
  if (conversationSearchMatchCount === 0) {
    return null;
  }
  return currentIndex === null ? 0 : currentIndex;
}

export function resolveProjectChatConversationSearchIndexAfterCountChange({
  conversationSearchMatchCount,
  currentIndex,
}: ResolveProjectChatConversationSearchIndexInput): number | null {
  if (conversationSearchMatchCount === 0) {
    return null;
  }
  if (currentIndex === null) {
    return 0;
  }
  if (currentIndex >= conversationSearchMatchCount) {
    return conversationSearchMatchCount - 1;
  }
  return currentIndex;
}

export function buildProjectChatConversationSearchCounterText({
  conversationSearchMatchCount,
  conversationSearchMatchIndex,
}: {
  conversationSearchMatchCount: number;
  conversationSearchMatchIndex: number | null;
}): string {
  if (
    conversationSearchMatchCount > 0 &&
    conversationSearchMatchIndex !== null
  ) {
    return `${conversationSearchMatchIndex + 1}/${conversationSearchMatchCount}`;
  }
  return `0/${conversationSearchMatchCount}`;
}
