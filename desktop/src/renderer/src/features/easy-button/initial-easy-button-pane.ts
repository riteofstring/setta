import type { NavigatorItem } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { useEffect, useRef } from "react";

import type { ConversationNavigatorWorkspaceState } from "../../stores/conversation-navigator-store";
import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { useConversationPaneStore } from "../../stores/conversation-pane-store";
import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import type { ConversationPanePresentationRequest } from "../../workspace-layout/conversation-pane-coordinator";

const initialConversationTitle = "New conversation";

type InitialEasyButtonPaneDecision =
  | { kind: "create" }
  | { kind: "present"; item: NavigatorItem }
  | { kind: "satisfied" }
  | { kind: "wait" };

export type InitialEasyButtonPaneStartup = "creating" | "loading" | "opening" | null;

export function initialEasyButtonPaneDecision(
  navigator: ConversationNavigatorWorkspaceState | undefined,
  openConversationCount: number | undefined,
  workspaceAvailable = true,
): InitialEasyButtonPaneDecision {
  if (openConversationCount === undefined || !navigator || navigator.loading) {
    return { kind: "wait" };
  }
  if (openConversationCount > 0) {
    return { kind: "satisfied" };
  }
  const item = navigator.items[0];
  if (item) {
    return { item, kind: "present" };
  }
  if (navigator.error) {
    return { kind: "wait" };
  }
  if (!workspaceAvailable) {
    return { kind: "wait" };
  }
  return { kind: "create" };
}

export function useInitialEasyButtonPane({
  activeWorkspaceIds,
  connectedRuntimeId,
  onError,
  presentConversation,
  selectedWorkspaceId,
  selectedWorkspaceAvailable,
  setta,
}: {
  activeWorkspaceIds: readonly string[];
  connectedRuntimeId: string | null;
  onError: (message: string | null) => void;
  presentConversation: (request: ConversationPanePresentationRequest) => Promise<unknown>;
  selectedWorkspaceId: string;
  selectedWorkspaceAvailable: boolean;
  setta: SettaAPI;
}): InitialEasyButtonPaneStartup {
  const navigatorWorkspaces = useConversationNavigatorStore((state) => state.workspaces);
  const syncNavigatorWorkspaces = useConversationNavigatorStore((state) => state.syncWorkspaces);
  const paneWorkspaces = useConversationPaneStore((state) => state.workspaces);
  const handledKeysRef = useRef(new Set<string>());
  const pendingKeysRef = useRef(new Set<string>());
  const targetKey =
    connectedRuntimeId && selectedWorkspaceId
      ? `${connectedRuntimeId}\u0000${selectedWorkspaceId}`
      : null;
  const activeWorkspaceKey = activeWorkspaceIds.join("\u0000");
  const targetKeyRef = useRef(targetKey);
  targetKeyRef.current = targetKey;

  useEffect(() => {
    void syncNavigatorWorkspaces(activeWorkspaceKey ? activeWorkspaceKey.split("\u0000") : []);
  }, [activeWorkspaceKey, syncNavigatorWorkspaces]);

  const navigator = selectedWorkspaceId ? navigatorWorkspaces[selectedWorkspaceId] : undefined;
  const paneWorkspace = selectedWorkspaceId ? paneWorkspaces.get(selectedWorkspaceId) : undefined;
  const decision = initialEasyButtonPaneDecision(
    navigator,
    paneWorkspace?.paneIdsByConversationId.size,
    selectedWorkspaceAvailable,
  );

  useEffect(() => {
    if (!targetKey) {
      return;
    }
    if (!paneWorkspace) {
      handledKeysRef.current.delete(targetKey);
      return;
    }
    if (
      decision.kind === "wait" ||
      handledKeysRef.current.has(targetKey) ||
      pendingKeysRef.current.has(targetKey)
    ) {
      return;
    }
    if (decision.kind === "satisfied") {
      handledKeysRef.current.add(targetKey);
      return;
    }
    pendingKeysRef.current.add(targetKey);
    onError(null);
    void fulfillInitialEasyButtonPane({
      decision,
      presentConversation,
      selectedWorkspaceId,
      setta,
      targetKey,
      targetKeyRef,
    })
      .then((presented) => {
        if (presented) {
          handledKeysRef.current.add(targetKey);
        }
      })
      .catch((error: unknown) => {
        handledKeysRef.current.add(targetKey);
        onError(errorMessage(error));
      })
      .finally(() => {
        pendingKeysRef.current.delete(targetKey);
      });
  }, [
    decision,
    onError,
    paneWorkspace,
    presentConversation,
    selectedWorkspaceId,
    selectedWorkspaceAvailable,
    setta,
    targetKey,
  ]);

  const prerequisite = initialEasyButtonStartupPrerequisite({
    handled: handledKeysRef.current.has(targetKey ?? ""),
    navigatorLoading: navigator?.loading,
    navigatorReady: navigator !== undefined,
    paneWorkspaceReady: paneWorkspace !== undefined,
    runtimeConnected: targetKey !== null,
    selectedWorkspaceAvailable,
    selectedWorkspaceReady: selectedWorkspaceId !== "",
  });
  if (prerequisite !== "ready") {
    return prerequisite;
  }
  return initialEasyButtonStartupForDecision(decision);
}

