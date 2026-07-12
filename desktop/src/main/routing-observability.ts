import { Buffer } from "node:buffer";

import type {
  ConversationInputState,
  ConversationInputRoutingState,
  ConversationPresentationTarget,
  ConversationRouteCommand,
  ConversationRouteDecision,
  InvocationAttempt,
  InputRoutingState,
  PresentationIntent,
  ResolvedInvocation,
  RouteCommand,
  RouteContextAudit,
  RouteDecision,
  RouteInvocationAttempt,
} from "@generated/backend";

export type RoutingObservationEventType =
  | "conversation_route_failed"
  | "conversation_route_observed"
  | "master_presentation_observed"
  | "master_route_cancelled"
  | "master_route_failed"
  | "master_route_observed"
  | "route_observation_failed";

export interface RoutingObservationRecorder {
  recordConversationInputRoutingState: (state: ConversationInputRoutingState) => void;
  recordMasterInputRoutingState: (state: InputRoutingState) => void;
  recordMasterPresentationIntent: (intent: PresentationIntent) => void;
  recordRoutingObservationFailure: (
    scope: "conversation" | "master",
    inputId: string,
    error: unknown,
  ) => void;
}

type EmitRoutingObservation = (type: RoutingObservationEventType, payload: unknown) => void;

const routingObservationSchemaVersion = 3;

// RouteObservability turns durable routing records into bounded, semantic
// desktop-recording events. User-authored and model-authored text is represented
// only by byte length; the generic IPC recorder remains the explicit opt-in
// surface for raw payload capture.
export class RouteObservability implements RoutingObservationRecorder {
  private readonly conversationDecisionIds = new Set<string>();
  private readonly conversationFailureKeys = new Set<string>();
  private readonly masterDecisionIds = new Set<string>();
  private readonly masterCancellationKeys = new Set<string>();
  private readonly masterFailureKeys = new Set<string>();
  private readonly observationFailureKeys = new Set<string>();
  private readonly presentationIntentIds = new Set<string>();

  constructor(private readonly emit: EmitRoutingObservation) {}

  recordConversationInputRoutingState(state: ConversationInputRoutingState): void {
    this.recordConversationDecisions(state);
    this.recordConversationFailure(state);
  }

  private recordConversationDecisions(state: ConversationInputRoutingState): void {
    for (const record of state.decisions) {
      if (this.conversationDecisionIds.has(record.id)) {
        continue;
      }
      const input = state.input.input;
      this.emit("conversation_route_observed", {
        callKind: "input_route",
        clarification: summarizeConversationClarification(state, record.clarificationInputId),
        clarificationInputId: record.clarificationInputId,
        context: record.routerContext,
        conversationId: record.conversationId,
        decidedAt: record.decidedAt,
        decision: summarizeConversationDecision(record.decision),
        decisionId: record.id,
        executionStatus: conversationDecisionExecutionStatus(record.resultingCommand),
        inputId: record.inputId,
        inputModality: input.modality,
        inputTextBytes: utf8Bytes(input.text),
        invocation: summarizeConversationResolvedInvocation(record.resolvedInvocation),
        resultingEffect: summarizeConversationCommand(record.resultingCommand),
        routingAttempt: record.routingAttempt,
        schemaVersion: routingObservationSchemaVersion,
        sourcePaneId: input.sourcePaneId,
        streamSequence: record.streamSequence,
        submittedAt: input.submittedAt,
        validationResult: "committed",
      });
      this.conversationDecisionIds.add(record.id);
    }
  }

