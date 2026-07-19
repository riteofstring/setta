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
import { emptyWorkspaceRuntimeId } from "../../workspace-layout/workspace-layout-area-runtime";

export const newConversationTitle = "New conversation";

export const conversationCreationRequestEvent = "setta:conversation-creation-request";

export interface ConversationCreationRequest {
  destination: ConversationPanePlacementDestination;
  workspaceId: string | null;
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
  workspaceId: string | null;
}

export type ConversationCreationCommand = (
  request: ConversationCreationRequest,
  lifecycle?: ConversationCreationLifecycle,
) => Promise<ConversationCreationResult>;

export function requestConversationCreation(
  request: ConversationCreationRequest,
): Promise<ConversationCreationResult> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The conversation creation coordinator is unavailable."));
  }
  const detail: ConversationCreationEventDetail = { completion: null, request };
  window.dispatchEvent(
    new CustomEvent<ConversationCreationEventDetail>(conversationCreationRequestEvent, {
      detail,
    }),
  );
  return (
    detail.completion ??
    Promise.reject(new Error("The conversation creation coordinator is unavailable."))
  );
}

export interface ConversationCreationCommandOptions {
  assertCurrent?: () => void;
  createConversation: SettaAPI["conversations"]["create"];
  ensureWorkspaceAvailable: (workspaceId: string | null) => void;
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
  hydrateSnapshot = hydrateConversationProjectionSnapshot,
  preflightPlacement,
  presentConversation,
  request,
}: ConversationCreationCommandOptions): Promise<ConversationCreationResult> {
  assertCurrent?.();
  ensureWorkspaceAvailable(request.workspaceId);
  assertCurrent?.();
  const paneLayoutWorkspaceId = conversationCreationPaneLayoutWorkspaceId(request.workspaceId);
  await preflightPlacement({
    destination: request.destination,
    workspaceId: paneLayoutWorkspaceId,
  });
  assertCurrent?.();
  const snapshot = await createConversation({
    title: newConversationTitle,
    workspaceId: request.workspaceId,
  });
  const workspaceId = createdConversationWorkspaceID(snapshot, request.workspaceId);
  hydrateSnapshot(snapshot);
  assertCurrent?.();
  try {
    const presentation = await presentConversation({
      conversationId: snapshot.conversation.id,
      destination: request.destination,
      resourceBindings: workspaceId === null ? [] : undefined,
      title: snapshot.conversation.title,
      workspaceId: paneLayoutWorkspaceId,
    });
    return {
      conversationId: snapshot.conversation.id,
      paneId: presentation.paneId,
      workspaceId,
    };
  } catch (error) {
    throw new Error(createdConversationPresentationFailureMessage(errorMessage(error)), {
      cause: error,
    });
  }
}

function createdConversationWorkspaceID(
  snapshot: ConversationSnapshot,
  requestedWorkspaceId: string | null,
): string | null {
  if (snapshot.conversation.workspaceId !== requestedWorkspaceId) {
    throw new Error("The created conversation was not linked to the requested resource.");
  }
  return snapshot.conversation.workspaceId;
}

export function conversationCreationRequestKey(request: ConversationCreationRequest): string {
  const workspaceKey = request.workspaceId ?? "folderless";
  switch (request.destination.kind) {
    case "new-pane":
      return `${workspaceKey}\u0000new-pane`;
    case "empty-frame":
      return `${workspaceKey}\u0000empty-frame\u0000${request.destination.paneId}`;
    default:
      return assertNever(request.destination);
  }
}

function conversationCreationPaneLayoutWorkspaceId(workspaceId: string | null): string {
  return workspaceId ?? emptyWorkspaceRuntimeId;
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
