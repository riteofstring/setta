import { describe, expect, test, vi } from "vitest";

import {
  backendProtocolVersion,
  speechVoiceIDValues,
  type ConversationEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { authenticatedWebFetch, createWebSettaAPI } from "./setta-web-api";
import type { WebEventStreamActivity } from "./web-event-stream-activity";

describe("web SettaAPI request auth", () => {
  test("injects bearer authorization while preserving existing headers", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: BackendFetch = async (_input, init = {}) => {
      capturedInit = init;
      return new Response("{}", { status: 200 });
    };
    const wrapped = authenticatedWebFetch(
      fetchImpl,
      () => "token_web",
      () => {},
    );

    await wrapped(new URL("https://runtime.example/workspace-session"), {
      headers: { "X-Test": "yes" },
      method: "GET",
    });

    expect(capturedInit?.method).toBe("GET");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token_web");
    expect(headers.get("X-Test")).toBe("yes");
  });

  test("reports revoked credentials on unauthorized responses", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl: BackendFetch = async () => new Response("{}", { status: 401 });
    const wrapped = authenticatedWebFetch(fetchImpl, () => "token_web", onUnauthorized);

    await wrapped(new URL("https://runtime.example/workspace-session"), { method: "GET" });

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});

describe("web SettaAPI unpaired runtime state", () => {
  test("reports disconnected without opening streams or throwing during boot subscriptions", async () => {
    withWebGlobals();
    const calls: string[] = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input) => {
        calls.push(input.pathname);
        if (input.pathname === "/runtime/info") {
          return jsonResponse(runtimeInfo());
        }
        throw new Error(`unexpected request while unpaired: ${input.pathname}`);
      },
      streamActivity: controlledStreamActivity().activity,
    });

    const unsubscribe = api.conversations.onEvent(() => {});
    const snapshot = await api.runtimes.current();

    expect(snapshot.connection.status).toBe("disconnected");
    expect(snapshot.connection.message).toBe("Pair this browser with the runtime.");
    expect(calls).toEqual(["/runtime/info"]);
    expect(() => unsubscribe()).not.toThrow();
    expect(() => api.workspace.session()).toThrow(
      "Pair this browser with the runtime before using Setta.",
    );
  });

  test("starts inert stream subscriptions after pairing completes", async () => {
    withWebGlobals();
    const calls: Array<{ authorization: string | null; path: string }> = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        const headers = new Headers(init.headers);
        calls.push({ authorization: headers.get("Authorization"), path: input.pathname });
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          case "/conversations/events":
            return new Response("", { status: 200 });
          case "/codex/account/events":
            return new Response(codexAccountSSE(), { status: 200 });
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
      streamActivity: controlledStreamActivity().activity,
    });

    const unsubscribe = api.conversations.onEvent(() => {});
    const accountListener = vi.fn();
    const unsubscribeAccount = api.codexAccount.onChanged(accountListener);
    await api.conversations.subscribe({
      conversationId: "conversation_web",
      cursor: { sequence: 0, streamId: "conversation_stream_web" },
      workspaceId: "workspace_web",
    });
    expect(calls.map((call) => call.path)).toEqual([]);

    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_web&tok=token_pair");
    await waitFor(() => calls.some((call) => call.path === "/conversations/events"));
    await waitFor(() => accountListener.mock.calls.length === 1);

    const eventStreamCall = calls.find((call) => call.path === "/conversations/events");
    expect(eventStreamCall?.authorization).toBe("Bearer token_web");
    const accountEventStreamCall = calls.find((call) => call.path === "/codex/account/events");
    expect(accountEventStreamCall?.authorization).toBe("Bearer token_web");
    expect(accountListener).toHaveBeenCalledWith({
      reason: "snapshot_required",
      sequence: 0,
      streamId: "codex-account-stream-web",
    });
    unsubscribe();
    unsubscribeAccount();
  });

  test("disconnects while inactive and resumes once from the last conversation cursor", async () => {
    withWebGlobals();
    const streamActivity = controlledStreamActivity();
    const event = conversationResyncEvent(3);
    const streamCalls: Array<{ lastEventId: string | null; signal: AbortSignal }> = [];
    const forwarded: ConversationEvent[] = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          case "/conversations/events": {
            const signal = init.signal as AbortSignal;
            streamCalls.push({
              lastEventId: new Headers(init.headers).get("Last-Event-ID"),
              signal,
            });
            const body =
              streamCalls.length === 1
                ? conversationSSE(event, signal)
                : streamUntilAbort("", signal);
            return new Response(body, { status: 200 });
          }
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
      streamActivity: streamActivity.activity,
    });
    const unsubscribe = api.conversations.onEvent((current) => forwarded.push(current));
    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_web&tok=token_pair");
    await api.conversations.subscribe({
      conversationId: "conversation_web",
      cursor: { sequence: 0, streamId: "conversation-stream-web" },
      workspaceId: "workspace_web",
    });
    await waitFor(() => forwarded.length === 1);

    streamActivity.setActive(false);
    await waitFor(() => streamCalls[0]?.signal.aborted === true);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(streamCalls).toHaveLength(1);

    streamActivity.setActive(true);
    await waitFor(() => streamCalls.length === 2);

    expect(streamCalls.map((call) => call.lastEventId)).toEqual([
      "conversation-stream-web:0",
      "conversation-stream-web:3",
    ]);
    unsubscribe();
    await api.conversations.release({
      conversationId: "conversation_web",
      keepAlive: false,
      workspaceId: "workspace_web",
    });
  });

  test("exposes authenticated generated speech operations", async () => {
    withWebGlobals();
    const requests: Array<{ authorization: string | null; body: unknown; path: string }> = [];
    const api = createWebSettaAPI({
      fetchImpl: async (input, init = {}) => {
        const headers = new Headers(init.headers);
        requests.push({
          authorization: headers.get("Authorization"),
          body: typeof init.body === "string" ? JSON.parse(init.body) : null,
          path: input.pathname,
        });
        const speechResponse = webSpeechResponse(input.pathname);
        if (speechResponse) {
          return speechResponse;
        }
        switch (input.pathname) {
          case "/runtime/info":
            return jsonResponse(runtimeInfo());
          case "/pairing/complete":
            return jsonResponse({
              deviceId: "device_web",
              deviceToken: "token_web",
              protocolVersion: backendProtocolVersion,
              runtimeId: "runtime_web",
            });
          case "/devices/list":
            return jsonResponse({ devices: [] });
          default:
            throw new Error(`unexpected request: ${input.pathname}`);
        }
      },
      streamActivity: controlledStreamActivity().activity,
    });
    await api.runtimes.addByPairingUrl("setta://pair?rt=runtime_web&tok=token_pair");
    requests.length = 0;

    const capabilities = await api.speech.readCapabilities();
    const session = await api.speech.createTranscriptionSession();
    expect(capabilities.providerStatus).toBe("configured");
    expect(session.clientSecret).toBe("ek_web_ephemeral");
    expect(requests).toEqual([
      { authorization: "Bearer token_web", body: null, path: "/speech/capabilities" },
      {
        authorization: "Bearer token_web",
        body: {},
        path: "/speech/transcription/sessions",
      },
    ]);
  });
});