  private recordConversationFailure(state: ConversationInputRoutingState): void {
    const failedInput = failedConversationInput(state);
    if (failedInput === null) {
      return;
    }
    const failure = requiredFailure(failedInput);
    const invocationAttempt = failedInput.invocationAttempt;
    const failureKey = `${failedInput.input.id}:${failedInput.routingAttempt}:${failure.code}`;
    if (this.conversationFailureKeys.has(failureKey)) {
      return;
    }
    const attempt = summarizeConversationTerminalAttempt(invocationAttempt);
    this.emit("conversation_route_failed", {
      callKind: "input_route",
      clarification: summarizeConversationFailureClarification(state, failedInput),
      clarificationParentInputId: failedInput.input.replyToInputId,
      context: attempt.context,
      contextAvailable: attempt.contextAvailable,
      conversationId: failedInput.input.conversationId,
      failure: summarizeFailure(failure),
      inputId: failedInput.input.id,
      inputModality: failedInput.input.modality,
      inputTextBytes: utf8Bytes(failedInput.input.text),
      invocation: attempt.invocation,
      invocationAvailable: attempt.invocationAvailable,
      commitDecision: attempt.commitDecision,
      outcome: attempt.outcome,
      routingAttempt: failedInput.routingAttempt,
      schemaVersion: routingObservationSchemaVersion,
      sourcePaneId: failedInput.input.sourcePaneId,
      submittedAt: failedInput.input.submittedAt,
      validationResult: attempt.validationResult,
    });
    this.conversationFailureKeys.add(failureKey);
  }

  recordMasterInputRoutingState(state: InputRoutingState): void {
    this.recordMasterDecision(state);
    this.recordMasterCancellation(state);
    this.recordMasterFailure(state);
  }

  private recordMasterDecision(state: InputRoutingState): void {
    const record = state.decision;
    if (record === null) {
      return;
    }
    if (this.masterDecisionIds.has(record.id)) {
      return;
    }
    const input = state.input.input;
    this.emit("master_route_observed", {
      acceptedAt: state.input.acceptedAt,
      callKind: "route",
      context: summarizeMasterContext(record.context),
      decidedAt: record.decidedAt,
      decision: summarizeMasterDecision(record.decision),
      decisionId: record.id,
      executionStatus: state.status,
      focusedConversationId: input.focusedConversationId,
      focusedPaneId: input.focusedPaneId,
      focusedWorkspaceId: input.focusedWorkspaceId,
      inputId: record.inputId,
      inputModality: input.modality,
      inputSequence: state.input.sequence,
      inputSource: input.source,
      inputTextBytes: utf8Bytes(input.text),
      invocation: record.resolvedInvocation,
      invocationAttempt: summarizeMasterRouteAttempt(record.invocationAttempt),
      commitDecision: record.invocationAttempt.commitDecision,
      outcome: record.invocationAttempt.outcome,
      masterSessionId: record.masterSessionId,
      originatingConversationId: state.input.replyDelivery.originatingConversationId,
      originatingConversationInputId: state.input.replyDelivery.originatingConversationInputId,
      originatingPaneId: state.input.replyDelivery.originatingPaneId,
      originatingWorkspaceId: state.input.replyDelivery.originatingWorkspaceId,
      resultingEffect: summarizeMasterCommand(record.resultingCommand),
      routingAttempt: record.routingAttempt,
      schemaVersion: routingObservationSchemaVersion,
      streamSequence: record.streamSequence,
      submittedAt: input.submittedAt,
      validationResult: record.invocationAttempt.validationResult,
    });
    this.masterDecisionIds.add(record.id);
  }

  private recordMasterCancellation(state: InputRoutingState): void {
    if (state.status !== "cancelled") {
      return;
    }
    const cancellation = state.cancellation;
    if (cancellation === null) {
      return;
    }
    const cancellationKey = `${cancellation.inputId}:${cancellation.routingAttempt}`;
    if (this.masterCancellationKeys.has(cancellationKey)) {
      return;
    }
    const input = state.input.input;
    const attempt = summarizeMasterTerminalAttempt(cancellation.invocationAttempt);
    this.emit("master_route_cancelled", {
      acceptedAt: state.input.acceptedAt,
      callKind: "route",
      cancelledAt: cancellation.cancelledAt,
      commitDecision: attempt.commitDecision,
      context: attempt.context,
      focusedConversationId: input.focusedConversationId,
      focusedPaneId: input.focusedPaneId,
      focusedWorkspaceId: input.focusedWorkspaceId,
      inputId: input.id,
      inputModality: input.modality,
      inputSequence: state.input.sequence,
      inputSource: input.source,
      inputTextBytes: utf8Bytes(input.text),
      invocation: attempt.invocation,
      invocationAvailable: attempt.invocationAvailable,
      outcome: attempt.outcome,
      originatingConversationId: state.input.replyDelivery.originatingConversationId,
      originatingConversationInputId: state.input.replyDelivery.originatingConversationInputId,
      originatingPaneId: state.input.replyDelivery.originatingPaneId,
      originatingWorkspaceId: state.input.replyDelivery.originatingWorkspaceId,
      routingAttempt: cancellation.routingAttempt,
      schemaVersion: routingObservationSchemaVersion,
      submittedAt: input.submittedAt,
      validationResult: attempt.validationResult,
    });
    this.masterCancellationKeys.add(cancellationKey);
  }

