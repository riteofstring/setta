import type {
  ConversationPaneResourceBinding,
  NavigatorItem,
  WorkspaceSession,
} from "@generated/backend";

import type { ConversationNavigatorWorkspaceState } from "../../stores/conversation-navigator-store";
import type { ConversationPaneWorkspaceState } from "../../stores/conversation-pane-store";

const defaultMasterConversationPickerLimit = 24;

export interface MasterConversationPickerItem {
  conversationId: string;
  focused: boolean;
  openPaneId: string | null;
  status: NavigatorItem["conversation"]["status"];
  title: string;
  updatedAt: string;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
}

interface MasterConversationPickerStatus {
  hasActiveWorkspaces: boolean;
  loading: boolean;
  message: string | null;
}

export interface MasterConversationPickerSelection {
  items: MasterConversationPickerItem[];
  status: MasterConversationPickerStatus;
}

export interface SelectMasterConversationPickerItemsInput {
  conversationPanes: ReadonlyMap<string, ConversationPaneWorkspaceState>;
  conversationWorkspaces: Readonly<Record<string, ConversationNavigatorWorkspaceState | undefined>>;
  limit?: number;
  query: string;
  session: WorkspaceSession | null;
}

export function selectMasterConversationPickerItems({
  conversationPanes,
  conversationWorkspaces,
  limit = defaultMasterConversationPickerLimit,
  query,
  session,
}: SelectMasterConversationPickerItemsInput): MasterConversationPickerSelection {
  const activeWorkspaces = session?.activeWorkspaces ?? [];
  const normalizedQuery = normalizePickerQuery(query);
  const items = activeWorkspaces.flatMap((workspace) => {
    const state = conversationWorkspaces[workspace.id];
    if (!state) {
      return [];
    }
    return state.items.flatMap((item) => {
      if (!pickerItemMatches(item, workspace.displayName, normalizedQuery)) {
        return [];
      }
      const conversationId = item.conversation.id;
      const pane = appLevelConversationPaneMatch({
        conversationId,
        conversationPanes,
        workspaceRootPath: workspace.rootPath,
      });
      return [
        {
          conversationId,
          focused: pane?.focused ?? false,
          openPaneId: pane?.paneId ?? null,
          status: item.conversation.status,
          title: item.conversation.title,
          updatedAt: item.conversation.updatedAt,
          workspaceId: workspace.id,
          workspaceName: workspace.displayName,
          workspaceRootPath: workspace.rootPath,
        },
      ];
    });
  });
  const sorted = items
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, Math.max(0, limit));
  return {
    items: sorted,
    status: pickerStatus({
      activeWorkspaceCount: activeWorkspaces.length,
      conversationWorkspaces,
      itemCount: sorted.length,
      query: normalizedQuery,
    }),
  };
}

function appLevelConversationPaneMatch({
  conversationId,
  conversationPanes,
  workspaceRootPath,
}: {
  conversationId: string;
  conversationPanes: ReadonlyMap<string, ConversationPaneWorkspaceState>;
  workspaceRootPath: string;
}): { focused: boolean; paneId: string } | null {
  for (const panes of conversationPanes.values()) {
    const paneId = panes.paneIdByConversationId.get(conversationId);
    if (!paneId) {
      continue;
    }
    const bindings = panes.resourceBindingsByConversationId.get(conversationId) ?? [];
    if (folderBindingRootPath(bindings) !== workspaceRootPath) {
      continue;
    }
    return {
      focused: panes.focusedConversationId === conversationId,
      paneId,
    };
  }
  return null;
}

function folderBindingRootPath(
  bindings: readonly ConversationPaneResourceBinding[],
): string | null {
  return bindings.find((binding) => binding.kind === "folder")?.folder.rootPath ?? null;
}

function pickerStatus({
  activeWorkspaceCount,
  conversationWorkspaces,
  itemCount,
  query,
}: {
  activeWorkspaceCount: number;
  conversationWorkspaces: Readonly<Record<string, ConversationNavigatorWorkspaceState | undefined>>;
  itemCount: number;
  query: string;
}): MasterConversationPickerStatus {
  const states = Object.values(conversationWorkspaces).filter(
    (state): state is ConversationNavigatorWorkspaceState => state !== undefined,
  );
  const loading = states.some((state) => state.loading);
  if (activeWorkspaceCount === 0) {
    return {
      hasActiveWorkspaces: false,
      loading,
      message: "No folders are open. Start a folderless conversation.",
    };
  }
  if (itemCount > 0) {
    return { hasActiveWorkspaces: true, loading, message: null };
  }
  if (loading) {
    return { hasActiveWorkspaces: true, loading, message: "Loading topic conversations..." };
  }
  if (query.length > 0) {
    return { hasActiveWorkspaces: true, loading, message: "No matching topic conversations." };
  }
  const error = states.find((state) => state.error)?.error ?? null;
  return {
    hasActiveWorkspaces: true,
    loading,
    message: error ?? "No topic conversations in open folders.",
  };
}

function pickerItemMatches(item: NavigatorItem, workspaceName: string, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  return normalizePickerQuery(`${item.conversation.title} ${workspaceName}`).includes(query);
}

function normalizePickerQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}
