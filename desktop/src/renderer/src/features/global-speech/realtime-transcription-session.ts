import {
  openAIRealtimeClientEventType,
  openAIRealtimeServerEventType,
} from "@generated/openai-realtime";

import { RealtimeTranscriptionError } from "./realtime-transcription-error";
import type { RealtimeTranscriptionServerEvent } from "./realtime-transcription-events";

export type RealtimeTranscriptionUpdate =
  | {
      captureSessionId: string;
      delta: string;
      itemId: string;
      providerSessionId: string;
      transcript: string;
      type: "delta";
    }
  | {
      captureSessionId: string;
      itemId: string;
      providerSessionId: string;
      transcript: string;
      type: "completed";
    };

type RealtimeTranscriptionFailureOrAdministrativeEvent = Extract<
  RealtimeTranscriptionServerEvent,
  {
    type:
      | typeof openAIRealtimeServerEventType.transcriptionFailed
      | typeof openAIRealtimeServerEventType.error
      | typeof openAIRealtimeServerEventType.rateLimitsUpdated;
  }
>;

export class RealtimeTranscriptionSession {
  private readonly captureSessionId: string;
  private readonly maximumTranscriptCharacters: number;

  private addedItemObserved = false;
  private commitStarted = false;
  private committedItemObserved = false;
  private completed = false;
  private doneItemObserved = false;
  private itemIdValue: string | null = null;
  private partialTranscript = "";
  private providerSessionIdValue: string | null = null;

  constructor(captureSessionId: string, maximumTranscriptCharacters: number) {
    this.captureSessionId = captureSessionId;
    this.maximumTranscriptCharacters = maximumTranscriptCharacters;
  }

  get providerSessionId(): string | null {
    return this.providerSessionIdValue;
  }

  beginCommit(): void {
    if (this.providerSessionIdValue === null || this.commitStarted || this.completed) {
      throw protocolViolation(
        openAIRealtimeClientEventType.inputAudioBufferCommit,
        "the session is not ready to commit",
      );
    }
    this.commitStarted = true;
  }

  accept(event: RealtimeTranscriptionServerEvent): RealtimeTranscriptionUpdate | null {
    if (this.completed) {
      throw protocolViolation(event.type, "the transcription is already complete");
    }
    switch (event.type) {
      case openAIRealtimeServerEventType.sessionCreated:
        this.acceptProviderSession(event.providerSessionId);
        return null;
      case openAIRealtimeServerEventType.inputAudioBufferCommitted:
        this.acceptCommittedItem(event.itemId);
        return null;
      case openAIRealtimeServerEventType.conversationItemAdded:
        this.acceptAddedItem(event.itemId);
        return null;
      case openAIRealtimeServerEventType.conversationItemDone:
        this.acceptDoneItem(event.itemId);
        return null;
      case openAIRealtimeServerEventType.transcriptionDelta:
        return this.acceptTranscriptDelta(event.itemId, event.contentIndex, event.delta);
      case openAIRealtimeServerEventType.transcriptionCompleted:
        return this.acceptCompletedTranscript(event.itemId, event.contentIndex, event.transcript);
      default:
        return this.acceptFailureOrAdministrativeEvent(event);
    }
  }

  private acceptFailureOrAdministrativeEvent(
    event: RealtimeTranscriptionFailureOrAdministrativeEvent,
  ): null {
    switch (event.type) {
      case openAIRealtimeServerEventType.transcriptionFailed:
        this.acceptTranscriptItem(event.type, event.itemId, event.contentIndex);
        throw new RealtimeTranscriptionError(
          "transcription_failed",
          "OpenAI could not transcribe the recorded audio.",
        );
      case openAIRealtimeServerEventType.error:
        throw new RealtimeTranscriptionError(
          "transcription_failed",
          "OpenAI reported a Realtime transcription error.",
        );
      case openAIRealtimeServerEventType.rateLimitsUpdated:
        return null;
      default:
        return assertNever(event);
    }
  }

  private acceptProviderSession(providerSessionId: string): void {
    if (this.providerSessionIdValue !== null || this.commitStarted) {
      throw protocolViolation(
        openAIRealtimeServerEventType.sessionCreated,
        "the provider session was already established",
      );
    }
    this.providerSessionIdValue = providerSessionId;
  }