  private recordMasterFailure(state: InputRoutingState): void {
    if (state.status !== "failed" || state.failure === null) {
      return;
    }
    const failureKey = `${state.input.input.id}:${state.routingAttempt}:${state.failure.code}`;
    if (this.masterFailureKeys.has(failureKey)) {
      return;
    }
    const input = state.input.input;
    const attempt = summarizeMasterTerminalAttempt(state.invocationAttempt);
    this.emit("master_route_failed", {
      acceptedAt: state.input.acceptedAt,
      callKind: "route",
      commitDecision: attempt.commitDecision,
      context: attempt.context,
      contextAvailable: attempt.contextAvailable,
      failure: summarizeFailure(state.failure),
      focusedConversationId: input.focusedConversationId,
      focusedPaneId: input.focusedPaneId,
      focusedWorkspaceId: input.focusedWorkspaceId,
      inputId: input.id,
      inputModality: input.modality,
      inputSequence: state.input.sequence,
      inputSource: input.source,
      inputTextBytes: utf8Bytes(input.text),
      invocation: attempt.invocation,
      invocationAvailable: attempt.invocationAvailable,
      outcome: attempt.outcome,
      originatingConversationId: state.input.replyDelivery.originatingConversationId,
      originatingConversationInputId: state.input.replyDelivery.originatingConversationInputId,
      originatingPaneId: state.input.replyDelivery.originatingPaneId,
      originatingWorkspaceId: state.input.replyDelivery.originatingWorkspaceId,
      routingAttempt: state.routingAttempt,
      schemaVersion: routingObservationSchemaVersion,
      submittedAt: input.submittedAt,
      validationResult: attempt.validationResult,
    });
    this.masterFailureKeys.add(failureKey);
  }

  recordMasterPresentationIntent(intent: PresentationIntent): void {
    if (this.presentationIntentIds.has(intent.id)) {
      return;
    }
    this.emit("master_presentation_observed", {
      inputId: intent.inputId,
      inputSource: intent.source,
      intent: summarizePresentationIntent(intent),
      intentId: intent.id,
      originatingConversationId: intent.originatingConversationId,
      originatingConversationInputId: intent.originatingConversationInputId,
      originatingPaneId: intent.originatingPaneId,
      originatingWorkspaceId: intent.originatingWorkspaceId,
      schemaVersion: routingObservationSchemaVersion,
    });
    this.presentationIntentIds.add(intent.id);
  }

  recordRoutingObservationFailure(
    scope: "conversation" | "master",
    inputId: string,
    error: unknown,
  ): void {
    const failureKey = `${scope}:${inputId}`;
    if (this.observationFailureKeys.has(failureKey)) {
      return;
    }
    this.emit("route_observation_failed", {
      error: errorSummary(error),
      inputId,
      schemaVersion: routingObservationSchemaVersion,
      scope,
    });
    this.observationFailureKeys.add(failureKey);
  }
}

function summarizeConversationFailureClarification(
  state: ConversationInputRoutingState,
  failedInput: ConversationInputState,
) {
  if (failedInput.input.replyToInputId === null) {
    return null;
  }
  return summarizeConversationClarification(state, failedInput.input.id);
}

function summarizeConversationTerminalAttempt(attempt: InvocationAttempt | null) {
  if (attempt === null) {
    return {
      commitDecision: null,
      context: null,
      contextAvailable: false,
      invocation: null,
      invocationAvailable: false,
      outcome: null,
      validationResult: null,
    };
  }
  return {
    commitDecision: attempt.commitDecision,
    context: attempt.context,
    contextAvailable: attempt.context.materialized,
    invocation: summarizeConversationRouteAttempt(attempt),
    invocationAvailable: true,
    outcome: attempt.outcome,
    validationResult: attempt.validationResult,
  };
}

