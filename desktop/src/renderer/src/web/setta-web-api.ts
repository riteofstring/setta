import {
  backendEndpoints,
  backendProtocolVersion,
  createBackendClient,
  decodeConversationEvent,
  type BackendClient,
  type RuntimeInfoResponse,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import type { BackendProcessStatus, RuntimeRegistrySnapshot, SettaAPI } from "@shared/types";
import {
  detectWebPlatform,
  errorMessage,
  transparentSVGDataURL,
  webDeviceDisplayName,
  webRuntimeVersions,
} from "./setta-web-api-utils";
import {
  cursorFromStreamedEvent,
  startWebBackendEventStream,
  type WebEventStreamOptions,
} from "./setta-web-event-stream";
import { createSpeechWebAPI } from "./speech-web-api";

const webDeviceStorageKey = "setta.web.device-session.v1";

interface StoredWebDeviceSession {
  deviceId: string;
  deviceToken: string;
  pairedAt: string;
  protocolVersion: number;
  runtimeId: string;
}

interface ParsedWebPairingURL {
  pairingToken: string;
  runtimeId: string;
}

interface WebEventStreamRegistration {
  start: () => void;
  stop: () => void;
  stopActive: () => void;
}

export function installWebSettaAPIIfNeeded(): void {
  const target = window as Window & { setta?: SettaAPI };
  if (target.setta) {
    return;
  }
  target.setta = createWebSettaAPI();
  installWebPWA();
  void completePairingFromLocation(target.setta);
}

export function createWebSettaAPI(options: { fetchImpl?: BackendFetch } = {}): SettaAPI {
  const baseURL = sameOriginBaseURL();
  const rawFetch = options.fetchImpl ?? fetch.bind(window);
  const connectionListeners = new Set<(snapshot: RuntimeRegistrySnapshot) => void>();
  const processStatusListeners = new Set<(status: BackendProcessStatus) => void>();
  const eventStreams = new Set<WebEventStreamRegistration>();
  const conversationEventListeners = new Set<Parameters<SettaAPI["conversations"]["onEvent"]>[0]>();
  const conversationEventStreams = new Map<string, { keepAlive: boolean; stop: () => void }>();

  const api: SettaAPI = {
    app: {
      captureRendererRegion: async (request) => ({
        capturedAt: Date.now(),
        height: request.height,
        imageDataUrl: transparentSVGDataURL(request.width, request.height),
        width: request.width,
      }),
      endWindowDrag: async () => {},
      installedEditors: async () => [],
      moveWindowDrag: async () => {},
      openExternalUrl: async (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      openWorkspaceInEditor: async () => {},
      platform: detectWebPlatform(),
      startWindowDrag: async () => {},
      versions: async () => webRuntimeVersions(),
      workspaceGitInfo: async (rootPath) => ({
        branchName: "",
        commitShort: "",
        worktreeName: "",
        worktreeRoot: rootPath,
      }),
    },
    appearance: {
      presets: () => requireClient().readAppearancePresets(),
      read: () => requireClient().readAppearanceSettings(),
      update: (request) => requireClient().updateAppearanceSettings(request),
    },
    backend: {
      health: () => publicClient().backendHealth(),
      onProcessStatus: (listener) => {
        processStatusListeners.add(listener);
        listener({
          message: "Connected to same-origin Setta runtime",
          mode: "external",
          status: "online",
          url: baseURL,
        });
        return () => {
          processStatusListeners.delete(listener);
        };
      },
    },
    codexAccount: {
      cancelLogin: (request) => requireClient().cancelCodexLogin(request),
      logout: (request) => requireClient().logoutCodexAccount(request),
      read: () => requireClient().readCodexAccount(),
      refresh: (request) => requireClient().refreshCodexAccount(request),
      startLogin: (request) => requireClient().startCodexLogin(request),
    },
    conversations: {
      create: (request) => requireClient().createTopicConversation(request),
      discardInput: (request) => requireClient().discardConversationInput(request),
      disposeSide: (request) => requireClient().disposeSideConversation(request),
      list: (request) => requireClient().listTopicConversations(request),
      onEvent: (listener) => {
        conversationEventListeners.add(listener);
        return () => {
          conversationEventListeners.delete(listener);
        };
      },
      read: (request) => requireClient().readConversationSnapshot(request),
      readInputState: (request) => requireClient().readConversationInputRoutingState(request),
      release: async (request) => {
        const key = conversationStreamKey(request.workspaceId, request.conversationId);
        const stream = conversationEventStreams.get(key);
        if (!stream) {
          return;
        }
        stream.keepAlive = request.keepAlive;
        if (!request.keepAlive) {
          stream.stop();
          conversationEventStreams.delete(key);
        }
      },
      retryInput: (request) => requireClient().retryConversationInput(request),
      sendSide: (request) => requireClient().sendSideConversationTurn(request),
      stop: (request) => requireClient().stopTopicConversationTurn(request),
      submitApproval: (request) => requireClient().submitTopicConversationApproval(request),
      submitInput: (request) => requireClient().submitConversationInput(request),
      subscribe: async (request) => {
        const key = conversationStreamKey(request.workspaceId, request.conversationId);
        const current = conversationEventStreams.get(key);
        if (current) {
          current.keepAlive = false;
          return;
        }
        const endpointURL = new URL(backendEndpoints.ConversationEventStream.path, baseURL);
        endpointURL.searchParams.set("workspaceId", request.workspaceId);
        endpointURL.searchParams.set("conversationId", request.conversationId);
        const stream = { keepAlive: false, stop: () => {} };
        stream.stop = subscribeWebBackendEventStream({
          baseURL,
          cursorForEvent: (event) =>
            event.payload.type === "conversation.resync_required"
              ? {
                  sequence: event.payload.currentSequence,
                  streamId: event.payload.currentStreamId,
                }
              : cursorFromStreamedEvent(event),
          decode: decodeConversationEvent,
          endpoint: {
            ...backendEndpoints.ConversationEventStream,
            path: endpointURL.pathname + endpointURL.search,
          },
          fetchImpl: rawFetch,
          initialCursor: request.cursor,
          isCursorResetEvent: (event) => event.payload.type === "conversation.resync_required",
          sendEvent: (event) => {
            for (const listener of conversationEventListeners) {
              listener(event);
            }
            if (
              stream.keepAlive &&
              event.payload.type === "conversation.updated" &&
              event.payload.conversation.status !== "working" &&
              event.payload.conversation.status !== "waiting_for_approval"
            ) {
              stream.stop();
              conversationEventStreams.delete(key);
            }
          },
          streamName: "conversation event stream",
        });
        conversationEventStreams.set(key, stream);
      },
      updateNarratorVoice: (request) =>
        requireClient().updateTopicConversationNarratorVoice(request),
      waitInputState: (request) => requireClient().waitConversationInputRoutingState(request),
    },
    master: {
      readActiveInteraction: () => requireClient().readActiveMasterShellInteraction(),
      resolvePresentation: (request) => requireClient().resolveMasterPresentationIntent(request),
      submitInput: (request) => requireClient().submitMasterInput(request),
      waitInteraction: (request) => requireClient().waitMasterShellInteraction(request),
      waitPresentation: (request) => requireClient().waitMasterPresentationIntent(request),
    },
    runtimes: {
      addByPairingUrl: async (pairingUrl) => {
        const parsed = parseWebPairingURL(pairingUrl);
        const info = await publicClient().runtimeInfo();
        if (info.runtimeId !== parsed.runtimeId) {
          throw new Error(
            "pairing URL runtime_id " +
              parsed.runtimeId +
              " does not match this runtime " +
              info.runtimeId,
          );
        }
        const paired = await publicClient().completePairing({
          clientDisplayName: webDeviceDisplayName(),
          pairingToken: parsed.pairingToken,
        });
        if (paired.runtimeId !== info.runtimeId) {
          throw new Error(
            "pairing response runtime_id " +
              paired.runtimeId +
              " does not match this runtime " +
              info.runtimeId,
          );
        }
        saveStoredDeviceSession({
          deviceId: paired.deviceId,
          deviceToken: paired.deviceToken,
          pairedAt: new Date().toISOString(),
          protocolVersion: paired.protocolVersion,
          runtimeId: paired.runtimeId,
        });
        const snapshot = await runtimeSnapshot("connected after pairing", info);
        startInactiveEventStreams();
        emitConnectionSnapshot(snapshot);
        return snapshot;
      },
      current: async () => {
        const snapshot = await runtimeSnapshot("loaded current web runtime");
        emitConnectionSnapshot(snapshot);
        return snapshot;
      },
      list: async () => {
        const snapshot = await runtimeSnapshot("listed web runtime");
        return snapshot.runtimes;
      },
      onConnectionState: (listener) => {
        connectionListeners.add(listener);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      remove: async (runtimeId) => {
        const stored = loadStoredDeviceSession();
        if (stored && stored.runtimeId === runtimeId) {
          localStorage.removeItem(webDeviceStorageKey);
          stopActiveEventStreams();
        }
        const snapshot = await runtimeSnapshot("removed web runtime credentials");
        emitConnectionSnapshot(snapshot);
        return snapshot;
      },
      switch: async () => runtimeSnapshot("same-origin web runtime is already active"),
    },
    speech: createSpeechWebAPI(requireClient),
    workspace: {
      close: (id) => requireClient().closeWorkspace({ id }),
      openLocalFolder: async () => {
        const rootPath = window.prompt("Workspace path")?.trim() ?? "";
        if (rootPath === "") {
          return null;
        }
        return requireClient().openWorkspace({ rootPath });
      },
      openPath: (rootPath) => requireClient().openWorkspace({ rootPath }),
      readUILayout: (workspaceId) => requireClient().readWorkspaceUILayout({ workspaceId }),
      removeRecent: (id) => requireClient().removeRecentWorkspace({ id }),
      reorder: (ids) => requireClient().reorderWorkspace({ ids }),
      saveUILayout: (layout) => requireClient().saveWorkspaceUILayout({ layout }),
      select: (id) => requireClient().selectWorkspace({ id }),
      session: () => requireClient().workspaceSession(),
    },
  };

  function publicClient(): BackendClient {
    return createBackendClient(baseURL, rawFetch);
  }

  function requireClient(): BackendClient {
    const stored = loadStoredDeviceSession();
    if (!stored) {
      throw new Error("Pair this browser with the runtime before using Setta.");
    }
    return createBackendClient(
      baseURL,
      authenticatedWebFetch(
        rawFetch,
        () => stored.deviceToken,
        () => {
          localStorage.removeItem(webDeviceStorageKey);
          stopActiveEventStreams();
          void runtimeSnapshot("runtime access was revoked").then(emitConnectionSnapshot);
        },
      ),
    );
  }

  async function runtimeSnapshot(
    message: string,
    knownInfo?: RuntimeInfoResponse,
  ): Promise<RuntimeRegistrySnapshot> {
    const now = new Date().toISOString();
    let info: RuntimeInfoResponse;
    try {
      info = knownInfo ?? (await publicClient().runtimeInfo());
    } catch (error) {
      return {
        activeRuntimeId: null,
        connection: {
          message: errorMessage(error),
          protocolVersion: null,
          runtimeId: null,
          status: "unreachable",
          updatedAt: now,
        },
        runtimes: [],
        switching: false,
      };
    }
    const stored = loadStoredDeviceSession();
    if (!stored || stored.runtimeId !== info.runtimeId) {
      stopActiveEventStreams();
      return runtimeSnapshotForInfo(
        info,
        stored ? "revoked" : "disconnected",
        stored
          ? "Stored web pairing no longer matches this runtime."
          : "Pair this browser with the runtime.",
        now,
      );
    }
    if (info.protocolVersion !== backendProtocolVersion) {
      return runtimeSnapshotForInfo(
        info,
        "incompatible",
        "runtime protocol " + info.protocolVersion + " is not supported by this web client",
        now,
      );
    }
    try {
      await requireClient().listDevices({});
    } catch (error) {
      localStorage.removeItem(webDeviceStorageKey);
      stopActiveEventStreams();
      return runtimeSnapshotForInfo(info, "revoked", errorMessage(error), now);
    }
    return runtimeSnapshotForInfo(info, "connected", message, now);
  }

  function runtimeSnapshotForInfo(
    info: RuntimeInfoResponse,
    status: RuntimeRegistrySnapshot["connection"]["status"],
    message: string,
    updatedAt: string,
  ): RuntimeRegistrySnapshot {
    return {
      activeRuntimeId: info.runtimeId,
      connection: {
        message,
        protocolVersion: info.protocolVersion,
        runtimeId: info.runtimeId,
        status,
        updatedAt,
      },
      runtimes: [
        {
          active: true,
          baseUrl: baseURL,
          connectionMessage: message,
          connectionStatus: status,
          displayName: info.displayName,
          infrastructureProvider: info.infrastructureProvider,
          isLocal: false,
          lastConnected: status === "connected" ? updatedAt : null,
          runtimeId: info.runtimeId,
        },
      ],
      switching: false,
    };
  }

  function emitConnectionSnapshot(snapshot: RuntimeRegistrySnapshot) {
    for (const listener of connectionListeners) {
      listener(snapshot);
    }
  }

  function subscribeWebBackendEventStream<T>(options: WebEventStreamOptions<T>): () => void {
    let unsubscribeActive: (() => void) | null = null;
    const registration: WebEventStreamRegistration = {
      start: () => {
        if (unsubscribeActive) {
          return;
        }
        const stored = loadStoredDeviceSession();
        if (!stored) {
          options.lifecycle?.({
            message: "Pair this browser with the runtime before opening event streams.",
            status: "stopped",
          });
          return;
        }
        unsubscribeActive = startWebBackendEventStream({
          ...options,
          authToken: stored.deviceToken,
        });
      },
      stop: () => {
        registration.stopActive();
        eventStreams.delete(registration);
      },
      stopActive: () => {
        if (!unsubscribeActive) {
          return;
        }
        unsubscribeActive();
        unsubscribeActive = null;
      },
    };
    eventStreams.add(registration);
    registration.start();
    return registration.stop;
  }

  function startInactiveEventStreams() {
    for (const registration of eventStreams) {
      registration.start();
    }
  }

  function stopActiveEventStreams() {
    for (const registration of eventStreams) {
      registration.stopActive();
    }
  }

  return api;
}

export function authenticatedWebFetch(
  fetchImpl: BackendFetch,
  token: () => string,
  onUnauthorized: () => void,
): BackendFetch {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", "Bearer " + token());
    const response = await fetchImpl(input, { ...init, headers });
    if (response.status === 401) {
      onUnauthorized();
    }
    return response;
  };
}

function conversationStreamKey(workspaceId: string, conversationId: string): string {
  return workspaceId + "\u0000" + conversationId;
}

function parseWebPairingURL(rawURL: string): ParsedWebPairingURL {
  let parsed: URL;
  try {
    parsed = new URL(rawURL);
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
  if (parsed.protocol !== "setta:" || parsed.hostname !== "pair") {
    throw new Error("pairing URL must start with setta://pair");
  }
  return {
    pairingToken: requiredPairingParam(parsed, "tok"),
    runtimeId: requiredPairingParam(parsed, "rt"),
  };
}

function requiredPairingParam(parsed: URL, name: string): string {
  const value = parsed.searchParams.get(name);
  if (value === null || value === "") {
    throw new Error("pairing URL is missing " + name);
  }
  return value;
}

function sameOriginBaseURL(): string {
  const url = new URL(window.location.origin);
  url.pathname = "/";
  return url.toString();
}

function saveStoredDeviceSession(session: StoredWebDeviceSession) {
  localStorage.setItem(webDeviceStorageKey, JSON.stringify(session));
}

function loadStoredDeviceSession(): StoredWebDeviceSession | null {
  const raw = localStorage.getItem(webDeviceStorageKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredWebDeviceSession(parsed)) {
      localStorage.removeItem(webDeviceStorageKey);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(webDeviceStorageKey);
    return null;
  }
}

function isStoredWebDeviceSession(value: unknown): value is StoredWebDeviceSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<Record<keyof StoredWebDeviceSession, unknown>>;
  return (
    typeof record.deviceId === "string" &&
    typeof record.deviceToken === "string" &&
    typeof record.pairedAt === "string" &&
    typeof record.protocolVersion === "number" &&
    typeof record.runtimeId === "string"
  );
}

function installWebPWA() {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js");
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as Window & { __settaInstallPrompt?: Event }).__settaInstallPrompt = event;
    window.dispatchEvent(new CustomEvent("setta:pwa-install-available"));
  });
}

async function completePairingFromLocation(api: SettaAPI) {
  const url = new URL(window.location.href);
  const pairingUrl = url.searchParams.get("pair");
  if (!pairingUrl) {
    return;
  }
  await api.runtimes.addByPairingUrl(pairingUrl);
  url.searchParams.delete("pair");
  window.history.replaceState({}, "", url);
}
