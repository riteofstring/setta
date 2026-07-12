import type { SpeechTranscriptionSession } from "@generated/backend";
import { openAIRealtimeClientEventType } from "@generated/openai-realtime";
import { describe, expect, test, vi } from "vitest";

import type {
  RealtimeTranscriptionError,
  RealtimeTranscriptionErrorCode,
} from "./realtime-transcription-error";
import {
  createRealtimeTranscriptionTransport,
  type RealtimeDataChannelPort,
  type RealtimePeerConnectionPort,
  type RealtimeTranscriptionDependencies,
} from "./realtime-transcription-transport";
import type { RealtimeTranscriptionUpdate } from "./realtime-transcription-session";

describe("Realtime transcription WebRTC transport", () => {
  test("posts only SDP with the ephemeral credential and waits for the provider session", async () => {
    const harness = createHarness();

    harness.channel.open();
    expect(await pendingState(harness.transport.ready)).toBe("pending");
    harness.channel.message(sessionCreatedEvent("sess_provider"));

    await expect(harness.transport.ready).resolves.toEqual({
      captureSessionId: "capture_current",
      providerSessionId: "sess_provider",
    });
    expect(harness.peer.dataChannelLabel).toBe("oai-events");
    expect(harness.peer.addedTracks).toEqual([harness.track]);
    expect(harness.request).toMatchObject({
      body: "offer-sdp",
      cache: "no-store",
      credentials: "omit",
      method: "POST",
      redirect: "error",
      referrerPolicy: "no-referrer",
      url: "https://api.openai.com/v1/realtime/calls",
    });
    expect(harness.request?.headers).toEqual({
      Accept: "application/sdp",
      Authorization: "Bearer ephemeral_secret",
      "Content-Type": "application/sdp",
    });
    expect(harness.peer.localDescriptions).toEqual([{ sdp: "offer-sdp", type: "offer" }]);
    expect(harness.peer.remoteDescriptions).toEqual([{ sdp: "answer-sdp", type: "answer" }]);
    expect(harness.channel.sent).toEqual([]);
  });

  test("accepts the live provider's text/plain SDP response", async () => {
    const harness = createHarness({
      response: new Response("answer-sdp", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        status: 201,
      }),
    });

    await establish(harness);

    expect(harness.peer.remoteDescriptions).toEqual([{ sdp: "answer-sdp", type: "answer" }]);
    expect(harness.errors).toEqual([]);
  });

  test("streams correlated deltas before commit and emits the authoritative completion", async () => {
    const harness = createHarness();
    await establish(harness);

    harness.channel.message(deltaEvent("item_current", "Hello worl"));
    harness.channel.message(deltaEvent("item_current", "d"));
    expect(harness.track.enabled).toBe(true);
    expect(harness.channel.sent).toEqual([]);
    harness.transport.commit();
    expect(harness.track.enabled).toBe(false);
    expect(harness.channel.sent).toEqual([
      JSON.stringify({ type: openAIRealtimeClientEventType.inputAudioBufferCommit }),
    ]);
    harness.channel.message(conversationItemDoneEvent("item_current"));
    harness.channel.message(committedEvent("item_current"));
    harness.channel.message(conversationItemAddedEvent("item_current"));
    harness.channel.message(completedEvent("item_current", "Hello, world."));

    expect(harness.updates).toEqual([
      {
        captureSessionId: "capture_current",
        delta: "Hello worl",
        itemId: "item_current",
        providerSessionId: "sess_provider",
        transcript: "Hello worl",
        type: "delta",
      },
      {
        captureSessionId: "capture_current",
        delta: "d",
        itemId: "item_current",
        providerSessionId: "sess_provider",
        transcript: "Hello world",
        type: "delta",
      },
      {
        captureSessionId: "capture_current",
        itemId: "item_current",
        providerSessionId: "sess_provider",
        transcript: "Hello, world.",
        type: "completed",
      },
    ]);
    expect(harness.errors).toEqual([]);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.channel.closed).toBe(true);
    expect(harness.peer.closed).toBe(true);
  });

  test("rejects cross-item events and ignores every stale message after teardown", async () => {
    const harness = createHarness();
    await establish(harness);
    harness.channel.message(deltaEvent("item_current", "accepted"));
    harness.transport.commit();
    harness.channel.message(committedEvent("item_current"));

    harness.channel.message(deltaEvent("item_stale", "do not accept"));
    harness.channel.message(completedEvent("item_current", "also ignored"));

    expect(harness.errors.map((error) => error.code)).toEqual(["protocol_violation"]);
    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0]).toMatchObject({ transcript: "accepted", type: "delta" });
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });

  test("rejects duplicate provider sessions without changing the established identity", async () => {
    const harness = createHarness();
    await establish(harness);

    harness.channel.message(sessionCreatedEvent("sess_stale"));

    expect(harness.errors.map((error) => error.code)).toEqual(["protocol_violation"]);
    expect(harness.updates).toEqual([]);
  });

  test("enforces the backend-provided transcript limit by Unicode character", async () => {
    const harness = createHarness({ maximumTranscriptCharacters: 2 });
    await establish(harness);
    harness.channel.message(deltaEvent("item_current", "😀😀"));
    harness.channel.message(deltaEvent("item_current", "é"));

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0]).toMatchObject({ transcript: "😀😀", type: "delta" });
    expect(harness.errors.map((error) => error.code)).toEqual(["transcript_too_large"]);
  });

  test("maps strict decoder and provider transcription failures without exposing provider prose", async () => {
    const malformed = createHarness();
    await establish(malformed);
    malformed.channel.message(
      JSON.stringify({ event_id: "event_unknown", type: "response.created" }),
    );
    expect(malformed.errors.map((error) => error.code)).toEqual(["malformed_event"]);

    const providerFailure = createHarness();
    await establish(providerFailure);
    providerFailure.transport.commit();
    providerFailure.channel.message(committedEvent("item_current"));
    providerFailure.channel.message(
      JSON.stringify({
        content_index: 0,
        error: {
          code: "sentinel_provider_code",
          message: "sentinel private provider prose",
          type: "transcription_error",
        },
        event_id: "event_failed",
        item_id: "item_current",
        type: "conversation.item.input_audio_transcription.failed",
      }),
    );
    expect(providerFailure.errors).toHaveLength(1);
    expect(providerFailure.errors[0]?.code).toBe("transcription_failed");
    expect(providerFailure.errors[0]?.message).not.toContain("sentinel");
  });

  test("fails when the channel or peer disconnects and stops every media resource", async () => {
    const channelFailure = createHarness();
    await establish(channelFailure);
    channelFailure.channel.disconnect();
    expect(channelFailure.errors.map((error) => error.code)).toEqual(["connection_lost"]);
    expect(channelFailure.track.stop).toHaveBeenCalledOnce();

    const peerFailure = createHarness();
    await establish(peerFailure);
    peerFailure.peer.changeConnectionState("failed");
    expect(peerFailure.errors.map((error) => error.code)).toEqual(["connection_lost"]);
    expect(peerFailure.track.stop).toHaveBeenCalledOnce();
  });

  test("explicit close is silent, aborts setup, and prevents late provider callbacks", async () => {
    const controller = new AbortController();
    const harness = createHarness({ signal: controller.signal });

    controller.abort();

    await expect(harness.transport.ready).rejects.toMatchObject({ code: "aborted" });
    harness.channel.open();
    harness.channel.message(sessionCreatedEvent("sess_late"));
    expect(harness.errors).toEqual([]);
    expect(harness.updates).toEqual([]);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.peer.closed).toBe(true);
    expect(harness.request).toBeNull();
  });

  test.each([
    { code: "provider_response_malformed", status: 200 },
    { code: "provider_rejected", status: 401 },
    { code: "provider_rate_limited", status: 429 },
    { code: "provider_unavailable", status: 503 },
    { code: "provider_response_malformed", status: 400 },
  ] satisfies Array<{ code: RealtimeTranscriptionErrorCode; status: number }>)(
    "maps provider status $status to $code without reading its body",
    async ({ code, status }) => {
      const harness = createHarness({
        response: new Response("sentinel private provider body", {
          headers: { "Content-Type": "text/plain" },
          status,
        }),
      });

      await expect(harness.transport.ready).rejects.toMatchObject({ code });
      expect(harness.errors.map((error) => error.code)).toEqual([code]);
      expect(harness.errors[0]?.message).not.toContain("sentinel");
      expect(harness.track.stop).toHaveBeenCalledOnce();
    },
  );

  test("rejects malformed SDP responses before applying a remote description", async () => {
    const wrongType = createHarness({
      response: new Response("answer-sdp", {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    });
    await expect(wrongType.transport.ready).rejects.toMatchObject({
      code: "provider_response_malformed",
    });
    expect(wrongType.peer.remoteDescriptions).toEqual([]);

    const oversized = createHarness({
      response: new Response("answer-sdp", {
        headers: { "Content-Length": "65537", "Content-Type": "application/sdp" },
        status: 201,
      }),
    });
    await expect(oversized.transport.ready).rejects.toMatchObject({
      code: "provider_response_malformed",
    });
    expect(oversized.peer.remoteDescriptions).toEqual([]);

    const chunkedOverflow = createHarness({
      response: new Response("x".repeat(65_537), {
        headers: { "Content-Type": "application/sdp" },
        status: 201,
      }),
    });
    await expect(chunkedOverflow.transport.ready).rejects.toMatchObject({
      code: "provider_response_malformed",
    });
    expect(chunkedOverflow.peer.remoteDescriptions).toEqual([]);

    const truncated = createHarness({
      response: new Response("answer-sdp", {
        headers: { "Content-Length": "100", "Content-Type": "application/sdp" },
        status: 201,
      }),
    });
    await expect(truncated.transport.ready).rejects.toMatchObject({
      code: "provider_response_malformed",
    });

    const invalidUTF8 = createHarness({
      response: new Response(new Uint8Array([0xff]), {
        headers: { "Content-Type": "application/sdp" },
        status: 201,
      }),
    });
    await expect(invalidUTF8.transport.ready).rejects.toMatchObject({
      code: "provider_response_malformed",
    });
  });

  test("rejects expired sessions and non-audio streams before creating a peer", () => {
    const expired = createHarnessInput();
    expired.session.expiresAt = new Date(999).toISOString();
    expect(() => createRealtimeTranscriptionTransport(expired.options)).toThrowError(
      expect.objectContaining({ code: "invalid_session" }),
    );
    expect(expired.track.stop).toHaveBeenCalledOnce();
    expect(expired.createPeerConnection).not.toHaveBeenCalled();

    const invalidMedia = createHarnessInput({ mediaKind: "video" });
    expect(() => createRealtimeTranscriptionTransport(invalidMedia.options)).toThrowError(
      expect.objectContaining({ code: "invalid_media" }),
    );
    expect(invalidMedia.track.stop).toHaveBeenCalledOnce();
    expect(invalidMedia.createPeerConnection).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    const aborted = createHarnessInput({ signal: controller.signal });
    expect(() => createRealtimeTranscriptionTransport(aborted.options)).toThrowError(
      expect.objectContaining({ code: "aborted" }),
    );
    expect(aborted.track.stop).toHaveBeenCalledOnce();
    expect(aborted.createPeerConnection).not.toHaveBeenCalled();
  });

  test("does not allow commit before provider readiness or a second commit", async () => {
    const harness = createHarness();
    expect(() => harness.transport.commit()).toThrowError(
      expect.objectContaining({ code: "connection_failed" }),
    );
    await establish(harness);
    harness.transport.commit();
    expect(() => harness.transport.commit()).toThrowError(
      expect.objectContaining({ code: "connection_failed" }),
    );
    harness.transport.close();
  });

  test("closes a partially created peer when browser WebRTC setup throws", () => {
    const input = createHarnessInput();
    input.peer.createDataChannel = () => {
      throw new Error("browser setup failed");
    };

    expect(() => createRealtimeTranscriptionTransport(input.options)).toThrowError(
      expect.objectContaining({ code: "connection_failed" }),
    );
    expect(input.peer.closed).toBe(true);
    expect(input.track.stop).toHaveBeenCalledOnce();
  });

  test("maps a data-channel commit failure and tears down the microphone", async () => {
    const harness = createHarness();
    await establish(harness);
    harness.channel.send = () => {
      throw new Error("data channel send failed");
    };

    harness.transport.commit();

    expect(harness.errors.map((error) => error.code)).toEqual(["connection_lost"]);
    expect(harness.track.enabled).toBe(false);
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.peer.closed).toBe(true);
  });
});