function summarizeMasterTerminalAttempt(attempt: RouteInvocationAttempt | null) {
  if (attempt === null) {
    return {
      commitDecision: null,
      context: null,
      contextAvailable: false,
      invocation: null,
      invocationAvailable: false,
      outcome: null,
      validationResult: null,
    };
  }
  return {
    commitDecision: attempt.commitDecision,
    context: summarizeMasterAttemptContext(attempt.context),
    contextAvailable: attempt.context !== null,
    invocation: summarizeMasterRouteAttempt(attempt),
    invocationAvailable: true,
    outcome: attempt.outcome,
    validationResult: attempt.validationResult,
  };
}

function summarizeMasterAttemptContext(context: RouteContextAudit | null) {
  if (context === null) {
    return null;
  }
  return summarizeMasterContext(context);
}

function summarizeConversationRouteAttempt(attempt: InvocationAttempt | null) {
  if (attempt === null) {
    return null;
  }
  return {
    ...attempt,
    failure: attempt.failure === null ? null : summarizeFailure(attempt.failure),
  };
}

function summarizeConversationResolvedInvocation(invocation: ResolvedInvocation) {
  return {
    ...invocation,
    failure: invocation.failure === null ? null : summarizeFailure(invocation.failure),
    modelReroutes: invocation.modelReroutes.map((reroute) => ({
      fromModelId: reroute.fromModelId,
      reasonBytes: utf8Bytes(reroute.reason),
      toModelId: reroute.toModelId,
    })),
  };
}

function summarizeMasterRouteAttempt(attempt: RouteInvocationAttempt | null) {
  if (attempt === null) {
    return null;
  }
  return {
    ...attempt,
    context: attempt.context === null ? null : summarizeMasterContext(attempt.context),
    failure: attempt.failure === null ? null : summarizeFailure(attempt.failure),
  };
}

function summarizeConversationClarification(
  state: ConversationInputRoutingState,
  clarificationInputId: string | null,
) {
  const reply = state.clarificationReply;
  if (reply === null || clarificationInputId === null) {
    return null;
  }
  if (reply.input.id !== clarificationInputId) {
    throw new Error(
      `validated routing record references clarification ${clarificationInputId}, got ${reply.input.id}`,
    );
  }
  return {
    acceptedAt: reply.acceptedAt,
    inputId: reply.input.id,
    inputModality: reply.input.modality,
    inputTextBytes: utf8Bytes(reply.input.text),
    parentInputId: reply.input.replyToInputId,
    sequence: reply.sequence,
    sourcePaneId: reply.input.sourcePaneId,
    status: reply.status,
    submittedAt: reply.input.submittedAt,
  };
}

function failedConversationInput(
  state: ConversationInputRoutingState,
): ConversationInputState | null {
  if (state.clarificationReply?.status === "failed") {
    return state.clarificationReply;
  }
  return state.input.status === "failed" ? state.input : null;
}

function requiredFailure(state: ConversationInputState) {
  if (state.failure === null) {
    throw new Error(`failed conversation input ${state.input.id} is missing its failure`);
  }
  return state.failure;
}

function conversationDecisionExecutionStatus(
  command: ConversationRouteCommand,
): "awaiting_clarification" | "dispatched" {
  return command.kind === "clarify" ? "awaiting_clarification" : "dispatched";
}

