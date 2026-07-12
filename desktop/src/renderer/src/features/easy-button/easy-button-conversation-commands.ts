import type {
  AcceptedConversationInput,
  ConversationApprovalAnswer,
  ConversationInput,
  ConversationInputRoutingState,
  ConversationRouteCommand,
  ConversationSnapshot,
  PresentationIntent,
  TrajectoryApprovalDecision,
  TrajectoryApprovalRequest,
} from "@generated/backend";
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import {
  conversationSpeechCaptureRequest,
  type SpeechCaptureRequester,
} from "../global-speech/speech-capture-destination";
import { acceptedConversationInputMatches } from "../global-speech/global-speech-conversation-submission";
import { canonicalSpeechInputTimestamp } from "../global-speech/speech-input-submission";
import {
  conversationPaneRequestForPresentationIntent,
  requestConversationPaneNavigation,
} from "../../workspace-layout/conversation-pane-coordinator";
import { openSideConversationForPane } from "./easy-button-side-projection";
import {
  conversationRoutingPresentationRequestEvent,
  type ConversationRoutingPresentationRequestDetail,
} from "./conversation-routing-presentation-request";

export interface EasyButtonConversationCommands {
  available: boolean;
  canSubmit: boolean;
  clarificationQuestion: string | null;
  disposeSide: (sideConversationId: string) => void;
  error: string | null;
  input: string;
  masterReply?: { kind: "answer" | "clarification"; text: string } | null;
  pending: boolean;
  presentRelatedConversation: (conversationId: string, title: string | null) => void;
  discardFailedInput: () => void;
  requestVoiceCapture: (() => void) | undefined;
  retryFailedInput: () => void;
  routingFailure: { message: string; retryable: boolean } | null;
  sendSide: (sideConversationId: string, text: string) => Promise<boolean>;
  setInput: (input: string) => void;
  stop: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  submitApproval: (
    approval: TrajectoryApprovalRequest,
    decision: TrajectoryApprovalDecision,
    answers: ConversationApprovalAnswer[],
  ) => void;
}

interface PendingSideCreation {
  finished: Promise<void>;
  resolveFinished: () => void;
}

const pendingSideCreationByPane = new Map<string, PendingSideCreation>();

function usePendingSideCreationCompletion(
  workspaceId: string | null,
  conversationId: string | null,
  paneId: string | null,
  snapshot: ConversationSnapshot | null | undefined,
): void {
  useEffect(() => {
    if (!workspaceId || !conversationId || !paneId || !snapshot) {
      return;
    }
    if (openSideConversationForPane(snapshot, paneId)) {
      finishPendingSideCreation(workspaceId, conversationId, paneId);
    }
  }, [conversationId, paneId, snapshot, workspaceId]);
}