type FakeTrack = MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };

interface CapturedRequest {
  body: BodyInit | null | undefined;
  cache: RequestCache | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
  method: string | undefined;
  redirect: RequestRedirect | undefined;
  referrerPolicy: ReferrerPolicy | undefined;
  url: string;
}

interface Harness {
  channel: FakeDataChannel;
  errors: RealtimeTranscriptionError[];
  peer: FakePeerConnection;
  readonly request: CapturedRequest | null;
  track: FakeTrack;
  transport: ReturnType<typeof createRealtimeTranscriptionTransport>;
  updates: RealtimeTranscriptionUpdate[];
}

interface HarnessOptions {
  maximumTranscriptCharacters?: number;
  response?: Response;
  signal?: AbortSignal;
}

function createHarness(options: HarnessOptions = {}): Harness {
  const input = createHarnessInput(options);
  const transport = createRealtimeTranscriptionTransport(input.options);
  return {
    channel: input.peer.channel,
    errors: input.errors,
    peer: input.peer,
    get request() {
      return input.request;
    },
    track: input.track,
    transport,
    updates: input.updates,
  };
}

function createHarnessInput(options: HarnessOptions & { mediaKind?: "audio" | "video" } = {}) {
  const errors: RealtimeTranscriptionError[] = [];
  const updates: RealtimeTranscriptionUpdate[] = [];
  const peer = new FakePeerConnection();
  const createPeerConnection = vi.fn(() => peer);
  const track = createFakeTrack(options.mediaKind ?? "audio");
  const stream = createFakeStream(track);
  const session = createSession(options.maximumTranscriptCharacters ?? 8_000);
  let request: CapturedRequest | null = null;
  const dependencies: RealtimeTranscriptionDependencies = {
    createPeerConnection,
    fetch: async (url, init) => {
      request = captureRequest(url, init);
      return (
        options.response ??
        new Response("answer-sdp", {
          headers: { "Content-Type": "application/sdp" },
          status: 201,
        })
      );
    },
    now: () => 1_000,
  };
  return {
    createPeerConnection,
    errors,
    get request() {
      return request;
    },
    options: {
      captureSessionId: "capture_current",
      dependencies,
      onError: (error: RealtimeTranscriptionError) => errors.push(error),
      onTranscript: (update: RealtimeTranscriptionUpdate) => updates.push(update),
      session,
      signal: options.signal,
      stream,
    },
    peer,
    session,
    stream,
    track,
    updates,
  };
}