function summarizeConversationDecision(decision: ConversationRouteDecision) {
  switch (decision.kind) {
    case "send_to_parent": {
      const branch = requiredBranch(decision.sendToParent, decision.kind);
      return { authoredInputBytes: utf8Bytes(branch.authoredInput.text), kind: decision.kind };
    }
    case "queue_parent_turn": {
      const branch = requiredBranch(decision.queueParentTurn, decision.kind);
      return { authoredInputBytes: utf8Bytes(branch.authoredInput.text), kind: decision.kind };
    }
    case "steer_parent_turn": {
      const branch = requiredBranch(decision.steerParentTurn, decision.kind);
      return { authoredInputBytes: utf8Bytes(branch.authoredInput.text), kind: decision.kind };
    }
    case "answer_as_narrator": {
      const branch = requiredBranch(decision.answerAsNarrator, decision.kind);
      return { kind: decision.kind, questionBytes: utf8Bytes(branch.question) };
    }
    case "create_side_conversation": {
      const branch = requiredBranch(decision.createSideConversation, decision.kind);
      return { inputBytes: utf8Bytes(branch.input.text), kind: decision.kind };
    }
    case "fork_conversation": {
      const branch = requiredBranch(decision.forkConversation, decision.kind);
      return {
        forkedAtTurnId: branch.forkedAtTurnId,
        inputBytes: utf8Bytes(branch.input.text),
        kind: decision.kind,
        proposedTitleBytes: utf8Bytes(branch.proposedTitle),
      };
    }
    case "escalate_to_master": {
      const branch = requiredBranch(decision.escalateToMaster, decision.kind);
      return { inputBytes: utf8Bytes(branch.input.text), kind: decision.kind };
    }
    case "clarify": {
      const branch = requiredBranch(decision.clarify, decision.kind);
      return { kind: decision.kind, questionBytes: utf8Bytes(branch.question) };
    }
    default:
      return assertNever(decision.kind);
  }
}

function summarizeConversationCommand(command: ConversationRouteCommand) {
  switch (command.kind) {
    case "send_to_parent": {
      const branch = requiredBranch(command.sendToParent, command.kind);
      return {
        authoredInputBytes: utf8Bytes(branch.authoredInput.text),
        kind: command.kind,
        turnId: branch.turnId,
      };
    }
    case "queue_parent_turn": {
      const branch = requiredBranch(command.queueParentTurn, command.kind);
      return {
        authoredInputBytes: utf8Bytes(branch.authoredInput.text),
        kind: command.kind,
        turnId: branch.turnId,
      };
    }
    case "steer_parent_turn": {
      const branch = requiredBranch(command.steerParentTurn, command.kind);
      return {
        authoredInputBytes: utf8Bytes(branch.authoredInput.text),
        kind: command.kind,
        targetTurnId: branch.targetTurnId,
      };
    }
    case "answer_as_narrator": {
      const branch = requiredBranch(command.answerAsNarrator, command.kind);
      return {
        kind: command.kind,
        questionBytes: utf8Bytes(branch.question),
        requestId: branch.requestId,
      };
    }
    case "create_side_conversation": {
      const branch = requiredBranch(command.createSideConversation, command.kind);
      return {
        inputBytes: utf8Bytes(branch.input.text),
        kind: command.kind,
        parentPaneId: branch.parentPaneId,
        sideConversationId: branch.sideConversationId,
        turnId: branch.turnId,
      };
    }
    case "fork_conversation": {
      const branch = requiredBranch(command.forkConversation, command.kind);
      return {
        childConversationId: branch.childConversationId,
        forkedAtTurnId: branch.forkedAtTurnId,
        inputBytes: utf8Bytes(branch.input.text),
        kind: command.kind,
        proposedTitleBytes: utf8Bytes(branch.proposedTitle),
        turnId: branch.turnId,
      };
    }
    case "escalate_to_master": {
      const branch = requiredBranch(command.escalateToMaster, command.kind);
      return {
        inputBytes: utf8Bytes(branch.input.text),
        kind: command.kind,
        masterInputId: branch.masterInputId,
      };
    }
    case "clarify": {
      const branch = requiredBranch(command.clarify, command.kind);
      return { kind: command.kind, questionBytes: utf8Bytes(branch.question) };
    }
    default:
      return assertNever(command.kind);
  }
}

function summarizeMasterContext(context: RouteContextAudit) {
  return {
    activeWorkspaceIds: context.activeWorkspaceIds,
    candidateQueryBytes: utf8Bytes(context.candidateQuery),
    candidateQueryTruncated: context.candidateQueryTruncated,
    focusedConversationId: context.focusedConversationId,
    focusedWorkspaceId: context.focusedWorkspaceId,
    includedCandidateIds: context.includedCandidateIds,
    inputSequence: context.inputSequence,
    originatingConversationId: context.originatingConversationId,
    priorDecisionCount: context.priorDecisionCount,
    retrievedCandidates: context.retrievedCandidates,
    targetAuthorities: context.targetAuthorities,
  };
}