function initialEasyButtonStartupPrerequisite({
  handled,
  navigatorLoading,
  navigatorReady,
  paneWorkspaceReady,
  runtimeConnected,
  selectedWorkspaceAvailable,
  selectedWorkspaceReady,
}: {
  handled: boolean;
  navigatorLoading: boolean | undefined;
  navigatorReady: boolean;
  paneWorkspaceReady: boolean;
  runtimeConnected: boolean;
  selectedWorkspaceAvailable: boolean;
  selectedWorkspaceReady: boolean;
}): Exclude<InitialEasyButtonPaneStartup, "creating" | "opening"> | "ready" {
  if (!selectedWorkspaceReady) {
    return null;
  }
  if (!selectedWorkspaceAvailable) {
    return null;
  }
  if (!runtimeConnected) {
    return "loading";
  }
  if (!paneWorkspaceReady) {
    return "loading";
  }
  if (!navigatorReady) {
    return "loading";
  }
  if (navigatorLoading) {
    return "loading";
  }
  return handled ? null : "ready";
}

function initialEasyButtonStartupForDecision(
  decision: InitialEasyButtonPaneDecision,
): InitialEasyButtonPaneStartup {
  switch (decision.kind) {
    case "create":
      return "creating";
    case "present":
      return "opening";
    case "satisfied":
    case "wait":
      return null;
    default:
      return assertNever(decision);
  }
}

async function fulfillInitialEasyButtonPane({
  decision,
  presentConversation,
  selectedWorkspaceId,
  setta,
  targetKey,
  targetKeyRef,
}: {
  decision: Extract<InitialEasyButtonPaneDecision, { kind: "create" | "present" }>;
  presentConversation: (request: ConversationPanePresentationRequest) => Promise<unknown>;
  selectedWorkspaceId: string;
  setta: SettaAPI;
  targetKey: string;
  targetKeyRef: { current: string | null };
}): Promise<boolean> {
  let target: ConversationPanePresentationRequest;
  if (decision.kind === "present") {
    target = presentationRequest(decision.item);
  } else {
    const snapshot = await setta.conversations.create({
      title: initialConversationTitle,
      workspaceId: selectedWorkspaceId,
    });
    hydrateConversationProjectionSnapshot(snapshot);
    target = {
      conversationId: snapshot.conversation.id,
      title: snapshot.conversation.title,
      viewAction: "focus-or-open",
      workspaceId: snapshot.conversation.workspaceId,
    };
  }
  if (targetKeyRef.current !== targetKey) {
    return false;
  }
  await presentConversation(target);
  return true;
}

function presentationRequest(item: NavigatorItem): ConversationPanePresentationRequest {
  return {
    conversationId: item.conversation.id,
    title: item.conversation.title,
    viewAction: "focus-or-open",
    workspaceId: item.conversation.workspaceId,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The initial conversation could not be opened.";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled initial Easy Button pane decision: ${String(value)}`);
}