function createSession(maximumTranscriptCharacters: number): SpeechTranscriptionSession {
  return {
    clientSecret: "ephemeral_secret",
    expiresAt: new Date(60_000).toISOString(),
    maximumRecordingSeconds: 120,
    maximumTranscriptCharacters,
    transcriptionDelay: "medium",
    transcriptionModel: "gpt-realtime-whisper",
    webRTCURL: "https://api.openai.com/v1/realtime/calls",
  };
}

function createFakeTrack(kind: "audio" | "video"): FakeTrack {
  return {
    enabled: true,
    kind,
    readyState: "live",
    stop: vi.fn(),
  } as unknown as FakeTrack;
}

function createFakeStream(track: FakeTrack): MediaStream {
  return {
    getAudioTracks: () => (track.kind === "audio" ? [track] : []),
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function captureRequest(url: string, init: RequestInit): CapturedRequest {
  return {
    body: init.body,
    cache: init.cache,
    credentials: init.credentials,
    headers: init.headers,
    method: init.method,
    redirect: init.redirect,
    referrerPolicy: init.referrerPolicy,
    url,
  };
}

async function establish(harness: Harness): Promise<void> {
  harness.channel.open();
  harness.channel.message(sessionCreatedEvent("sess_provider"));
  await harness.transport.ready;
}

async function pendingState(promise: Promise<unknown>): Promise<"pending" | "settled"> {
  return Promise.race([
    promise.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    Promise.resolve("pending" as const),
  ]);
}

function sessionCreatedEvent(providerSessionId: string): string {
  return JSON.stringify({
    event_id: `event_${providerSessionId}`,
    session: { id: providerSessionId, type: "transcription" },
    type: "session.created",
  });
}

function conversationItemAddedEvent(itemId: string): string {
  return JSON.stringify({
    event_id: `event_added_${itemId}`,
    item: { id: itemId, role: "user", type: "message" },
    type: "conversation.item.added",
  });
}

function conversationItemDoneEvent(itemId: string): string {
  return JSON.stringify({
    event_id: `event_done_${itemId}`,
    item: { id: itemId, role: "user", type: "message" },
    type: "conversation.item.done",
  });
}

function committedEvent(itemId: string): string {
  return JSON.stringify({
    event_id: `event_committed_${itemId}`,
    item_id: itemId,
    type: "input_audio_buffer.committed",
  });
}

function deltaEvent(itemId: string, delta: string): string {
  return JSON.stringify({
    content_index: 0,
    delta,
    event_id: `event_delta_${delta}`,
    item_id: itemId,
    type: "conversation.item.input_audio_transcription.delta",
  });
}

function completedEvent(itemId: string, transcript: string): string {
  return JSON.stringify({
    content_index: 0,
    event_id: "event_completed",
    item_id: itemId,
    transcript,
    type: "conversation.item.input_audio_transcription.completed",
    usage: { seconds: 1, type: "duration" },
  });
}

class FakeDataChannel implements RealtimeDataChannelPort {
  closed = false;
  handlers: Parameters<RealtimeDataChannelPort["setHandlers"]>[0] | null = null;
  readyState: RTCDataChannelState = "connecting";
  sent: string[] = [];

  clearHandlers = (): void => {
    this.handlers = null;
  };

  close = (): void => {
    this.closed = true;
    this.readyState = "closed";
  };

  disconnect(): void {
    this.readyState = "closed";
    this.handlers?.close();
  }

  message(data: unknown): void {
    this.handlers?.message(data);
  }

  open(): void {
    this.readyState = "open";
    this.handlers?.open();
  }

  send = (data: string): void => {
    this.sent.push(data);
  };

  setHandlers = (handlers: Parameters<RealtimeDataChannelPort["setHandlers"]>[0]): void => {
    this.handlers = handlers;
  };
}

class FakePeerConnection implements RealtimePeerConnectionPort {
  addedTracks: MediaStreamTrack[] = [];
  channel = new FakeDataChannel();
  closed = false;
  connectionState: RTCPeerConnectionState = "new";
  connectionStateHandler: (() => void) | null = null;
  dataChannelLabel: string | null = null;
  localDescriptions: RTCSessionDescriptionInit[] = [];
  remoteDescriptions: RTCSessionDescriptionInit[] = [];

  addTrack = (track: MediaStreamTrack): void => {
    this.addedTracks.push(track);
  };

  changeConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.connectionStateHandler?.();
  }

  clearConnectionStateHandler = (): void => {
    this.connectionStateHandler = null;
  };

  close = (): void => {
    this.closed = true;
    this.connectionState = "closed";
  };

  createDataChannel = (label: string): FakeDataChannel => {
    this.dataChannelLabel = label;
    return this.channel;
  };

  createOffer = async (): Promise<RTCSessionDescriptionInit> => ({
    sdp: "offer-sdp",
    type: "offer",
  });

  setConnectionStateHandler = (handler: () => void): void => {
    this.connectionStateHandler = handler;
  };

  setLocalDescription = async (description: RTCSessionDescriptionInit): Promise<void> => {
    this.localDescriptions.push(description);
  };

  setRemoteDescription = async (description: RTCSessionDescriptionInit): Promise<void> => {
    this.remoteDescriptions.push(description);
  };
}