type MasterDecisionSummarizer = (decision: RouteDecision) => unknown;

const masterDecisionSummarizers = {
  answer_global: (decision) => {
    const branch = requiredBranch(decision.answerGlobal, "answer_global");
    return { kind: "answer_global", textBytes: utf8Bytes(branch.text) };
  },
  ask_narrator: (decision) => {
    const branch = requiredBranch(decision.askNarrator, "ask_narrator");
    return {
      conversationId: branch.conversationId,
      kind: "ask_narrator",
      questionBytes: utf8Bytes(branch.question),
    };
  },
  clarify: (decision) => {
    const branch = requiredBranch(decision.clarify, "clarify");
    return { kind: "clarify", questionBytes: utf8Bytes(branch.question) };
  },
  create_conversation: (decision) => {
    const branch = requiredBranch(decision.createConversation, "create_conversation");
    return {
      initialInputBytes: utf8Bytes(branch.initialInput),
      kind: "create_conversation",
      proposedTitleBytes: utf8Bytes(branch.proposedTitle),
      workspaceId: branch.workspaceId,
    };
  },
  create_side_conversation: (decision) => {
    const branch = requiredBranch(decision.createSideConversation, "create_side_conversation");
    return {
      inputBytes: utf8Bytes(branch.input),
      kind: "create_side_conversation",
      parentConversationId: branch.parentConversationId,
    };
  },
  focus_conversation: (decision) => {
    const branch = requiredBranch(decision.focusConversation, "focus_conversation");
    return { conversationId: branch.conversationId, kind: "focus_conversation" };
  },
  fork_conversation: (decision) => {
    const branch = requiredBranch(decision.forkConversation, "fork_conversation");
    return {
      forkedAtTurnId: branch.forkedAtTurnId,
      inputBytes: utf8Bytes(branch.input),
      kind: "fork_conversation",
      parentConversationId: branch.parentConversationId,
    };
  },
  queue_agent_turn: (decision) => {
    const branch = requiredBranch(decision.queueAgentTurn, "queue_agent_turn");
    return {
      authoredInputBytes: utf8Bytes(branch.authoredInput),
      conversationId: branch.conversationId,
      kind: "queue_agent_turn",
    };
  },
  send_to_agent: (decision) => {
    const branch = requiredBranch(decision.sendToAgent, "send_to_agent");
    return {
      authoredInputBytes: utf8Bytes(branch.authoredInput),
      conversationId: branch.conversationId,
      kind: "send_to_agent",
    };
  },
  steer_active_turn: (decision) => {
    const branch = requiredBranch(decision.steerActiveTurn, "steer_active_turn");
    return {
      authoredInputBytes: utf8Bytes(branch.authoredInput),
      conversationId: branch.conversationId,
      kind: "steer_active_turn",
    };
  },
} satisfies Record<RouteDecision["kind"], MasterDecisionSummarizer>;

function summarizeMasterDecision(decision: RouteDecision) {
  return masterDecisionSummarizers[decision.kind](decision);
}

type MasterCommandSummarizer = (command: RouteCommand) => unknown;

