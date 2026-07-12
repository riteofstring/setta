import type {
  ConversationApprovalAnswer,
  ConversationInputMode,
  ConversationSnapshot,
  TrajectoryApprovalDecision,
  TrajectoryApprovalRequest,
} from "@generated/backend";
import { type FormEvent, useState } from "react";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { hydrateConversationProjectionSnapshot } from "../../stores/conversation-projection-runtime";
import {
  conversationSpeechCaptureRequest,
  type SpeechCaptureRequester,
} from "../global-speech/speech-capture-destination";
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
  fork: (forkedAtTurnId: string, title: string) => Promise<boolean>;
  input: string;
  pending: boolean;
  presentRelatedConversation: (conversationId: string, title: string | null) => void;
  requestVoiceCapture: (() => void) | undefined;
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
  closeRequested: boolean;
  finished: Promise<void>;
  resolveFinished: () => void;
}

interface PendingSideCreationControl {
  closeRequested: () => boolean;
  finish: () => void;
}

const pendingSideCreationByPane = new Map<string, PendingSideCreation>();

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
  const available = Boolean(
    workspaceId &&
    conversationId &&
    projection?.status === "ready" &&
    projection.snapshot &&
    !projection.resync,
  );
  const canSubmit = available && !pending && input.trim() !== "";

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
      const target = requireTarget();
      void run(
        () => window.setta.conversations.askStatus({ ...target, question: input.trim() }),
        true,
      );
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
    fork: async (forkedAtTurnId, title) => {
      if (!available || pending) {
        return false;
      }
      const target = requireTarget();
      setPending(true);
      setError(null);
      try {
        const child = await window.setta.conversations.fork({
          forkedAtTurnId,
          parentConversationId: target.conversationId,
          title,
          workspaceId: target.workspaceId,
        });
        hydrateConversationProjectionSnapshot(child);
        const presentation = requestConversationPanePresentation({
          conversationId: child.conversation.id,
          title: child.conversation.title,
          workspaceId: child.conversation.workspaceId,
        });
        if (presentation.kind === "blocked") {
          setError(`Fork created, but its pane could not be opened: ${presentation.reason}`);
        }
        return true;
      } catch (commandError) {
        setError(errorMessage(commandError));
        return false;
      } finally {
        setPending(false);
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
    startSide: createSideCommand({
      available,
      canSubmit,
      conversationId,
      input,
      paneId,
      pending,
      setError,
      setInput,
      setPending,
      workspaceId,
    }),
    steer: () => {
      if (!canSubmit) {
        return;
      }
      const target = requireTarget();
      void run(() => window.setta.conversations.steer({ ...target, text: input.trim() }), true);
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
      const target = requireTarget();
      const text = input.trim();
      const active =
        projection?.snapshot?.conversation.status === "working" ||
        projection?.snapshot?.conversation.status === "waiting_for_approval";
      void run(
        () =>
          active
            ? window.setta.conversations.queue({ ...target, text })
            : window.setta.conversations.send({ ...target, text }),
        true,
      );
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

function createSideCommand({
  available,
  canSubmit,
  conversationId,
  input,
  paneId,
  pending,
  setError,
  setInput,
  setPending,
  workspaceId,
}: {
  available: boolean;
  canSubmit: boolean;
  conversationId: string | null;
  input: string;
  paneId: string | null;
  pending: boolean;
  setError: (error: string | null) => void;
  setInput: (input: string) => void;
  setPending: (pending: boolean) => void;
  workspaceId: string | null;
}): (() => void) | undefined {
  if (
    !available ||
    !conversationId ||
    !paneId ||
    !workspaceId ||
    !window.setta.conversations.createSide ||
    !window.setta.conversations.sendSide
  ) {
    return undefined;
  }
  return () => {
    if (!canSubmit || pending) {
      return;
    }
    const text = input.trim();
    setPending(true);
    setError(null);
    const sideCreation = beginPendingSideCreation(workspaceId, conversationId, paneId);
    void (async () => {
      try {
        const created = await requireConversationCommand("createSide")({
          parentConversationId: conversationId,
          parentPaneId: paneId,
          workspaceId,
        });
        hydrateConversationProjectionSnapshot(created);
        const side = openSideConversationForPane(created, paneId);
        if (!side || side.status !== "active") {
          throw new Error("The side conversation did not become active.");
        }
        if (sideCreation.closeRequested()) {
          setInput("");
          return;
        }
        sideCreation.finish();
        const sent = await requireConversationCommand("sendSide")({
          parentConversationId: conversationId,
          sideConversationId: side.id,
          text,
          workspaceId,
        });
        hydrateConversationProjectionSnapshot(sent);
        setInput("");
      } catch (commandError) {
        setError(errorMessage(commandError));
      } finally {
        sideCreation.finish();
        setPending(false);
      }
    })();
  };
}

function beginPendingSideCreation(
  workspaceId: string,
  conversationId: string,
  paneId: string,
): PendingSideCreationControl {
  const key = sideCreationKey(workspaceId, conversationId, paneId);
  let resolveFinished = () => {};
  const pending: PendingSideCreation = {
    closeRequested: false,
    finished: new Promise<void>((resolve) => {
      resolveFinished = resolve;
    }),
    resolveFinished: () => resolveFinished(),
  };
  pendingSideCreationByPane.set(key, pending);
  let finished = false;
  return {
    closeRequested: () => pending.closeRequested,
    finish: () => {
      if (finished) {
        return;
      }
      finished = true;
      if (pendingSideCreationByPane.get(key) === pending) {
        pendingSideCreationByPane.delete(key);
      }
      pending.resolveFinished();
    },
  };
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
  pending.closeRequested = true;
  await pending.finished;
  return true;
}

function sideCreationKey(workspaceId: string, conversationId: string, paneId: string): string {
  return JSON.stringify([workspaceId, conversationId, paneId]);
}

type OptionalConversationCommand = "createSide" | "disposeSide" | "sendSide";

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
}): (() => void) | undefined {
  if (!available || !conversationId || !paneId || !speechCapture) {
    return undefined;
  }
  return () => {
    setError(null);
    void requestEasyButtonSpeechCapture(speechCapture, conversationId, paneId).catch(
      (captureError: unknown) => setError(errorMessage(captureError)),
    );
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Conversation command failed";
}
