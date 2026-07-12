import type {
  AcceptedConversationInput,
  ConversationApprovalAnswer,
  ConversationInput,
  ConversationInputRoutingState,
  ConversationSnapshot,
  TrajectoryApprovalDecision,
  TrajectoryApprovalRequest,
} from "@generated/backend";
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import {
  type ConversationRoutingPresentationState,
  conversationRoutingPresentation,
  useConversationRoutingStore,
} from "../../stores/conversation-routing-store";
import { requestConversationPaneNavigation } from "../../workspace-layout/conversation-pane-coordinator";
import {
  conversationSpeechCaptureRequest,
  type SpeechCaptureRequester,
} from "../global-speech/speech-capture-destination";
import { acceptedConversationInputMatches } from "../global-speech/global-speech-conversation-submission";
import { canonicalSpeechInputTimestamp } from "../global-speech/speech-input-submission";
import { openSideConversationForPane } from "./easy-button-side-projection";
import {
  applyConversationRoutingPresentation,
  clearConversationRoutingMasterReply,
  discardConversationRoutingFailure,
  isConversationRoutingFailure,
} from "./conversation-routing-presentation";

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
  const routingPresentation = useConversationRoutingStore((state) =>
    conversationRoutingCommandState(
      conversationRoutingPresentation(state.presentations, workspaceId, conversationId),
    ),
  );
  const { clarification, masterReply, routingFailure: failedInput } = routingPresentation;
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
        conversationId,
        paneId,
        workspaceId,
      });
      await applyConversationRoutingPresentation(target.workspaceId, state);
    },
    [conversationId, paneId, workspaceId],
  );
  usePendingSideCreationCompletion(
    workspaceId,
    conversationId,
    paneId,
    conversationProjectionSnapshot(projection),
  );
  useEffect(() => {
    setPending(false);
    setInput("");
    setError(null);
  }, [conversationId, paneId, workspaceId]);

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
    try {
      const target = requireTarget();
      clearConversationRoutingMasterReply(target.workspaceId, target.conversationId);
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
      setConversationRoutingCommandError(commandError, setScopedError);
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
    try {
      const target = requireTarget();
      clearConversationRoutingMasterReply(target.workspaceId, target.conversationId);
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
      setConversationRoutingCommandError(retryError, setScopedError);
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
      discardConversationRoutingFailure(
        target.workspaceId,
        target.conversationId,
        failedInput.inputId,
      );
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
    error: conversationRoutingError(error, failedInput),
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
      available: conversationVoiceCaptureAvailable(available, clarification),
      conversationId,
      paneId,
      setError: setScopedError,
      speechCapture,
      workspaceId,
    }),
    retryFailedInput: () => void retryFailedInput(),
    routingFailure: conversationRoutingFailurePresentation(failedInput),
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

const emptyConversationRoutingCommandState = Object.freeze({
  clarification: null,
  masterReply: null,
  routingFailure: null,
});

function conversationRoutingCommandState(
  presentation: ConversationRoutingPresentationState | undefined,
): Pick<ConversationRoutingPresentationState, "clarification" | "masterReply" | "routingFailure"> {
  return presentation ?? emptyConversationRoutingCommandState;
}

function conversationProjectionSnapshot(
  projection: ConversationProjection | undefined,
): ConversationSnapshot | null | undefined {
  return projection ? projection.snapshot : undefined;
}

function conversationRoutingError(
  error: string | null,
  failure: ConversationRoutingPresentationState["routingFailure"],
): string | null {
  return failure ? failure.message : error;
}

function setConversationRoutingCommandError(
  error: unknown,
  setError: (error: string | null) => void,
): void {
  if (!isConversationRoutingFailure(error)) {
    setError(errorMessage(error));
  }
}

function conversationVoiceCaptureAvailable(
  available: boolean,
  clarification: ConversationRoutingPresentationState["clarification"],
): boolean {
  return available && !clarification;
}

function conversationRoutingFailurePresentation(
  failure: ConversationRoutingPresentationState["routingFailure"],
): { message: string; retryable: boolean } | null {
  return failure ? { message: failure.message, retryable: failure.retryable } : null;
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

function requireConversationRoutingScope(
  state: ConversationInputRoutingState,
  scope: {
    conversationId: string | null;
    paneId: string | null;
    workspaceId: string | null;
  },
): { conversationId: string; workspaceId: string } {
  const submitted = state.clarificationReply ?? state.input;
  const matches = [
    Boolean(scope.workspaceId),
    Boolean(scope.conversationId),
    submitted.input.conversationId === scope.conversationId,
    submitted.input.sourcePaneId === scope.paneId,
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

async function presentConversationPane(
  request: Parameters<typeof requestConversationPaneNavigation>[0],
): Promise<void> {
  const result = await requestConversationPaneNavigation(request);
  if (result.kind === "blocked") {
    throw new Error(result.reason);
  }
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