export function useEasyButtonConversationCommands(
  workspaceId: string | null,
  conversationId: string | null,
  paneId: string | null,
  projection: ConversationProjection | undefined,
  speechCapture: SpeechCaptureRequester | undefined,
): EasyButtonConversationCommands {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{
    inputId: string;
    question: string;
  } | null>(null);
  const [masterReply, setMasterReply] = useState<{
    kind: "answer" | "clarification";
    text: string;
  } | null>(null);
  const [failedInput, setFailedInput] = useState<{
    inputId: string;
    message: string;
    retryable: boolean;
  } | null>(null);
  const commandScope = JSON.stringify([workspaceId, conversationId, paneId]);
  const activeCommandScope = useRef(commandScope);
  useLayoutEffect(() => {
    activeCommandScope.current = commandScope;
  }, [commandScope]);
  const commandScopeIsCurrent = () => activeCommandScope.current === commandScope;
  const setScopedError = (value: string | null) => {
    if (commandScopeIsCurrent()) {
      setError(value);
    }
  };
  const available = conversationCommandsAvailable(workspaceId, conversationId, projection);
  const canSubmit = conversationInputCanSubmit(available, pending, input) && !failedInput;
  const applySettledRoutingState = useCallback(
    async (state: ConversationInputRoutingState): Promise<void> => {
      const target = requireConversationRoutingScope(state, {
        activeCommandScope: activeCommandScope.current,
        commandScope,
        conversationId,
        paneId,
        workspaceId,
      });
      const routingError = applyConversationInputRoutingState(
        state,
        setClarification,
        setFailedInput,
      );
      if (routingError) {
        throw new Error(routingError);
      }
      await applyConversationRoutingPresentation({
        paneId,
        parentTitle: projection?.snapshot?.conversation.title ?? "Topic conversation",
        setMasterReply,
        state,
        target,
      });
    },
    [commandScope, conversationId, paneId, projection?.snapshot?.conversation.title, workspaceId],
  );
  usePendingSideCreationCompletion(workspaceId, conversationId, paneId, projection?.snapshot);
  useEffect(() => {
    setPending(false);
    setInput("");
    setError(null);
    setClarification(null);
    setMasterReply(null);
    setFailedInput(null);
  }, [conversationId, paneId, workspaceId]);
  useEffect(() => {
    if (!workspaceId || !conversationId || !paneId) {
      return;
    }
    const present = (event: Event) => {
      const detail = (event as CustomEvent<ConversationRoutingPresentationRequestDetail>).detail;
      if (
        !detail ||
        detail.completion ||
        detail.workspaceId !== workspaceId ||
        detail.state.input.input.conversationId !== conversationId ||
        detail.state.input.input.sourcePaneId !== paneId
      ) {
        return;
      }
      detail.completion = applySettledRoutingState(detail.state);
    };
    window.addEventListener(conversationRoutingPresentationRequestEvent, present);
    return () => window.removeEventListener(conversationRoutingPresentationRequestEvent, present);
  }, [applySettledRoutingState, conversationId, paneId, workspaceId]);

  async function run(
    command: () => Promise<ConversationSnapshot>,
    clearInput: boolean,
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const snapshot = await command();
      hydrateConversationProjectionSnapshot(snapshot);
      if (clearInput && commandScopeIsCurrent()) {
        setInput("");
      }
      return true;
    } catch (commandError) {
      setScopedError(errorMessage(commandError));
      return false;
    } finally {
      if (commandScopeIsCurrent()) {
        setPending(false);
      }
    }
  }

  async function runInput(): Promise<boolean> {
    setPending(true);
    setError(null);
    setMasterReply(null);
    try {
      const target = requireTarget();
      const submitted = createEasyButtonTextConversationInput({
        conversationId: target.conversationId,
        paneId,
        replyToInputId: clarification?.inputId ?? null,
        text: input.trim(),
      });
      beginPendingSideCreationForInput(target, paneId);
      const accepted = await requireConversationInputSubmitter()({ input: submitted });
      assertAcceptedConversationInput(accepted, submitted);
      if (commandScopeIsCurrent()) {
        setInput("");
      }
      const state = await requireConversationInputWaiter()({
        conversationId: target.conversationId,
        inputId: submitted.id,
        workspaceId: target.workspaceId,
      });
      await applySettledRoutingState(state);
      return true;
    } catch (commandError) {
      setScopedError(errorMessage(commandError));
      return false;
    } finally {
      finishPendingSideCreationForInput(workspaceId, conversationId, paneId);
      if (commandScopeIsCurrent()) {
        setPending(false);
      }
    }
  }

  function requireTarget(): { conversationId: string; workspaceId: string } {
    if (!available || !conversationId || !workspaceId) {
      throw new Error("Conversation commands require a ready topic conversation.");
    }
    return { conversationId, workspaceId };
  }

  async function retryFailedInput(): Promise<void> {
    if (!failedInput?.retryable || pending) {
      return;
    }
    setPending(true);
    setError(null);
    setMasterReply(null);
    try {
      const target = requireTarget();
      await requireConversationInputRetry()({
        conversationId: target.conversationId,
        inputId: failedInput.inputId,
        workspaceId: target.workspaceId,
      });
      const state = await requireConversationInputWaiter()({
        conversationId: target.conversationId,
        inputId: failedInput.inputId,
        workspaceId: target.workspaceId,
      });
      await applySettledRoutingState(state);
    } catch (retryError) {
      setScopedError(errorMessage(retryError));
    } finally {
      if (commandScopeIsCurrent()) {
        setPending(false);
      }
    }
  }

  async function discardFailedInput(): Promise<void> {
    if (!failedInput || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const target = requireTarget();
      await requireConversationInputDiscard()({
        conversationId: target.conversationId,
        inputId: failedInput.inputId,
        workspaceId: target.workspaceId,
      });
      if (commandScopeIsCurrent()) {
        setFailedInput(null);
        setClarification(null);
        setMasterReply(null);
      }
    } catch (discardError) {
      setScopedError(errorMessage(discardError));
    } finally {
      if (commandScopeIsCurrent()) {
        setPending(false);
      }
    }
  }

  return {
    available,
    canSubmit,
    clarificationQuestion: clarification?.question ?? null,
    discardFailedInput: () => void discardFailedInput(),
    disposeSide: (sideConversationId) => {
      if (!available || pending || !paneId) {
        return;
      }
      const target = requireTarget();
      void run(
        () =>
          requireConversationCommand("disposeSide")({
            parentConversationId: target.conversationId,
            parentPaneId: paneId,
            sideConversationId,
            workspaceId: target.workspaceId,
          }),
        false,
      );
    },
    error,
    input,
    masterReply,
    pending,
    presentRelatedConversation: (targetConversationId, title) => {
      if (!workspaceId || pending) {
        return;
      }
      void presentRelatedConversation(workspaceId, targetConversationId, title, setScopedError);
    },
    requestVoiceCapture: createVoiceCaptureCommand({
      available: available && !clarification,
      conversationId,
      paneId,
      setError: setScopedError,
      speechCapture,
      workspaceId,
    }),
    retryFailedInput: () => void retryFailedInput(),
    routingFailure: failedInput
      ? { message: failedInput.message, retryable: failedInput.retryable }
      : null,
    sendSide: async (sideConversationId, text) => {
      if (!available || pending) {
        return false;
      }
      const target = requireTarget();
      return run(
        () =>
          requireConversationCommand("sendSide")({
            parentConversationId: target.conversationId,
            sideConversationId,
            text,
            workspaceId: target.workspaceId,
          }),
        false,
      );
    },
    setInput,
    stop: () => {
      if (!available || pending) {
        return;
      }
      const target = requireTarget();
      void run(() => window.setta.conversations.stop(target), false);
    },
    submit: (event) => {
      event.preventDefault();
      if (!canSubmit) {
        return;
      }
      void runInput();
    },
    submitApproval: (approval, decision, answers) => {
      if (!available || pending) {
        return;
      }
      const target = requireTarget();
      void run(
        () =>
          window.setta.conversations.submitApproval({
            ...target,
            response: {
              answers,
              approvalId: approval.id,
              decision,
              response: "",
            },
          }),
        false,
      );
    },
  };
}

