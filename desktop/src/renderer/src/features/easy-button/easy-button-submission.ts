import type { EasyRun } from "@generated/backend";
import type { EasyRunSteerResult } from "@shared/easy-run-ipc";
import type { RefObject } from "react";

import type { SpeechCaptureIntent } from "./speech-capture-controller";

interface EasyButtonSubmissionActions {
  start: (workspaceId: string, requestText: string) => Promise<EasyRun>;
  steer: (workspaceId: string, text: string) => Promise<EasyRunSteerResult>;
}

interface EasyButtonSubmission extends EasyButtonSubmissionActions {
  intent: SpeechCaptureIntent;
  requestText: string;
  workspaceId: string;
}

interface CompletedSpeechSubmission extends EasyButtonSubmissionActions {
  inputRef: RefObject<HTMLInputElement | null>;
  intent: SpeechCaptureIntent;
  setInputValue: (value: string) => void;
  setPendingAction: (pending: boolean) => void;
  transcript: string;
  workspaceId: string;
}

interface TypedSubmission extends EasyButtonSubmissionActions {
  inputRef: RefObject<HTMLInputElement | null>;
  intent: SpeechCaptureIntent;
  requestText: string;
  setInputValue: (value: string) => void;
  setPendingAction: (pending: boolean) => void;
  workspaceId: string;
}

export async function performEasyButtonSubmission({
  intent,
  requestText,
  start,
  steer,
  workspaceId,
}: EasyButtonSubmission): Promise<EasyRunSteerResult | null> {
  if (intent === "steer") {
    return steer(workspaceId, requestText);
  }
  await start(workspaceId, requestText);
  return null;
}

export async function submitCompletedSpeechTranscript({
  inputRef,
  intent,
  setInputValue,
  setPendingAction,
  start,
  steer,
  transcript,
  workspaceId,
}: CompletedSpeechSubmission): Promise<void> {
  setPendingAction(true);
  try {
    const steeringResult = await performEasyButtonSubmission({
      intent,
      requestText: transcript,
      start,
      steer,
      workspaceId,
    });
    if (steeringResult?.kind === "failure" && !steeringResult.operationApplied) {
      throw new Error(steeringResult.message);
    }
    setInputValue("");
    if (steeringResult?.kind === "failure") {
      inputRef.current?.blur();
    }
  } catch (error) {
    setInputValue(transcript);
    throw error;
  } finally {
    setPendingAction(false);
  }
}

export async function submitTypedEasyButtonRequest({
  inputRef,
  intent,
  requestText,
  setInputValue,
  setPendingAction,
  start,
  steer,
  workspaceId,
}: TypedSubmission): Promise<void> {
  setPendingAction(true);
  try {
    const steeringResult = await performEasyButtonSubmission({
      intent,
      requestText,
      start,
      steer,
      workspaceId,
    });
    setInputValue("");
    if (steeringResult?.kind === "failure") {
      inputRef.current?.blur();
    }
  } catch {
    inputRef.current?.focus();
  } finally {
    setPendingAction(false);
  }
}