function withWebGlobals() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "http://127.0.0.1:7345" },
      open: vi.fn(),
      prompt: vi.fn(),
      clearTimeout,
      setTimeout,
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Mozilla/5.0 Chrome",
    },
  });
}

function runtimeInfo() {
  return {
    backendName: "setta-backend",
    backendVersion: "test",
    displayName: "Web runtime",
    infrastructureProvider: {
      displayName: "Unknown provider",
      iconUrl: "",
      id: "unknown",
    },
    protocolVersion: backendProtocolVersion,
    runtimeId: "runtime_web",
    featureSet: {
      features: ["device_pairing_url", "runtime_web_app", "setup_attestation", "web_push"],
      version: 1,
    },
    diagnostics: {
      settaRelease: {
        status: "unavailable",
        runtimeVersion: "test",
        metadataPresent: false,
        metadataValid: false,
        installedVersion: "",
        reasonCode: "test",
      },
      codex: {
        status: "unavailable",
        binary: {
          status: "unavailable",
          command: "codex",
          present: false,
          reasonCode: "test",
        },
        authentication: {
          status: "unavailable",
          accountStatus: "",
          accountType: "",
          requiresOpenaiAuth: false,
          loginStatus: "",
          reasonCode: "test",
        },
      },
      workloadLease: {
        status: "unavailable",
        configured: false,
        leaseName: "setta-agent",
        active: false,
        startedAt: "",
        expiresAt: "",
        reasonCode: "test",
      },
      policy: {
        status: "unavailable",
        configured: false,
        present: false,
        schemaVersion: 0,
        ruleCount: 0,
        reasonCode: "test",
      },
      diskSpace: {
        status: "unavailable",
        availableMib: 0,
        totalMib: 0,
        minimumFreeMib: 0,
        reasonCode: "test",
      },
      protectedState: {
        status: "unavailable",
        present: false,
        directory: false,
        ownerOnlyWritable: false,
        reasonCode: "test",
      },
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function codexAccountSSE(): string {
  const event = {
    reason: "snapshot_required",
    sequence: 0,
    streamId: "codex-account-stream-web",
  };
  return `id: ${event.streamId}:${event.sequence}\nevent: codex.account.changed\ndata: ${JSON.stringify(event)}\n\n`;
}

function conversationResyncEvent(sequence: number): ConversationEvent {
  return {
    conversationId: "conversation_web",
    emittedAt: "2026-07-19T19:00:00Z",
    eventId: `conversation-stream-web:${sequence}`,
    payload: {
      currentSequence: sequence,
      currentStreamId: "conversation-stream-web",
      reason: "snapshot required after inactive client",
      requestedSequence: 0,
      requestedStreamId: "conversation-stream-web",
      type: "conversation.resync_required",
    },
    schemaVersion: 1,
    sequence,
    streamId: "conversation-stream-web",
    workspaceId: "workspace_web",
  };
}

function conversationSSE(
  event: ConversationEvent,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  return streamUntilAbort(
    `id: ${event.eventId}\nevent: ${event.payload.type}\ndata: ${JSON.stringify(event)}\n\n`,
    signal,
  );
}

function streamUntilAbort(text: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text !== "") {
        controller.enqueue(new TextEncoder().encode(text));
      }
      signal.addEventListener("abort", () => controller.close(), { once: true });
    },
  });
}

function controlledStreamActivity(initialActive = true): {
  activity: WebEventStreamActivity;
  setActive: (active: boolean) => void;
} {
  let active = initialActive;
  const listeners = new Set<(active: boolean) => void>();
  return {
    activity: {
      isActive: () => active,
      onChanged: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    setActive: (next) => {
      if (next === active) {
        return;
      }
      active = next;
      for (const listener of listeners) {
        listener(active);
      }
    },
  };
}

function webSpeechResponse(path: string): Response | null {
  switch (path) {
    case "/speech/capabilities":
      return jsonResponse({
        aiVoiceDisclosure: "This voice is AI-generated.",
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
      });
    case "/speech/transcription/sessions":
      return jsonResponse({
        clientSecret: "ek_web_ephemeral",
        expiresAt: "2026-07-10T18:10:00Z",
        maximumRecordingSeconds: 120,
        maximumTranscriptCharacters: 8000,
        transcriptionDelay: "medium",
        transcriptionModel: "gpt-realtime-whisper",
        webRTCURL: "https://api.openai.com/v1/realtime/calls",
      });
    default:
      return null;
  }
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for condition");
}