function conversationCommandsAvailable(
  workspaceId: string | null,
  conversationId: string | null,
  projection: ConversationProjection | undefined,
): boolean {
  if (!workspaceId || !conversationId || projection?.status !== "ready") {
    return false;
  }
  return Boolean(projection.snapshot && !projection.resync);
}

function conversationInputCanSubmit(available: boolean, pending: boolean, input: string): boolean {
  return available && !pending && input.trim() !== "";
}

function beginPendingSideCreationForInput(
  target: { conversationId: string; workspaceId: string },
  paneId: string | null,
): void {
  if (paneId) {
    beginPendingSideCreation(target.workspaceId, target.conversationId, paneId);
  }
}

function finishPendingSideCreationForInput(
  workspaceId: string | null,
  conversationId: string | null,
  paneId: string | null,
): void {
  if (workspaceId && conversationId && paneId) {
    finishPendingSideCreation(workspaceId, conversationId, paneId);
  }
}

function beginPendingSideCreation(
  workspaceId: string,
  conversationId: string,
  paneId: string,
): void {
  const key = sideCreationKey(workspaceId, conversationId, paneId);
  if (pendingSideCreationByPane.has(key)) {
    throw new Error("A side conversation is already being created for this pane.");
  }
  let resolveFinished = () => {};
  const pending: PendingSideCreation = {
    finished: new Promise<void>((resolve) => {
      resolveFinished = resolve;
    }),
    resolveFinished: () => resolveFinished(),
  };
  pendingSideCreationByPane.set(key, pending);
}

