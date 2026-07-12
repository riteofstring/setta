import {
  speechVoiceIDValues,
  type ConversationInput,
  type SpeechCapabilities,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { AppShellSpeechCaptureSnapshot } from "./app-shell-speech-capture-controller";
import type {
  NarratorSpeechPlaybackIntent,
  SpeechPlaybackSnapshot,
} from "./app-shell-speech-playback-controller";
import {
  globalSpeechCapturePresentation,
  paneSpeechPresentation,
  shellSpeechCaptureAction,
  shellSpeechCaptureControlLabel,
  shellSpeechCaptureLabel,
  shellSpeechPlaybackLabel,
  shellSpeechStatusLabel,
} from "./global-speech-presentation";
import { conversationSpeechCaptureRequest } from "./speech-capture-destination";

describe("global speech presentation", () => {
  test("attributes one frozen conversation capture across its source pane, duplicate view, and other topics", () => {
    const snapshot = captureSnapshot({
      capture: {
        captureSessionId: "capture-alpha",
        request: conversationSpeechCaptureRequest(
          "workspace-alpha",
          "conversation-alpha",
          "pane-alpha",
        ),
        transcript: "partial words",
        type: "listening",
      },
    });
    const capture = globalSpeechCapturePresentation(snapshot);
    const playback = idlePlayback();

    expect(shellSpeechCaptureAction(capture)).toBe("commit");
    expect(shellSpeechCaptureControlLabel(capture, "Alpha topic")).toBe(
      "Finish the voice request for Alpha topic",
    );
    expect(shellSpeechCaptureLabel(capture, "Alpha topic")).toBe("Listening for Alpha topic");
    expect(
      paneSpeechPresentation(capture, playback, {
        conversationId: "conversation-alpha",
        paneId: "pane-alpha",
      }),
    ).toMatchObject({
      activityLabel: "Listening",
      captureScope: "this_pane",
      captureState: "listening",
      transcriptPreview: "partial words",
      voiceControlDisabled: false,
      voiceControlLabel: "Finish this voice request",
    });
    expect(
      paneSpeechPresentation(capture, playback, {
        conversationId: "conversation-alpha",
        paneId: "pane-alpha-copy",
      }),
    ).toMatchObject({
      activityLabel: "Listening in another view",
      captureScope: "this_conversation",
      transcriptPreview: null,
      voiceControlDisabled: true,
    });
    expect(
      paneSpeechPresentation(capture, playback, {
        conversationId: "conversation-beta",
        paneId: "pane-beta",
      }),
    ).toMatchObject({
      activityLabel: "Listening for another topic",
      captureScope: "other_conversation",
      transcriptPreview: null,
      voiceControlDisabled: true,
    });
  });

  test("attributes narrator playback to every duplicate topic view without claiming another topic", () => {
    const capture = globalSpeechCapturePresentation(captureSnapshot());
    const playback = speakingPlayback("conversation-alpha");

    expect(shellSpeechPlaybackLabel(playback, "Alpha topic")).toBe(
      "Alpha topic narrator is speaking",
    );
    expect(
      shellSpeechStatusLabel(
        { source: null, state: "idle" },
        "Start a voice request for Setta",
        "Alpha topic narrator is speaking",
      ),
    ).toBe("Alpha topic narrator is speaking");
    expect(
      paneSpeechPresentation(
        capture,
        playback,
        { conversationId: "conversation-alpha", paneId: "pane-alpha" },
        "Alpha topic",
      ),
    ).toMatchObject({
      activityKind: "speaking",
      activityLabel: "Narrator speaking",
      playbackScope: "this_conversation",
      playbackState: "speaking",
    });
    expect(
      paneSpeechPresentation(
        capture,
        playback,
        { conversationId: "conversation-beta", paneId: "pane-beta" },
        "Alpha topic",
      ),
    ).toMatchObject({
      activityKind: "speaking",
      activityLabel: "Alpha topic narrator speaking",
      playbackScope: "other_conversation",
    });
  });

  test("keeps direct capture and frozen submission retry explicit", () => {
    const idle = globalSpeechCapturePresentation(captureSnapshot());
    expect(idle).toEqual({ source: null, state: "idle" });
    expect(shellSpeechCaptureAction(idle)).toBe("start");
    expect(shellSpeechCaptureControlLabel(idle)).toBe("Start a voice request for Setta");

    const input = conversationInput();
    const failed = globalSpeechCapturePresentation(
      captureSnapshot({
        completedConversationTranscript: {
          captureSessionId: input.id,
          input,
          request: conversationSpeechCaptureRequest(
            "workspace-alpha",
            input.conversationId,
            input.sourcePaneId!,
          ),
          runtimeId: "runtime-speech",
          transcript: input.text,
        },
        conversationSubmission: {
          input,
          message: "Retry the exact frozen transcript.",
          type: "failed",
        },
      }),
    );

    expect(failed).toMatchObject({
      message: "Retry the exact frozen transcript.",
      retry: "conversation",
      source: {
        conversationId: "conversation-alpha",
        sourcePaneId: "pane-alpha",
        type: "conversation",
      },
      state: "failed",
    });
    expect(shellSpeechCaptureAction(failed)).toBe("retry_conversation");
    expect(shellSpeechCaptureControlLabel(failed, "Alpha topic")).toBe(
      "Retry the voice request for Alpha topic",
    );
  });
});

function captureSnapshot(
  overrides: Partial<AppShellSpeechCaptureSnapshot> = {},
): AppShellSpeechCaptureSnapshot {
  return {
    availability: { capabilities: capabilities(), type: "configured" },
    capture: { type: "idle" },
    completedConversationTranscript: null,
    completedTranscript: null,
    conversationSubmission: { type: "idle" },
    masterSubmission: { type: "idle" },
    runtimeId: "runtime-speech",
    ...overrides,
  };
}

function idlePlayback(): SpeechPlaybackSnapshot {
  return { queued: [], state: { type: "idle" } };
}

function speakingPlayback(conversationId: string): SpeechPlaybackSnapshot {
  return {
    queued: [],
    state: {
      intent: narratorIntent(conversationId),
      type: "speaking",
    },
  };
}

function narratorIntent(conversationId: string): NarratorSpeechPlaybackIntent {
  return {
    kind: "status_reply",
    resolvedVoiceId: "cedar",
    source: {
      conversationId,
      eventId: "narration-status",
      speaker: "narrator",
    },
    sourceSequenceEnd: 4,
    sourceSequenceStart: 3,
    turnId: "turn-alpha",
  };
}

function conversationInput(): ConversationInput {
  return {
    conversationId: "conversation-alpha",
    id: "capture-alpha",
    modality: "voice",
    replyToInputId: null,
    sourcePaneId: "pane-alpha",
    submittedAt: "2026-07-12T20:00:00Z",
    text: "Exact frozen transcript.",
  };
}

function capabilities(): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "Voice is AI-generated.",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus: "configured",
    synthesisModel: "gpt-4o-mini-tts",
    transcriptionModel: "gpt-realtime-whisper",
    voiceCatalog: {
      provider: "openai",
      version: "test",
      voiceIds: [...speechVoiceIDValues],
    },
  };
}
