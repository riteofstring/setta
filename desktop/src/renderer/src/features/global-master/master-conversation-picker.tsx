import {
  Archive,
  CircleAlert,
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { newConversationTitle } from "../easy-button/conversation-creation-command";
import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { useConversationPaneStore } from "../../stores/conversation-pane-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import {
  requestConversationPaneNavigation,
  type ConversationPanePresentationResult,
} from "../../workspace-layout/conversation-pane-coordinator";
import { emptyWorkspaceRuntimeId } from "../../workspace-layout/workspace-layout-area-runtime";
import {
  selectMasterConversationPickerItems,
  type MasterConversationPickerItem,
} from "./master-conversation-picker-model";

type MasterConversationPickerBusyState =
  | { type: "idle" }
  | { conversationId: string; type: "archiving" }
  | { type: "creating" }
  | { conversationId: string; type: "opening" };

export function MasterConversationPicker() {
  const [busy, setBusy] = useState<MasterConversationPickerBusyState>({ type: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const session = useWorkspaceStore((state) => state.session);
  const conversationWorkspaces = useConversationNavigatorStore((state) => state.workspaces);
  const upsertConversationSnapshot = useConversationNavigatorStore((state) => state.upsertSnapshot);
  const conversationPanes = useConversationPaneStore((state) => state.workspaces);
  const selection = useMemo(
    () =>
      selectMasterConversationPickerItems({
        conversationPanes,
        conversationWorkspaces,
        query,
        session,
      }),
    [conversationPanes, conversationWorkspaces, query, session],
  );
  const conversationsAvailable = conversationAPIAvailable();
  const canRunCommand = conversationsAvailable && busy.type === "idle";

  async function createFolderlessConversation() {
    if (!canRunCommand) {
      return;
    }
    setBusy({ type: "creating" });
    setError(null);
    try {
      const snapshot = await window.setta.conversations.create({
        title: newConversationTitle,
        workspaceId: null,
      });
      const result = await requestConversationPaneNavigation({
        conversationId: snapshot.conversation.id,
        destination: { kind: "new-pane" },
        resourceBindings: [],
        title: snapshot.conversation.title,
        workspaceId: currentPaneLayoutWorkspaceId(session?.selectedWorkspaceId ?? ""),
      });
      requirePresentationSuccess(result);
      setExpanded(false);
      setQuery("");
    } catch (caught) {
      setError(commandErrorMessage(caught));
    } finally {
      setBusy({ type: "idle" });
    }
  }

  async function openConversation(item: MasterConversationPickerItem) {
    if (!canRunCommand) {
      return;
    }
    setBusy({ conversationId: item.conversationId, type: "opening" });
    setError(null);
    try {
      const result = await requestConversationPaneNavigation({
        conversationId: item.conversationId,
        resourceBindings: [{ folder: { rootPath: item.workspaceRootPath }, kind: "folder" }],
        title: item.title,
        workspaceId: currentPaneLayoutWorkspaceId(session?.selectedWorkspaceId ?? ""),
      });
      requirePresentationSuccess(result);
      setExpanded(false);
      setQuery("");
    } catch (caught) {
      setError(commandErrorMessage(caught));
    } finally {
      setBusy({ type: "idle" });
    }
  }

  async function archiveConversation(item: MasterConversationPickerItem) {
    if (!canRunCommand) {
      return;
    }
    if (!window.confirm(`Archive "${item.title}"?`)) {
      return;
    }
    setBusy({ conversationId: item.conversationId, type: "archiving" });
    setError(null);
    try {
      const snapshot = await window.setta.conversations.archive({
        conversationId: item.conversationId,
        workspaceId: item.workspaceId,
      });
      upsertConversationSnapshot(snapshot);
    } catch (caught) {
      setError(commandErrorMessage(caught));
    } finally {
      setBusy({ type: "idle" });
    }
  }

  return (
    <div className="setta-master-conversation-picker" data-testid="master-conversation-picker">
      <div className="setta-master-conversation-actions">
        <button
          aria-controls="setta-master-conversation-picker-panel"
          aria-expanded={expanded}
          className="setta-master-conversation-action"
          data-testid="master-topics-button"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <Search aria-hidden="true" />
          <span>Topics</span>
        </button>
        <button
          className="setta-master-conversation-action"
          data-testid="master-new-conversation-button"
          disabled={!canRunCommand}
          onClick={() => void createFolderlessConversation()}
          type="button"
        >
          {busy.type === "creating" ? (
            <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
          ) : (
            <MessageSquarePlus aria-hidden="true" />
          )}
          <span>New conversation</span>
        </button>
      </div>
      {error ? (
        <div className="setta-master-conversation-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {expanded ? (
        <div
          className="setta-master-conversation-panel"
          data-testid="master-conversation-picker-panel"
          id="setta-master-conversation-picker-panel"
        >
          <label className="setta-master-conversation-search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search topic conversations"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search topic conversations"
              value={query}
            />
          </label>
          <div
            aria-label="Topic conversations"
            className="setta-master-conversation-list"
            role="listbox"
          >
            {selection.items.map((item) => (
              <div
                aria-label={conversationItemAriaLabel(item)}
                className="setta-master-conversation-row"
                data-conversation-id={item.conversationId}
                key={`${item.workspaceId}:${item.conversationId}`}
                role="option"
              >
                <button
                  aria-label={`Open ${conversationItemAriaLabel(item)}`}
                  className="setta-master-conversation-open"
                  data-conversation-id={item.conversationId}
                  data-testid="master-conversation-picker-row"
                  disabled={!canRunCommand}
                  onClick={() => void openConversation(item)}
                  type="button"
                >
                  {busy.type === "opening" && busy.conversationId === item.conversationId ? (
                    <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
                  ) : (
                    <MessageCircle aria-hidden="true" />
                  )}
                  <span className="setta-master-conversation-row-main">
                    <span className="setta-master-conversation-row-title">{item.title}</span>
                    <span className="setta-master-conversation-row-meta">
                      {conversationItemMeta(item)}
                    </span>
                  </span>
                </button>
                <button
                  aria-label={`Archive ${item.title}`}
                  className="setta-master-conversation-archive"
                  data-conversation-id={item.conversationId}
                  data-testid="master-conversation-archive"
                  disabled={!canRunCommand}
                  onClick={() => void archiveConversation(item)}
                  title={`Archive ${item.title}`}
                  type="button"
                >
                  {busy.type === "archiving" && busy.conversationId === item.conversationId ? (
                    <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
                  ) : (
                    <Archive aria-hidden="true" />
                  )}
                </button>
              </div>
            ))}
            {selection.status.message ? (
              <div className="setta-master-conversation-status" role="status">
                {selection.status.loading ? (
                  <LoaderCircle aria-hidden="true" className="setta-master-overlay-spinner" />
                ) : null}
                <span>{selection.status.message}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function currentPaneLayoutWorkspaceId(selectedWorkspaceId: string): string {
  return selectedWorkspaceId.length > 0 ? selectedWorkspaceId : emptyWorkspaceRuntimeId;
}

function conversationAPIAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.setta?.conversations);
}

function conversationItemAriaLabel(item: MasterConversationPickerItem): string {
  return `${item.title}, ${conversationStatusLabel(item.status)}, ${conversationOpenLabel(item)}`;
}

function conversationItemMeta(item: MasterConversationPickerItem): string {
  const parts = [item.workspaceName, conversationStatusLabel(item.status)];
  if (item.focused) {
    parts.push("focused");
  } else if (item.openPaneId) {
    parts.push("open");
  }
  return parts.join(" · ");
}

function conversationOpenLabel(item: MasterConversationPickerItem): string {
  if (item.focused) {
    return "focused";
  }
  return item.openPaneId ? "open" : "not open";
}

function conversationStatusLabel(status: MasterConversationPickerItem["status"]): string {
  switch (status) {
    case "failed":
      return "Failed";
    case "idle":
      return "Idle";
    case "waiting_for_approval":
      return "Waiting for approval";
    case "working":
      return "Working";
    default:
      return assertNever(status);
  }
}

function requirePresentationSuccess(result: ConversationPanePresentationResult): void {
  if (result.kind === "blocked") {
    throw new Error(result.reason);
  }
}

function commandErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The topic conversation could not be opened.";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported conversation status: ${String(value)}`);
}