function finishPendingSideCreation(
  workspaceId: string,
  conversationId: string,
  paneId: string,
): void {
  const key = sideCreationKey(workspaceId, conversationId, paneId);
  const pending = pendingSideCreationByPane.get(key);
  if (!pending) {
    return;
  }
  pendingSideCreationByPane.delete(key);
  pending.resolveFinished();
}

async function waitForPendingSideCreation(
  workspaceId: string,
  conversationId: string,
  paneId: string,
): Promise<boolean> {
  const pending = pendingSideCreationByPane.get(
    sideCreationKey(workspaceId, conversationId, paneId),
  );
  if (!pending) {
    return false;
  }
  await pending.finished;
  return true;
}

function sideCreationKey(workspaceId: string, conversationId: string, paneId: string): string {
  return JSON.stringify([workspaceId, conversationId, paneId]);
}

export function createEasyButtonTextConversationInput({
  conversationId,
  id = globalThis.crypto.randomUUID(),
  paneId,
  replyToInputId = null,
  submittedAt = canonicalSpeechInputTimestamp(new Date()),
  text,
}: {
  conversationId: string;
  id?: string;
  paneId: string | null;
  replyToInputId?: string | null;
  submittedAt?: string;
  text: string;
}): ConversationInput {
  return {
    conversationId,
    id,
    modality: "text",
    replyToInputId,
    sourcePaneId: paneId,
    submittedAt,
    text,
  };
}

function assertAcceptedConversationInput(
  accepted: AcceptedConversationInput,
  submitted: ConversationInput,
): void {
  if (!acceptedConversationInputMatches(accepted, submitted)) {
    throw new Error("Conversation input intake returned an invalid receipt.");
  }
}

function requireConversationInputSubmitter(): NonNullable<
  (typeof window.setta.conversations)["submitInput"]
> {
  const submit = window.setta.conversations.submitInput;
  if (!submit) {
    throw new Error("Conversation input intake is unavailable.");
  }
  return submit;
}

function requireConversationInputWaiter(): NonNullable<
  (typeof window.setta.conversations)["waitInputState"]
> {
  const wait = window.setta.conversations.waitInputState;
  if (!wait) {
    throw new Error("Conversation input routing settlement is unavailable.");
  }
  return wait;
}

function requireConversationInputRetry(): NonNullable<
  (typeof window.setta.conversations)["retryInput"]
> {
  const retry = window.setta.conversations.retryInput;
  if (!retry) {
    throw new Error("Conversation input retry is unavailable.");
  }
  return retry;
}

function requireConversationInputDiscard(): NonNullable<
  (typeof window.setta.conversations)["discardInput"]
> {
  const discard = window.setta.conversations.discardInput;
  if (!discard) {
    throw new Error("Conversation input discard is unavailable.");
  }
  return discard;
}

type ConversationInputClarification = { inputId: string; question: string };
type FailedConversationInput = { inputId: string; message: string; retryable: boolean };

function applyConversationInputRoutingState(
  state: ConversationInputRoutingState,
  setClarification: (value: ConversationInputClarification | null) => void,
  setFailedInput: (value: FailedConversationInput | null) => void,
): string | null {
  const clarification = conversationInputClarification(state);
  setClarification(clarification);
  const failed = failedConversationInputState(state);
  if (failed) {
    const failure = conversationRoutingFailure(failed);
    setFailedInput(failure);
    return failure.message;
  }
  assertConversationInputSettled(state);
  setFailedInput(null);
  return null;
}

function failedConversationInputState(
  state: ConversationInputRoutingState,
): ConversationInputRoutingState["input"] | null {
  if (state.clarificationReply?.status === "failed") {
    return state.clarificationReply;
  }
  return state.input.status === "failed" ? state.input : null;
}