  private acceptCommittedItem(itemId: string): void {
    this.requireCommitStarted(openAIRealtimeServerEventType.inputAudioBufferCommitted);
    if (this.committedItemObserved) {
      throw protocolViolation(
        openAIRealtimeServerEventType.inputAudioBufferCommitted,
        "the committed item was already acknowledged",
      );
    }
    this.bindItem(openAIRealtimeServerEventType.inputAudioBufferCommitted, itemId);
    this.committedItemObserved = true;
  }

  private acceptAddedItem(itemId: string): void {
    this.requireCommitStarted(openAIRealtimeServerEventType.conversationItemAdded);
    if (this.addedItemObserved) {
      throw protocolViolation(
        openAIRealtimeServerEventType.conversationItemAdded,
        "the conversation item was already added",
      );
    }
    this.bindItem(openAIRealtimeServerEventType.conversationItemAdded, itemId);
    this.addedItemObserved = true;
  }

  private acceptDoneItem(itemId: string): void {
    this.requireCommitStarted(openAIRealtimeServerEventType.conversationItemDone);
    if (this.doneItemObserved) {
      throw protocolViolation(
        openAIRealtimeServerEventType.conversationItemDone,
        "the conversation item was already completed",
      );
    }
    this.bindItem(openAIRealtimeServerEventType.conversationItemDone, itemId);
    this.doneItemObserved = true;
  }

  private acceptTranscriptDelta(
    itemId: string,
    contentIndex: number,
    delta: string,
  ): RealtimeTranscriptionUpdate {
    this.acceptTranscriptItem(
      openAIRealtimeServerEventType.transcriptionDelta,
      itemId,
      contentIndex,
    );
    const transcript = this.partialTranscript + delta;
    this.assertTranscriptLength(transcript);
    this.partialTranscript = transcript;
    return {
      captureSessionId: this.captureSessionId,
      delta,
      itemId,
      providerSessionId: this.requireProviderSessionId(),
      transcript,
      type: "delta",
    };
  }

  private acceptCompletedTranscript(
    itemId: string,
    contentIndex: number,
    transcript: string,
  ): RealtimeTranscriptionUpdate {
    this.requireCommitStarted(openAIRealtimeServerEventType.transcriptionCompleted);
    this.acceptTranscriptItem(
      openAIRealtimeServerEventType.transcriptionCompleted,
      itemId,
      contentIndex,
    );
    this.assertTranscriptLength(transcript);
    this.completed = true;
    return {
      captureSessionId: this.captureSessionId,
      itemId,
      providerSessionId: this.requireProviderSessionId(),
      transcript,
      type: "completed",
    };
  }

  private requireCommitStarted(eventType: string): void {
    if (!this.commitStarted) {
      throw protocolViolation(eventType, "audio commit was not requested");
    }
  }

  private acceptTranscriptItem(eventType: string, itemId: string, contentIndex: number): void {
    if (contentIndex !== 0) {
      throw protocolViolation(eventType, "the transcript content index is not zero");
    }
    this.requireProviderSessionId();
    this.bindItem(eventType, itemId);
  }

  private bindItem(eventType: string, itemId: string): void {
    if (this.itemIdValue !== null && this.itemIdValue !== itemId) {
      throw protocolViolation(eventType, "the event belongs to a different transcription item");
    }
    this.itemIdValue = itemId;
  }

  private assertTranscriptLength(transcript: string): void {
    if ([...transcript].length > this.maximumTranscriptCharacters) {
      throw new RealtimeTranscriptionError(
        "transcript_too_large",
        `Realtime transcript exceeds ${this.maximumTranscriptCharacters} characters.`,
      );
    }
  }

  private requireProviderSessionId(): string {
    if (this.providerSessionIdValue === null) {
      throw protocolViolation(
        "transcript",
        "the provider session was not established before transcription",
      );
    }
    return this.providerSessionIdValue;
  }
}

function protocolViolation(eventType: string, reason: string): RealtimeTranscriptionError {
  return new RealtimeTranscriptionError(
    "protocol_violation",
    `Realtime transcription protocol violation for ${eventType}: ${reason}.`,
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Realtime transcription event: ${JSON.stringify(value)}`);
}
