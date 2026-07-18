import type { ConversationSnapshot } from "@generated/backend";

import type { SettaAPI } from "@shared/types";

import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import {
  conversationSelectedFrameMissingReason,
  conversationSelectedFrameNotEmptyReason,
  type ConversationPanePlacementDestination,
  type ConversationPanePlacementRequest,
  type ConversationPanePresentationRequest,
  type ConversationPanePresentationSuccess,
} from "../../workspace-layout/conversation-pane-coordinator";

export const newConversationTitle = "New conversation";

export const conversationCreationRequestEvent = "setta:conversation-creation-request";

export interface ConversationCreationRequest {
  destination: ConversationPanePlacementDestination;
  workspaceId: string;
}

interface ConversationCreationLifecycle {
  assertCurrent?: () => void;
}

export interface ConversationCreationEventDetail {
  completion: Promise<ConversationCreationResult> | null;
  request: ConversationCreationRequest;
}

export interface ConversationCreationResult {
  conversationId: string;
  paneId: string;
  workspaceId: string;
}

export type ConversationCreationCommand = (
  request: ConversationCreationRequest,
  lifecycle?: ConversationCreationLifecycle,
) => Promise<ConversationCreationResult>;

export interface ConversationCreationCommandOptions {
  assertCurrent?: () => void;
  createConversation: SettaAPI["conversations"]["create"];
  ensureWorkspaceAvailable: (workspaceId: string) => void;
  ensureWorkspaceSelected: (workspaceId: string) => Promise<void>;
  hydrateSnapshot?: (snapshot: ConversationSnapshot) => void;
  preflightPlacement: (request: ConversationPanePlacementRequest) => Promise<void>;
  presentConversation: (
    request: ConversationPanePresentationRequest,
  ) => Promise<ConversationPanePresentationSuccess>;
  request: ConversationCreationRequest;
}

export class ConversationCreationRequestAbortedError extends Error {
  constructor(message = "The conversation creation request is no longer current.") {
    super(message);
    this.name = "ConversationCreationRequestAbortedError";
  }
}

export function isConversationCreationRequestAbortedError(
  error: unknown,
): error is ConversationCreationRequestAbortedError {
  return error instanceof ConversationCreationRequestAbortedError;
}

export interface ConversationPlacementPreflightQueue {
  current: Promise<void>;
}

export function enqueueConversationPlacementPreflight(
  queue: ConversationPlacementPreflightQueue,
  preflightPlacement: (request: ConversationPanePlacementRequest) => Promise<void>,
  request: ConversationPanePlacementRequest,
): Promise<void> {
  const pending = queue.current.then(() => preflightPlacement(request));
  queue.current = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

export async function createAndPresentConversation({
  assertCurrent,
  createConversation,
  ensureWorkspaceAvailable,
  ensureWorkspaceSelected,
  hydrateSnapshot = hydrateConversationProjectionSnapshot,
  preflightPlacement,
  presentConversation,
  request,
}: ConversationCreationCommandOptions): Promise<ConversationCreationResult> {
  assertCurrent?.();
  ensureWorkspaceAvailable(request.workspaceId);
  await ensureWorkspaceSelected(request.workspaceId);
  assertCurrent?.();
  await preflightPlacement({
    destination: request.destination,
    workspaceId: request.workspaceId,
  });
  assertCurrent?.();
  const snapshot = await createConversation({
    title: newConversationTitle,
    workspaceId: request.workspaceId,
  });
  hydrateSnapshot(snapshot);
  assertCurrent?.();
  try {
    const presentation = await presentConversation({
      conversationId: snapshot.conversation.id,
      destination: request.destination,
      title: snapshot.conversation.title,
      viewAction: "focus-or-open",
      workspaceId: snapshot.conversation.workspaceId,
    });
    return {
      conversationId: snapshot.conversation.id,
      paneId: presentation.paneId,
      workspaceId: snapshot.conversation.workspaceId,
    };
  } catch (error) {
    throw new Error(createdConversationPresentationFailureMessage(errorMessage(error)), {
      cause: error,
    });
  }
}

export function conversationCreationRequestKey(request: ConversationCreationRequest): string {
  switch (request.destination.kind) {
    case "new-pane":
      return `${request.workspaceId}\u0000new-pane`;
    case "empty-frame":
      return `${request.workspaceId}\u0000empty-frame\u0000${request.destination.paneId}`;
    default:
      return assertNever(request.destination);
  }
}

function createdConversationPresentationFailureMessage(reason: string): string {
  switch (reason) {
    case conversationSelectedFrameMissingReason:
      return "The conversation was created, but its frame no longer exists.";
    case conversationSelectedFrameNotEmptyReason:
      return "The conversation was created, but the selected frame is no longer empty.";
    default:
      return `The conversation was created, but it could not be opened. ${reason}`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The conversation pane could not be opened.";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled conversation creation request: ${String(value)}`);
}