function conversationRoutingFailure(
  failed: ConversationInputRoutingState["input"],
): FailedConversationInput {
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

async function applyConversationRoutingPresentation({
  paneId,
  parentTitle,
  setMasterReply,
  state,
  target,
}: {
  paneId: string | null;
  parentTitle: string;
  setMasterReply: (reply: { kind: "answer" | "clarification"; text: string } | null) => void;
  state: ConversationInputRoutingState;
  target: { conversationId: string; workspaceId: string };
}): Promise<void> {
  const command = latestConversationRouteCommand(state);
  switch (command.kind) {
    case "create_side_conversation":
      return presentCreatedSideConversation(
        command.createSideConversation,
        parentTitle,
        setMasterReply,
        target,
      );
    case "fork_conversation":
      return presentForkedConversation(command.forkConversation, setMasterReply, target);
    case "escalate_to_master":
      return presentMasterEscalation(
        command.escalateToMaster,
        paneId,
        setMasterReply,
        state,
        target,
      );
    case "answer_as_narrator":
    case "clarify":
    case "queue_parent_turn":
    case "send_to_parent":
    case "steer_parent_turn":
      setMasterReply(null);
      return;
    default:
      return assertNeverConversationRouteKind(command.kind);
  }
}

function requireConversationRoutingScope(
  state: ConversationInputRoutingState,
  scope: {
    activeCommandScope: string;
    commandScope: string;
    conversationId: string | null;
    paneId: string | null;
    workspaceId: string | null;
  },
): { conversationId: string; workspaceId: string } {
  const matches = [
    scope.activeCommandScope === scope.commandScope,
    Boolean(scope.workspaceId),
    Boolean(scope.conversationId),
    state.input.input.conversationId === scope.conversationId,
    state.input.input.sourcePaneId === scope.paneId,
  ].every(Boolean);
  if (!matches) {
    throw new Error("Conversation routing result belongs to another Easy Button pane.");
  }
  return requireConversationRoutingTarget(scope.conversationId, scope.workspaceId);
}

function requireConversationRoutingTarget(
  conversationId: string | null,
  workspaceId: string | null,
): { conversationId: string; workspaceId: string } {
  if (!conversationId) {
    throw new Error("Conversation routing requires a conversation target.");
  }
  if (!workspaceId) {
    throw new Error("Conversation routing requires a workspace target.");
  }
  return { conversationId, workspaceId };
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
  parentTitle: string,
  setMasterReply: (reply: null) => void,
  target: { conversationId: string; workspaceId: string },
): Promise<void> {
  if (!side) {
    throw new Error("Conversation routing omitted its side-conversation command.");
  }
  setMasterReply(null);
  await presentConversationPane({
    conversationId: target.conversationId,
    preferredPaneId: side.parentPaneId,
    title: parentTitle,
    workspaceId: target.workspaceId,
  });
}

async function presentForkedConversation(
  fork: ConversationRouteCommand["forkConversation"],
  setMasterReply: (reply: null) => void,
  target: { workspaceId: string },
): Promise<void> {
  if (!fork) {
    throw new Error("Conversation routing omitted its fork command.");
  }
  setMasterReply(null);
  await presentConversationPane({
    conversationId: fork.childConversationId,
    title: fork.proposedTitle,
    workspaceId: target.workspaceId,
  });
}

async function presentMasterEscalation(
  escalation: ConversationRouteCommand["escalateToMaster"],
  paneId: string | null,
  setMasterReply: (reply: { kind: "answer" | "clarification"; text: string } | null) => void,
  state: ConversationInputRoutingState,
  target: { conversationId: string; workspaceId: string },
): Promise<void> {
  if (!escalation) {
    throw new Error("Conversation routing omitted its master-escalation command.");
  }
  const intent = await requireMasterPresentationWaiter()({ inputId: escalation.masterInputId });
  validateConversationMasterPresentation(intent, escalation.masterInputId, state, target, paneId);
  if (intent.kind === "show_master_reply") {
    presentMasterReply(intent, setMasterReply);
    return;
  }
  await presentMasterConversationNavigation(intent, setMasterReply);
}

function presentMasterReply(
  intent: PresentationIntent,
  setMasterReply: (reply: { kind: "answer" | "clarification"; text: string }) => void,
): void {
  const reply = intent.showMasterReply;
  if (!reply) {
    throw new Error("Master presentation omitted its reply.");
  }
  setMasterReply({ kind: reply.replyKind, text: reply.text });
}

async function presentMasterConversationNavigation(
  intent: PresentationIntent,
  setMasterReply: (reply: null) => void,
): Promise<void> {
  const request = conversationPaneRequestForPresentationIntent(intent);
  if (!request) {
    throw new Error("Master presentation omitted its conversation target.");
  }
  setMasterReply(null);
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
  ].every(Boolean);
  if (!validResolution) {
    throw new Error("Master presentation returned an invalid pane resolution.");
  }
}

