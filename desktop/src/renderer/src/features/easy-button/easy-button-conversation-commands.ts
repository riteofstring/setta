import type {
  AcceptedConversationInput,
  ConversationApprovalAnswer,
  ConversationInput,
  ConversationInputMode,
  ConversationSnapshot,
  TrajectoryApprovalDecision,
  TrajectoryApprovalRequest,
} from "@generated/backend";
import { type FormEvent, useEffect, useState } from "react";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import {
  conversationSpeechCaptureRequest,
  type SpeechCaptureRequester,
} from "../global-speech/speech-capture-destination";
import { canonicalSpeechInputTimestamp } from "../global-speech/speech-input-submission";
import {
  requestConversationPanePresentation,
  type ConversationPanePresentationResult,
} from "../../workspace-layout/conversation-pane-coordinator";
import { openSideConversationForPane } from "./easy-button-side-projection";

export interface EasyButtonConversationCommands {
  askStatus: () => void;
  available: boolean;
  canSubmit: boolean;
  disposeSide: (sideConversationId: string) => void;
  error: string | null;
  fork: () => void;
  input: string;
  pending: boolean;
  presentRelatedConversation: (conversationId: string, title: string | null) => void;
  queue: () => void;
  requestVoiceCapture: ((inputMode?: ConversationInputMode) => void) | undefined;
  send: () => void;
  sendSide: (sideConversationId: string, text: string) => Promise<boolean>;
  setInput: (input: string) => void;
  startSide: (() => void) | undefined;
  steer: () => void;
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
  const available = conversationCommandsAvailable(workspaceId, conversationId, projection);
  const canSubmit = conversationInputCanSubmit(available, pending, input);
  usePendingSideCreationCompletion(workspaceId, conversationId, paneId, projection?.snapshot);

  async function run(
    command: () => Promise<ConversationSnapshot>,
    clearInput: boolean,
  ): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const snapshot = await command();
      hydrateConversationProjectionSnapshot(snapshot);
      if (clearInput) {
        setInput("");
      }
      return true;
    } catch (commandError) {
      setError(errorMessage(commandError));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function runInput(inputMode: ConversationInputMode): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const target = requireTarget();
      const submitted = createEasyButtonTextConversationInput({
        conversationId: target.conversationId,
        inputMode,
        paneId,
        text: input.trim(),
      });
      beginPendingSideCreationForInput(inputMode, target, paneId);
      const accepted = await requireConversationInputSubmitter()({ input: submitted });
      assertAcceptedConversationInput(accepted, submitted);
      setInput("");
      return true;
    } catch (commandError) {
      finishPendingSideCreationForInput(inputMode, workspaceId, conversationId, paneId);
      setError(errorMessage(commandError));
      return false;
    } finally {
      setPending(false);
    }
  }

  function requireTarget(): { conversationId: string; workspaceId: string } {
    if (!available || !conversationId || !workspaceId) {
      throw new Error("Conversation commands require a ready topic conversation.");
    }
    return { conversationId, workspaceId };
  }

  return {
    askStatus: () => {
      if (!canSubmit) {
        return;
      }
      void runInput("ask_narrator");
    },
    available,
    canSubmit,
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
    fork: () => {
      if (canSubmit) {
        void runInput("fork");
      }
    },
    input,
    pending,
    presentRelatedConversation: (targetConversationId, title) => {
      if (!workspaceId || pending) {
        return;
      }
      void presentRelatedConversation(workspaceId, targetConversationId, title, setError);
    },
    requestVoiceCapture: createVoiceCaptureCommand({
      available,
      conversationId,
      paneId,
      setError,
      speechCapture,
    }),
    queue: () => {
      if (canSubmit) {
        void runInput("queue");
      }
    },
    send: () => {
      if (canSubmit) {
        void runInput("send");
      }
    },
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
    startSide: createSideInputCommand(available, paneId, canSubmit, runInput),
    steer: () => {
      if (!canSubmit) {
        return;
      }
      void runInput("steer");
    },
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
      void runInput("route");
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

function createSideInputCommand(
  available: boolean,
  paneId: string | null,
  canSubmit: boolean,
  runInput: (inputMode: ConversationInputMode) => Promise<boolean>,
): (() => void) | undefined {
  if (!available || !paneId) {
    return undefined;
  }
  return () => {
    if (canSubmit) {
      void runInput("side");
    }
  };
}

function beginPendingSideCreationForInput(
  inputMode: ConversationInputMode,
  target: { conversationId: string; workspaceId: string },
  paneId: string | null,
): void {
  if (inputMode === "side" && paneId) {
    beginPendingSideCreation(target.workspaceId, target.conversationId, paneId);
  }
}

function finishPendingSideCreationForInput(
  inputMode: ConversationInputMode,
  workspaceId: string | null,
  conversationId: string | null,
  paneId: string | null,
): void {
  if (inputMode === "side" && workspaceId && conversationId && paneId) {
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
  inputMode = "route",
  paneId,
  submittedAt = canonicalSpeechInputTimestamp(new Date()),
  text,
}: {
  conversationId: string;
  id?: string;
  inputMode?: ConversationInputMode;
  paneId: string | null;
  submittedAt?: string;
  text: string;
}): ConversationInput {
  return {
    conversationId,
    id,
    modality: "text",
    replyToInputId: null,
    requestedMode: inputMode,
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

function acceptedConversationInputMatches(
  accepted: AcceptedConversationInput,
  submitted: ConversationInput,
): boolean {
  if (!Number.isSafeInteger(accepted.sequence) || accepted.sequence <= 0) {
    return false;
  }
  if (accepted.status !== "accepted" || accepted.acceptedAt === "") {
    return false;
  }
  const fields = [
    "id",
    "conversationId",
    "sourcePaneId",
    "replyToInputId",
    "text",
    "modality",
    "requestedMode",
    "submittedAt",
  ] as const satisfies readonly (keyof ConversationInput)[];
  return fields.every((field) => accepted.input[field] === submitted[field]);
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
    const result = requestConversationPanePresentation({ conversationId, title, workspaceId });
    reportPresentationFailure(result, setError);
  } catch (error) {
    setError(errorMessage(error));
  }
}

function reportPresentationFailure(
  result: ConversationPanePresentationResult,
  setError: (error: string | null) => void,
): void {
  if (result.kind === "blocked") {
    setError(result.reason);
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
  conversationId: string,
  paneId: string,
  inputMode: ConversationInputMode = "route",
): Promise<void> {
  return speechCapture.start(conversationSpeechCaptureRequest(conversationId, paneId, inputMode));
}

function createVoiceCaptureCommand({
  available,
  conversationId,
  paneId,
  setError,
  speechCapture,
}: {
  available: boolean;
  conversationId: string | null;
  paneId: string | null;
  setError: (error: string | null) => void;
  speechCapture: SpeechCaptureRequester | undefined;
}): ((inputMode?: ConversationInputMode) => void) | undefined {
  if (!available || !conversationId || !paneId || !speechCapture) {
    return undefined;
  }
  return (inputMode = "route") => {
    setError(null);
    void requestEasyButtonSpeechCapture(speechCapture, conversationId, paneId, inputMode).catch(
      (captureError: unknown) => setError(errorMessage(captureError)),
    );
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation command failed";
}
