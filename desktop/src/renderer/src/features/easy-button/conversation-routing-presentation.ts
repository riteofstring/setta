import type {
  ConversationInputRoutingState,
  ConversationRouteCommand,
  PresentationIntent,
} from "@generated/backend";

import { useConversationRoutingStore } from "../../stores/conversation-routing-store";
import { useConversationStore } from "../../stores/conversation-store";
import {
  conversationPaneRequestForPresentationIntent,
  requestConversationPaneNavigation,
} from "../../workspace-layout/conversation-pane-coordinator";

export async function applyConversationRoutingPresentation(
  workspaceId: string,
  state: ConversationInputRoutingState,
): Promise<void> {
  const result = conversationRoutingResult(state);
  const conversationId = state.input.input.conversationId;
  useConversationRoutingStore.getState().applyResult({
    clarification: result.clarification,
    conversationId,
    inputId: result.inputId,
    routingAttempt: result.routingAttempt,
    routingFailure: result.routingFailure,
    sequence: result.sequence,
    workspaceId,
  });
  requireConversationRoutingSucceeded(result);
  assertConversationInputSettled(state);

  const command = latestConversationRouteCommand(state);
  switch (command.kind) {
    case "create_side_conversation":
      return presentCreatedSideConversation(
        command.createSideConversation,
        workspaceId,
        conversationId,
      );
    case "fork_conversation":
      return presentForkedConversation(command.forkConversation, workspaceId);
    case "escalate_to_master":
      return presentMasterEscalation(command.escalateToMaster, workspaceId, state, result);
    case "answer_as_narrator":
    case "clarify":
    case "queue_parent_turn":
    case "send_to_parent":
    case "steer_parent_turn":
      return;
    default:
      return assertNeverConversationRouteKind(command.kind);
  }
}

export function clearConversationRoutingMasterReply(
  workspaceId: string,
  conversationId: string,
): void {
  useConversationRoutingStore.getState().clearMasterReply(workspaceId, conversationId);
}

export function discardConversationRoutingFailure(
  workspaceId: string,
  conversationId: string,
  inputId: string,
): void {
  useConversationRoutingStore.getState().discardFailure(workspaceId, conversationId, inputId);
}

export function isConversationRoutingFailure(error: unknown): boolean {
  return error instanceof ConversationRoutingFailureError;
}

interface ConversationRoutingResult {
  clarification: { inputId: string; question: string } | null;
  inputId: string;
  routingAttempt: number;
  routingFailure: { inputId: string; message: string; retryable: boolean } | null;
  sequence: number;
}

function requireConversationRoutingSucceeded(result: ConversationRoutingResult): void {
  if (result.routingFailure) {
    throw new ConversationRoutingFailureError(result.routingFailure.message);
  }
}

class ConversationRoutingFailureError extends Error {}

function conversationRoutingResult(
  state: ConversationInputRoutingState,
): ConversationRoutingResult {
  const terminalInput = state.clarificationReply ?? state.input;
  return {
    clarification: conversationInputClarification(state),
    inputId: terminalInput.input.id,
    routingAttempt: terminalInput.routingAttempt,
    routingFailure: conversationRoutingFailure(state),
    sequence: terminalInput.sequence,
  };
}

function conversationInputClarification(
  state: ConversationInputRoutingState,
): ConversationRoutingResult["clarification"] {
  if (state.input.status !== "awaiting_clarification" || state.clarificationReply !== null) {
    return null;
  }
  const decision = state.decisions.at(-1);
  const question = decision?.resultingCommand.clarify?.question;
  if (decision?.resultingCommand.kind !== "clarify" || !question) {
    throw new Error("Conversation routing requested clarification without a question.");
  }
  return { inputId: state.input.input.id, question };
}

function conversationRoutingFailure(
  state: ConversationInputRoutingState,
): ConversationRoutingResult["routingFailure"] {
  const failed =
    state.clarificationReply?.status === "failed"
      ? state.clarificationReply
      : state.input.status === "failed"
        ? state.input
        : null;
  if (!failed) {
    return null;
  }
  return {
    inputId: failed.input.id,
    message: failed.failure?.message ?? "Conversation input routing failed without a reason.",
    retryable: failed.failure?.retryable ?? false,
  };
}

function assertConversationInputSettled(state: ConversationInputRoutingState): void {
  switch (state.input.status) {
    case "awaiting_clarification":
    case "dispatched":
      return;
    default:
      throw new Error(`Conversation input wait returned unsettled status ${state.input.status}.`);
  }
}

function latestConversationRouteCommand(
  state: ConversationInputRoutingState,
): ConversationRouteCommand {
  const command = state.decisions.at(-1)?.resultingCommand;
  if (!command) {
    throw new Error("Conversation routing settled without a command.");
  }
  return command;
}