function validateConversationMasterPresentation(
  intent: PresentationIntent,
  masterInputId: string,
  state: ConversationInputRoutingState,
  target: { conversationId: string; workspaceId: string },
  paneId: string | null,
): void {
  const inputId = state.input.input.id;
  if (
    intent.inputId !== masterInputId ||
    intent.id !== `master-presentation:${masterInputId}` ||
    intent.source !== "conversation_escalation" ||
    intent.originatingWorkspaceId !== target.workspaceId ||
    intent.originatingConversationId !== target.conversationId ||
    intent.originatingConversationInputId !== inputId ||
    intent.originatingPaneId !== paneId
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

function conversationInputClarification(
  state: ConversationInputRoutingState,
): ConversationInputClarification | null {
  if (state.input.status !== "awaiting_clarification") {
    return null;
  }
  const decision = state.decisions.at(-1);
  const question = decision?.resultingCommand.clarify?.question;
  if (decision?.resultingCommand.kind !== "clarify" || !question) {
    throw new Error("Conversation routing requested clarification without a question.");
  }
  return { inputId: state.input.input.id, question };
}

type OptionalConversationCommand = "disposeSide" | "sendSide";

function requireConversationCommand<Command extends OptionalConversationCommand>(
  command: Command,
): NonNullable<(typeof window.setta.conversations)[Command]> {
  const implementation = window.setta.conversations[command];
  if (!implementation) {
    throw new Error(`Conversation command ${command} is unavailable.`);
  }
  return implementation as NonNullable<(typeof window.setta.conversations)[Command]>;
}

async function presentRelatedConversation(
  workspaceId: string,
  conversationId: string,
  knownTitle: string | null,
  setError: (error: string | null) => void,
): Promise<void> {
  setError(null);
  try {
    let title = knownTitle;
    if (!title) {
      const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
      hydrateConversationProjectionSnapshot(snapshot);
      title = snapshot.conversation.title;
    }
    await presentConversationPane({ conversationId, title, workspaceId });
  } catch (error) {
    setError(errorMessage(error));
  }
}

export async function requestEasyButtonPaneClose({
  confirm,
  conversationId,
  paneId,
  workspaceId,
}: {
  confirm: (message: string) => boolean;
  conversationId: string;
  paneId: string;
  workspaceId: string;
}): Promise<{ removePane: boolean }> {
  const creationWasPending = await waitForPendingSideCreation(workspaceId, conversationId, paneId);
  const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
  hydrateConversationProjectionSnapshot(snapshot);
  const side = openSideConversationForPane(snapshot, paneId);
  if (!side) {
    return { removePane: true };
  }
  if (
    side.activeTurnId &&
    !creationWasPending &&
    !confirm("End the active side conversation and close this pane?")
  ) {
    return { removePane: false };
  }
  const disposed = await requireConversationCommand("disposeSide")({
    parentConversationId: conversationId,
    parentPaneId: paneId,
    sideConversationId: side.id,
    workspaceId,
  });
  hydrateConversationProjectionSnapshot(disposed);
  return { removePane: true };
}

export function requestEasyButtonSpeechCapture(
  speechCapture: SpeechCaptureRequester,
  workspaceId: string,
  conversationId: string,
  paneId: string,
): Promise<void> {
  return speechCapture.start(conversationSpeechCaptureRequest(workspaceId, conversationId, paneId));
}

function createVoiceCaptureCommand({
  available,
  conversationId,
  paneId,
  setError,
  speechCapture,
  workspaceId,
}: {
  available: boolean;
  conversationId: string | null;
  paneId: string | null;
  setError: (error: string | null) => void;
  speechCapture: SpeechCaptureRequester | undefined;
  workspaceId: string | null;
}): (() => void) | undefined {
  if (!available || !workspaceId || !conversationId || !paneId || !speechCapture) {
    return undefined;
  }
  return () => {
    setError(null);
    void requestEasyButtonSpeechCapture(speechCapture, workspaceId, conversationId, paneId).catch(
      (captureError: unknown) => setError(errorMessage(captureError)),
    );
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation command failed";
}
