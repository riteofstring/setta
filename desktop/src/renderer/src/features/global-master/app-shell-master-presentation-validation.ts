import type {
  PresentationIntent,
  RouteDecision,
  RouteDecisionKind,
  ShellInteractionState,
} from "@generated/backend";

export function interactionRequiresNavigation(state: ShellInteractionState): boolean {
  if (state.status !== "decided") {
    return false;
  }
  if (state.decision === null) {
    return false;
  }
  return navigationRequiredByDecision[state.decision.kind];
}

const navigationRequiredByDecision = {
  answer_global: false,
  ask_narrator: true,
  clarify: false,
  create_conversation: true,
  create_side_conversation: true,
  focus_conversation: true,
  fork_conversation: true,
  queue_agent_turn: true,
  send_to_agent: true,
  steer_active_turn: true,
} satisfies Record<RouteDecisionKind, boolean>;

export function validShellPresentationIntent(
  intent: PresentationIntent,
  state: ShellInteractionState,
): boolean {
  if (!validShellPresentationContext(intent, state)) {
    return false;
  }
  if (!presentationIntentHasOnePayload(intent)) {
    return false;
  }
  return validShellPresentationPayload(intent, state);
}

function validShellPresentationContext(
  intent: PresentationIntent,
  state: ShellInteractionState,
): boolean {
  return [
    state.status === "decided",
    state.decision !== null,
    intent.inputId === state.input.id,
    intent.id === `master-presentation:${state.input.id}`,
    intent.source === "shell",
    intent.originatingWorkspaceId === null,
    intent.originatingConversationId === null,
    intent.originatingPaneId === null,
    intent.originatingConversationInputId === null,
  ].every(Boolean);
}

function presentationIntentHasOnePayload(intent: PresentationIntent): boolean {
  return (
    [
      intent.focusExistingConversationPane,
      intent.openConversationPane,
      intent.openSideConversation,
      intent.showMasterReply,
    ].filter((payload) => payload !== null).length === 1
  );
}

function validShellPresentationPayload(
  intent: PresentationIntent,
  state: ShellInteractionState,
): boolean {
  switch (intent.kind) {
    case "focus_existing_conversation_pane":
      return validConversationPresentationPayload(intent.focusExistingConversationPane, state);
    case "open_conversation_pane":
      return validConversationPresentationPayload(intent.openConversationPane, state);
    case "open_side_conversation_in_parent_pane":
      return validConversationPresentationPayload(intent.openSideConversation, state);
    case "show_master_reply":
      return validMasterReplyPresentationPayload(intent.showMasterReply, state);
    default:
      return assertNever(intent.kind);
  }
}

function validConversationPresentationPayload(
  payload:
    | PresentationIntent["focusExistingConversationPane"]
    | PresentationIntent["openConversationPane"]
    | PresentationIntent["openSideConversation"],
  state: ShellInteractionState,
): boolean {
  if (payload === null) {
    return false;
  }
  if (decisionShowsMasterReply(state)) {
    return false;
  }
  return true;
}

function validMasterReplyPresentationPayload(
  reply: PresentationIntent["showMasterReply"],
  state: ShellInteractionState,
): boolean {
  if (reply === null) {
    return false;
  }
  return validMasterReplyForDecision(reply, state);
}

function decisionShowsMasterReply(state: ShellInteractionState): boolean {
  return state.decision?.kind === "clarify" || state.decision?.kind === "answer_global";
}

function validMasterReplyForDecision(
  reply: NonNullable<PresentationIntent["showMasterReply"]>,
  state: ShellInteractionState,
): boolean {
  const decision = state.decision;
  if (decision === null) {
    return false;
  }
  return masterReplyValidators[decision.kind](reply, decision);
}

type MasterReplyPayload = NonNullable<PresentationIntent["showMasterReply"]>;
type MasterReplyValidator = (reply: MasterReplyPayload, decision: RouteDecision) => boolean;

const masterReplyValidators = {
  answer_global: (reply, decision) =>
    [reply.replyKind === "answer", reply.text === decision.answerGlobal?.text].every(Boolean),
  ask_narrator: () => false,
  clarify: (reply, decision) =>
    [reply.replyKind === "clarification", reply.text === decision.clarify?.question].every(Boolean),
  create_conversation: () => false,
  create_side_conversation: () => false,
  focus_conversation: () => false,
  fork_conversation: () => false,
  queue_agent_turn: () => false,
  send_to_agent: () => false,
  steer_active_turn: () => false,
} satisfies Record<RouteDecisionKind, MasterReplyValidator>;

function assertNever(value: never): never {
  throw new Error(`unsupported master presentation kind ${String(value)}`);
}