async function presentCreatedSideConversation(
  side: ConversationRouteCommand["createSideConversation"],
  workspaceId: string,
  conversationId: string,
): Promise<void> {
  if (!side) {
    throw new Error("Conversation routing omitted its side-conversation command.");
  }
  await presentConversationPane({
    conversationId,
    preferredPaneId: side.parentPaneId,
    title: conversationTitle(conversationId),
    viewAction: "focus-or-open",
    workspaceId,
  });
}

async function presentForkedConversation(
  fork: ConversationRouteCommand["forkConversation"],
  workspaceId: string,
): Promise<void> {
  if (!fork) {
    throw new Error("Conversation routing omitted its fork command.");
  }
  await presentConversationPane({
    conversationId: fork.childConversationId,
    title: fork.proposedTitle,
    viewAction: "focus-or-open",
    workspaceId,
  });
}

async function presentMasterEscalation(
  escalation: ConversationRouteCommand["escalateToMaster"],
  workspaceId: string,
  state: ConversationInputRoutingState,
  result: ConversationRoutingResult,
): Promise<void> {
  if (!escalation) {
    throw new Error("Conversation routing omitted its master-escalation command.");
  }
  const intent = await requireMasterPresentationWaiter()({ inputId: escalation.masterInputId });
  validateConversationMasterPresentation(intent, escalation.masterInputId, state, workspaceId);
  if (intent.kind === "show_master_reply") {
    presentMasterReply(intent, workspaceId, state.input.input.conversationId, result);
    return;
  }
  await presentMasterConversationNavigation(intent);
}

function presentMasterReply(
  intent: PresentationIntent,
  workspaceId: string,
  conversationId: string,
  result: ConversationRoutingResult,
): void {
  const reply = intent.showMasterReply;
  if (!reply) {
    throw new Error("Master presentation omitted its reply.");
  }
  useConversationRoutingStore.getState().setMasterReply({
    conversationId,
    inputId: result.inputId,
    masterReply: { kind: reply.replyKind, text: reply.text },
    routingAttempt: result.routingAttempt,
    sequence: result.sequence,
    workspaceId,
  });
}

async function presentMasterConversationNavigation(intent: PresentationIntent): Promise<void> {
  const request = conversationPaneRequestForPresentationIntent(intent);
  if (!request) {
    throw new Error("Master presentation omitted its conversation target.");
  }
  const presented = await requestConversationPaneNavigation(request);
  if (presented.kind === "blocked") {
    throw new Error(presented.reason);
  }
  const resolution = await requireMasterPresentationResolver()({
    inputId: intent.inputId,
    intentId: intent.id,
    paneId: presented.paneId,
  });
  const validResolution = [
    resolution.inputId === intent.inputId,
    resolution.intentId === intent.id,
    resolution.paneId === presented.paneId,
    resolution.resolvedAt.trim() !== "",
  ].every(Boolean);
  if (!validResolution) {
    throw new Error("Master presentation returned an invalid pane resolution.");
  }
}

function validateConversationMasterPresentation(
  intent: PresentationIntent,
  masterInputId: string,
  state: ConversationInputRoutingState,
  workspaceId: string,
): void {
  const input = state.input.input;
  if (
    intent.inputId !== masterInputId ||
    intent.id !== `master-presentation:${masterInputId}` ||
    intent.source !== "conversation_escalation" ||
    intent.originatingWorkspaceId !== workspaceId ||
    intent.originatingConversationId !== input.conversationId ||
    intent.originatingConversationInputId !== input.id ||
    intent.originatingPaneId !== input.sourcePaneId
  ) {
    throw new Error("Master presentation does not match the originating conversation input.");
  }
}

async function presentConversationPane(
  request: Parameters<typeof requestConversationPaneNavigation>[0],
): Promise<void> {
  const result = await requestConversationPaneNavigation(request);
  if (result.kind === "blocked") {
    throw new Error(result.reason);
  }
}

function conversationTitle(conversationId: string): string {
  return (
    useConversationStore.getState().conversations.get(conversationId)?.snapshot?.conversation
      .title ?? "Topic conversation"
  );
}

function requireMasterPresentationWaiter(): NonNullable<
  NonNullable<(typeof window.setta)["master"]>["waitPresentation"]
> {
  const wait = window.setta.master?.waitPresentation;
  if (!wait) {
    throw new Error("Master presentation delivery is unavailable.");
  }
  return wait;
}

function requireMasterPresentationResolver(): NonNullable<
  NonNullable<(typeof window.setta)["master"]>["resolvePresentation"]
> {
  const resolve = window.setta.master?.resolvePresentation;
  if (!resolve) {
    throw new Error("Master presentation resolution is unavailable.");
  }
  return resolve;
}

function assertNeverConversationRouteKind(value: never): never {
  throw new Error(`Unsupported conversation routing presentation: ${String(value)}`);
}