const masterCommandSummarizers = {
  answer_global: (command) => {
    const branch = requiredBranch(command.answerGlobal, "answer_global");
    return { kind: "answer_global", textBytes: utf8Bytes(branch.text) };
  },
  ask_narrator: (command) => {
    const branch = requiredBranch(command.askNarrator, "ask_narrator");
    return {
      kind: "ask_narrator",
      questionBytes: utf8Bytes(branch.question),
      requestId: branch.requestId,
      target: summarizeTarget(branch.target),
    };
  },
  clarify: (command) => {
    const branch = requiredBranch(command.clarify, "clarify");
    return { kind: "clarify", questionBytes: utf8Bytes(branch.question) };
  },
  create_conversation: (command) => {
    const branch = requiredBranch(command.createConversation, "create_conversation");
    return {
      initialInputBytes: utf8Bytes(branch.initialInput),
      kind: "create_conversation",
      target: summarizeTarget(branch.target),
      turnId: branch.turnId,
    };
  },
  create_side_conversation: (command) => {
    const branch = requiredBranch(command.createSideConversation, "create_side_conversation");
    return {
      inputBytes: utf8Bytes(branch.input),
      kind: "create_side_conversation",
      sideConversationId: branch.sideConversationId,
      target: summarizeTarget(branch.target),
      turnId: branch.turnId,
    };
  },
  focus_conversation: (command) => {
    const branch = requiredBranch(command.focusConversation, "focus_conversation");
    return { kind: "focus_conversation", target: summarizeTarget(branch.target) };
  },
  fork_conversation: (command) => {
    const branch = requiredBranch(command.forkConversation, "fork_conversation");
    return {
      forkedAtTurnId: branch.forkedAtTurnId,
      inputBytes: utf8Bytes(branch.input),
      kind: "fork_conversation",
      parentConversationId: branch.parentConversationId,
      target: summarizeTarget(branch.target),
      turnId: branch.turnId,
    };
  },
  queue_agent_turn: (command) => {
    const branch = requiredBranch(command.queueAgentTurn, "queue_agent_turn");
    return {
      authoredInputBytes: utf8Bytes(branch.authoredInput),
      kind: "queue_agent_turn",
      target: summarizeTarget(branch.target),
      turnId: branch.turnId,
    };
  },
  send_to_agent: (command) => {
    const branch = requiredBranch(command.sendToAgent, "send_to_agent");
    return {
      authoredInputBytes: utf8Bytes(branch.authoredInput),
      kind: "send_to_agent",
      target: summarizeTarget(branch.target),
      turnId: branch.turnId,
    };
  },
  steer_active_turn: (command) => {
    const branch = requiredBranch(command.steerActiveTurn, "steer_active_turn");
    return {
      authoredInputBytes: utf8Bytes(branch.authoredInput),
      kind: "steer_active_turn",
      target: summarizeTarget(branch.target),
      targetTurnId: branch.targetTurnId,
    };
  },
} satisfies Record<RouteCommand["kind"], MasterCommandSummarizer>;

function summarizeMasterCommand(command: RouteCommand) {
  return masterCommandSummarizers[command.kind](command);
}

function summarizePresentationIntent(intent: PresentationIntent) {
  switch (intent.kind) {
    case "focus_existing_conversation_pane": {
      const branch = requiredBranch(intent.focusExistingConversationPane, intent.kind);
      return { kind: intent.kind, target: summarizeTarget(branch.target) };
    }
    case "open_conversation_pane": {
      const branch = requiredBranch(intent.openConversationPane, intent.kind);
      return { kind: intent.kind, target: summarizeTarget(branch.target) };
    }
    case "open_side_conversation_in_parent_pane": {
      const branch = requiredBranch(intent.openSideConversation, intent.kind);
      return { kind: intent.kind, target: summarizeTarget(branch.target) };
    }
    case "show_master_reply": {
      const branch = requiredBranch(intent.showMasterReply, intent.kind);
      return {
        kind: intent.kind,
        replyKind: branch.replyKind,
        textBytes: utf8Bytes(branch.text),
      };
    }
    default:
      return assertNever(intent.kind);
  }
}

function summarizeTarget(target: ConversationPresentationTarget) {
  return {
    conversationId: target.conversationId,
    preferredPaneId: target.preferredPaneId,
    titleBytes: utf8Bytes(target.title),
    workspaceId: target.workspaceId,
  };
}

function summarizeFailure(failure: {
  code: string;
  diagnosticReference?: string;
  message: string;
  retryable: boolean;
}) {
  return {
    code: failure.code,
    diagnosticReference: failure.diagnosticReference ?? null,
    messageBytes: utf8Bytes(failure.message),
    retryable: failure.retryable,
  };
}

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return { messageBytes: utf8Bytes(error.message), name: error.name };
  }
  return { messageBytes: utf8Bytes(String(error)), name: "NonError" };
}

function requiredBranch<T>(value: T | null, kind: string): T {
  if (value === null) {
    throw new Error(`validated routing record ${kind} is missing its payload`);
  }
  return value;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function assertNever(value: never): never {
  throw new Error(`unsupported routing observation variant: ${String(value)}`);
}
