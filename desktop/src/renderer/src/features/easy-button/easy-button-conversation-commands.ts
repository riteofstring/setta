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

export interface EasyButtonConversationCommands {
  askStatus: () => void;
  available: boolean;
  canSubmit: boolean;
  error: string | null;
  input: string;
  pending: boolean;
  requestVoiceCapture: (() => void) | undefined;
  setInput: (input: string) => void;
  steer: () => void;
  stop: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  submitApproval: (
    approval: TrajectoryApprovalRequest,
    decision: TrajectoryApprovalDecision,
    answers: ConversationApprovalAnswer[],
  ) => void;
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
  ): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const snapshot = await command();
      hydrateConversationProjectionSnapshot(snapshot);
      if (clearInput) {
        setInput("");
      }
    } catch (commandError) {
      setError(errorMessage(commandError));
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
    error,
    input,
    pending,
    requestVoiceCapture: createVoiceCaptureCommand({
      available,
      conversationId,
      paneId,
      setError,
      speechCapture,
    }),
    setInput,
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
