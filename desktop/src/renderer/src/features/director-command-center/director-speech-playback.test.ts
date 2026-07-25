import type { DirectorReceipt, DirectorVoiceSelection } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";
import {
  directorSpeechPlaybackIntent,
  enqueueDirectorSpeechPlayback,
} from "./director-speech-playback";

describe("Director speech playback", () => {
  test("derives an app-scoped speech source from durable Director reply receipts", async () => {
    const receipt = directorReplyReceipt("answer_directly", "Nothing is running right now.");

    expect(directorSpeechPlaybackIntent(receipt, directorVoice())).toEqual({
      kind: "director_reply",
      resolvedVoiceId: "marin",
      source: {
        conversationId: null,
        eventId: "director-intent-answer",
        speaker: "director",
      },
      sourceCreatedAt: null,
    });

    expect(
      directorSpeechPlaybackIntent(
        {
          ...receipt,
          submit: {
            ...receipt.submit!,
            decision: "send_to_workstream",
            publicText: "",
            workstreamId: "workstream-alpha",
          },
        },
        directorVoice(),
      ),
    ).toBeNull();

    const controller = playbackController();
    const enqueue = vi.spyOn(controller, "enqueueAutomatic");
    await enqueueDirectorSpeechPlayback({
      controller,
      readDirectorVoiceSelection: async () => directorVoice(),
      receipt,
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "director_reply",
        source: expect.objectContaining({ speaker: "director" }),
      }),
    );
  });
});

function playbackController(): AppShellSpeechPlaybackController {
  return new AppShellSpeechPlaybackController({
    createAbortController: () => new AbortController(),
    createAudio: () => {
      throw new Error("audio is not used by this playback intent test");
    },
    createObjectURL: () => "blob:unused",
    decodeBase64: () => new Uint8Array(),
    logPlayback: () => {},
    logSupersession: () => {},
    now: () => Date.parse("2026-07-25T18:00:00Z"),
    revokeObjectURL: () => {},
    synthesize: () => new Promise(() => {}),
  });
}

function directorReplyReceipt(
  decision: NonNullable<NonNullable<DirectorReceipt["submit"]>["decision"]>,
  publicText: string,
): DirectorReceipt {
  return {
    kind: "submit",
    selectedWorkstreamId: null,
    submit: {
      decision,
      intentId: "director-intent-answer",
      publicText,
      resolution: "model",
      resourceRequestId: null,
      workstreamId: null,
    },
  };
}

function directorVoice(): DirectorVoiceSelection {
  return {
    requestedVoiceId: null,
    resolvedVoiceId: "marin",
    reuse: null,
    selection: "auto_distinct",
    updatedAt: "2026-07-25T18:00:00Z",
  };
}
