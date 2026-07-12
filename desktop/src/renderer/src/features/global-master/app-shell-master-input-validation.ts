import type { AcceptedMasterInput, MasterInput } from "@generated/backend";

export function acceptedMasterInputMatches(
  accepted: AcceptedMasterInput,
  input: MasterInput,
): boolean {
  return validAcceptedMasterInput(accepted) && masterInputsEqual(accepted.input, input);
}

function validAcceptedMasterInput(accepted: AcceptedMasterInput): boolean {
  return (
    Number.isSafeInteger(accepted.sequence) &&
    accepted.sequence > 0 &&
    accepted.acceptedAt !== "" &&
    validReplyDelivery(accepted)
  );
}

function validReplyDelivery(accepted: AcceptedMasterInput): boolean {
  switch (accepted.input.source) {
    case "conversation_escalation":
      return conversationEscalationDeliveryMatches(accepted);
    case "shell":
      return shellDeliveryMatches(accepted);
    default:
      return assertNever(accepted.input.source);
  }
}

function conversationEscalationDeliveryMatches(accepted: AcceptedMasterInput): boolean {
  const input = accepted.input;
  const delivery = accepted.replyDelivery;
  return (
    input.originatingWorkspaceId !== null &&
    input.originatingConversationId !== null &&
    input.originatingConversationInputId !== null &&
    delivery.originatingWorkspaceId === input.originatingWorkspaceId &&
    delivery.originatingConversationId === input.originatingConversationId &&
    delivery.originatingPaneId === input.originatingPaneId &&
    delivery.originatingConversationInputId === input.originatingConversationInputId
  );
}

function shellDeliveryMatches(accepted: AcceptedMasterInput): boolean {
  const input = accepted.input;
  const delivery = accepted.replyDelivery;
  return (
    input.originatingWorkspaceId === null &&
    input.originatingConversationId === null &&
    input.originatingPaneId === null &&
    input.originatingConversationInputId === null &&
    delivery.originatingWorkspaceId === null &&
    delivery.originatingConversationId === null &&
    delivery.originatingPaneId === null &&
    delivery.originatingConversationInputId === null
  );
}

export function masterInputsEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    masterInputCoreEqual(left, right) &&
    masterInputFocusEqual(left, right) &&
    masterInputOriginEqual(left, right)
  );
}

function masterInputCoreEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.id === right.id &&
    left.text === right.text &&
    left.modality === right.modality &&
    left.source === right.source &&
    left.submittedAt === right.submittedAt
  );
}

function masterInputFocusEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.focusedWorkspaceId === right.focusedWorkspaceId &&
    left.focusedConversationId === right.focusedConversationId &&
    left.focusedPaneId === right.focusedPaneId
  );
}

function masterInputOriginEqual(left: MasterInput, right: MasterInput): boolean {
  return (
    left.originatingWorkspaceId === right.originatingWorkspaceId &&
    left.originatingConversationId === right.originatingConversationId &&
    left.originatingPaneId === right.originatingPaneId &&
    left.originatingConversationInputId === right.originatingConversationInputId
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled master input value: ${String(value)}`);
}
