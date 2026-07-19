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
  test("attributes one locally recording conversation capture to its source pane and other topics", () => {
    const snapshot = captureSnapshot({
      capture: {
        captureSessionId: "capture-alpha",
        request: conversationSpeechCaptureRequest(
          "workspace-alpha",
          "conversation-alpha",
          "pane-alpha",
        ),
        transcript: "partial words",
        connection: "connecting",
        type: "recording",
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
      captureState: "recording",
      transcriptPreview: "partial words",
      voiceControlDisabled: false,
      voiceControlLabel: "Finish this voice request",
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

  test("attributes narrator playback to its topic without claiming another topic", () => {
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
      speakingIntentKind: "status_reply",
      speakingSourceEventId: "narration-status",
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
      speakingIntentKind: null,
      speakingSourceEventId: null,
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

  test("routes missing voice credentials to Settings voice setup", () => {
    const capture = globalSpeechCapturePresentation(
      captureSnapshot({
        availability: {
          message: "Voice is not connected. Add your OpenAI API key in Settings -> Voices.",
          setupAction: "open_voice_credential_settings",
          type: "not_configured",
        },
      }),
    );

    expect(capture).toEqual({
      message: "Voice is not connected. Add your OpenAI API key in Settings -> Voices.",
      setupAction: "open_voice_credential_settings",
      source: null,
      state: "unavailable",
    });
    expect(shellSpeechCaptureAction(capture)).toBe("open_voice_credential_settings");
    expect(shellSpeechCaptureControlLabel(capture)).toBe(
      "Set up OpenAI voice in Settings -> Voices",
    );
    expect(
      paneSpeechPresentation(capture, idlePlayback(), {
        conversationId: "conversation-alpha",
        paneId: "pane-alpha",
      }),
    ).toMatchObject({
      captureState: "unavailable",
      voiceControlDisabled: false,
      voiceControlLabel: "Set up OpenAI voice in Settings -> Voices",
      voiceControlSetupAction: "open_voice_credential_settings",
    });
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
      kind: "narration_event",
      speaker: "narrator",
    },
    sourceCreatedAt: "2026-07-12T20:00:00Z",
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
