import { useEffect } from "react";

import type { WorkspaceLayoutStore } from "./layout-store";
import type { ConversationWorkspacePane, WorkspacePane } from "./types";

const conversationPaneFolderBindingRequestEvent = "setta:conversation-pane-folder-binding-request";

export interface ConversationPaneFolderBindingRequest {
  conversationId: string;
  paneId: string;
  rootPath: string;
  workspaceId: string;
}

interface ConversationPaneFolderBindingEventDetail {
  completion: Promise<void> | null;
  request: ConversationPaneFolderBindingRequest;
}

export function requestConversationPaneFolderBinding(
  request: ConversationPaneFolderBindingRequest,
): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The conversation pane resource coordinator is unavailable."));
  }
  const detail: ConversationPaneFolderBindingEventDetail = { completion: null, request };
  window.dispatchEvent(
    new CustomEvent<ConversationPaneFolderBindingEventDetail>(
      conversationPaneFolderBindingRequestEvent,
      { detail },
    ),
  );
  return (
    detail.completion ??
    Promise.reject(new Error("The conversation pane resource coordinator is unavailable."))
  );
}

export function bindConversationPaneFolderResource(
  store: WorkspaceLayoutStore,
  request: ConversationPaneFolderBindingRequest,
): void {
  const pane = requireConversationPane(store.toScene().paneById.get(request.paneId), request);
  store.configurePane(request.paneId, {
    conversationConfig: {
      ...pane.conversationConfig,
      resourceBindings: upsertFolderResourceBinding(
        pane.conversationConfig.resourceBindings ?? [],
        request.rootPath,
      ),
    },
    subtitle: pane.subtitle,
    surfaceKind: "conversation",
    title: pane.title,
    tone: pane.tone,
    weight: pane.weight,
  });
}

export function useConversationPaneFolderBindingRequests({
  runLayoutAction,
  store,
}: {
  runLayoutAction: (action: () => void) => Promise<boolean>;
  store: WorkspaceLayoutStore;
}): void {
  useEffect(() => {
    const bindFolder = (event: Event) => {
      const detail = (event as CustomEvent<ConversationPaneFolderBindingEventDetail>).detail;
      if (!detail?.request || detail.completion) {
        return;
      }
      detail.completion = runLayoutAction(() => {
        bindConversationPaneFolderResource(store, detail.request);
      }).then((persisted) => {
        if (!persisted) {
          throw new Error("The conversation pane folder binding could not be saved.");
        }
      });
    };
    window.addEventListener(conversationPaneFolderBindingRequestEvent, bindFolder);
    return () => window.removeEventListener(conversationPaneFolderBindingRequestEvent, bindFolder);
  }, [runLayoutAction, store]);
}

function requireConversationPane(
  pane: WorkspacePane | undefined,
  request: ConversationPaneFolderBindingRequest,
): ConversationWorkspacePane {
  if (!pane) {
    throw new Error(`Conversation pane ${request.paneId} is no longer open.`);
  }
  if (pane.surfaceKind !== "conversation") {
    throw new Error(`Pane ${request.paneId} is not a conversation pane.`);
  }
  if (pane.conversationConfig.conversationId !== request.conversationId) {
    throw new Error(`Pane ${request.paneId} belongs to another conversation.`);
  }
  return pane;
}

function upsertFolderResourceBinding(
  bindings: ConversationWorkspacePane["conversationConfig"]["resourceBindings"],
  rootPath: string,
): NonNullable<ConversationWorkspacePane["conversationConfig"]["resourceBindings"]> {
  const existing = bindings ?? [];
  const withoutFolder = existing.filter((binding) => binding.kind !== "folder");
  return [...withoutFolder, { folder: { rootPath }, kind: "folder" }];
}
