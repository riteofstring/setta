import type { NavigatorItem } from "@generated/backend";

import {
  ConversationCreationRequestAbortedError,
  isConversationCreationRequestAbortedError,
  type ConversationCreationCommand,
  type ConversationCreationRequest,
} from "./conversation-creation-command";
import type { ConversationNavigatorWorkspaceState } from "../../stores/conversation-navigator-store";
import type { ConversationPanePresentationRequest } from "../../workspace-layout/conversation-pane-coordinator";

export type InitialEasyButtonPaneDecision =
  | { kind: "create" }
  | { kind: "present"; item: NavigatorItem }
  | { kind: "satisfied" }
  | { kind: "wait" };

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
    workspaceId: navigatorItemWorkspaceID(item),
  };
}

function navigatorItemWorkspaceID(item: NavigatorItem): string {
  if (item.conversation.workspaceId === null) {
    throw new Error("The initial conversation is not linked to the selected workspace.");
  }
  return item.conversation.workspaceId;
}
