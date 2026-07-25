import type { NavigatorItem } from "@generated/backend";
import { useEffect, useRef } from "react";

import {
  ConversationCreationRequestAbortedError,
  isConversationCreationRequestAbortedError,
  type ConversationCreationCommand,
  type ConversationCreationRequest,
} from "./conversation-creation-command";
import type { ConversationNavigatorWorkspaceState } from "../../stores/conversation-navigator-store";
import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { useConversationPaneStore } from "../../stores/conversation-pane-store";
import type { ConversationPanePresentationRequest } from "../../workspace-layout/conversation-pane-coordinator";

export type InitialEasyButtonPaneDecision =
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
  createConversation,
  onError,
  presentConversation,
  selectedWorkspaceId,
  selectedWorkspaceAvailable,
}: {
  activeWorkspaceIds: readonly string[];
  connectedRuntimeId: string | null;
  createConversation: ConversationCreationCommand;
  onError: (message: string | null) => void;
  presentConversation: (request: ConversationPanePresentationRequest) => Promise<unknown>;
  selectedWorkspaceId: string;
  selectedWorkspaceAvailable: boolean;
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
    paneWorkspace?.paneIdByConversationId.size,
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
      createConversation,
      decision,
      presentConversation,
      selectedWorkspaceId,
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
    createConversation,
    decision,
    onError,
    paneWorkspace,
    presentConversation,
    selectedWorkspaceId,
    selectedWorkspaceAvailable,
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

export async function fulfillInitialEasyButtonPane({
  createConversation,
  decision,
  presentConversation,
  selectedWorkspaceId,
  targetKey,
  targetKeyRef,
}: {
  createConversation: ConversationCreationCommand;
  decision: Extract<InitialEasyButtonPaneDecision, { kind: "create" | "present" }>;
  presentConversation: (request: ConversationPanePresentationRequest) => Promise<unknown>;
  selectedWorkspaceId: string;
  targetKey: string;
  targetKeyRef: { current: string | null };
}): Promise<boolean> {
  if (decision.kind === "present") {
    const target = presentationRequest(decision.item);
    if (targetKeyRef.current !== targetKey) {
      return false;
    }
    await presentConversation(target);
    return true;
  }
  if (targetKeyRef.current !== targetKey) {
    return false;
  }
  try {
    await createConversation(initialConversationCreationRequest(selectedWorkspaceId), {
      assertCurrent: () => assertInitialEasyButtonPaneTargetCurrent(targetKey, targetKeyRef),
    });
  } catch (error) {
    if (isConversationCreationRequestAbortedError(error)) {
      return false;
    }
    throw error;
  }
  return targetKeyRef.current === targetKey;
}

function initialConversationCreationRequest(
  selectedWorkspaceId: string,
): ConversationCreationRequest {
  return {
    destination: { kind: "new-pane" },
    workspaceId: selectedWorkspaceId,
  };
}

function assertInitialEasyButtonPaneTargetCurrent(
  targetKey: string,
  targetKeyRef: { current: string | null },
): void {
  if (targetKeyRef.current !== targetKey) {
    throw new ConversationCreationRequestAbortedError(
      "The initial Easy Button pane target changed before the conversation opened.",
    );
  }
}

function presentationRequest(item: NavigatorItem): ConversationPanePresentationRequest {
  return {
    conversationId: item.conversation.id,
    title: item.conversation.title,
    workspaceId: item.conversation.workspaceId,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The initial conversation could not be opened.";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled initial Easy Button pane decision: ${String(value)}`);
}
