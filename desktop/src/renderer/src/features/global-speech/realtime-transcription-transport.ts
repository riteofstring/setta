import type { SpeechTranscriptionSession } from "@generated/backend";
import {
  openAIOperations,
  openAIRealtimeClientEventType,
  openAIRealtimeServerEventType,
} from "@generated/openai-realtime";

import { RealtimeTranscriptionError } from "./realtime-transcription-error";
import {
  decodeRealtimeTranscriptionServerEvent,
  type RealtimeTranscriptionServerEvent,
} from "./realtime-transcription-events";
import {
  RealtimeTranscriptionSession,
  type RealtimeTranscriptionUpdate,
} from "./realtime-transcription-session";

const maximumSDPResponseBytes = 64 * 1024;
const maximumRealtimeEventOverheadCharacters = 64 * 1024;

interface RealtimeTranscriptionReady {
  captureSessionId: string;
  providerSessionId: string;
}

export interface RealtimeTranscriptionTransport {
  readonly ready: Promise<RealtimeTranscriptionReady>;
  close: () => void;
  commit: () => void;
}

interface RealtimeDataChannelHandlers {
  close: () => void;
  error: () => void;
  message: (data: unknown) => void;
  open: () => void;
}

export interface RealtimeDataChannelPort {
  readonly readyState: RTCDataChannelState;
  clearHandlers: () => void;
  close: () => void;
  send: (data: string) => void;
  setHandlers: (handlers: RealtimeDataChannelHandlers) => void;
}

export interface RealtimePeerConnectionPort {
  readonly connectionState: RTCPeerConnectionState;
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => void;
  clearConnectionStateHandler: () => void;
  close: () => void;
  createDataChannel: (label: string) => RealtimeDataChannelPort;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  setConnectionStateHandler: (handler: () => void) => void;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
}

export interface RealtimeTranscriptionDependencies {
  createPeerConnection: () => RealtimePeerConnectionPort;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
}

export interface CreateRealtimeTranscriptionTransportOptions {
  captureSessionId: string;
  dependencies?: RealtimeTranscriptionDependencies;
  onError: (error: RealtimeTranscriptionError) => void;
  onTranscript: (update: RealtimeTranscriptionUpdate) => void;
  session: SpeechTranscriptionSession;
  signal?: AbortSignal;
  stream: MediaStream;
}

type TransportState = "connecting" | "ready" | "committing" | "completed" | "failed" | "closed";

export function createRealtimeTranscriptionTransport(
  options: CreateRealtimeTranscriptionTransportOptions,
): RealtimeTranscriptionTransport {
  const dependencies = options.dependencies ?? browserRealtimeTranscriptionDependencies;
  let peer: RealtimePeerConnectionPort | null = null;
  try {
    validateTransportInput(options, dependencies.now());
    peer = dependencies.createPeerConnection();
    return new BrowserRealtimeTranscriptionTransport(options, dependencies, peer);
  } catch (error) {
    peer?.close();
    throw connectionError(error, false);
  }
}

class BrowserRealtimeTranscriptionTransport implements RealtimeTranscriptionTransport {
  readonly ready: Promise<RealtimeTranscriptionReady>;

  private readonly abortController = new AbortController();
  private readonly captureSessionId: string;
  private readonly channel: RealtimeDataChannelPort;
  private readonly maximumTranscriptCharacters: number;
  private readonly onError: (error: RealtimeTranscriptionError) => void;
  private readonly onTranscript: (update: RealtimeTranscriptionUpdate) => void;
  private readonly peer: RealtimePeerConnectionPort;
  private readonly rejectReady: (error: RealtimeTranscriptionError) => void;
  private readonly resolveReady: (ready: RealtimeTranscriptionReady) => void;
  private readonly signal: AbortSignal | undefined;
  private readonly stream: MediaStream;
  private readonly transcriptionSession: RealtimeTranscriptionSession;

  private channelOpen = false;
  private readySettled = false;
  private remoteDescriptionSet = false;
  private state: TransportState = "connecting";

  constructor(
    options: CreateRealtimeTranscriptionTransportOptions,
    dependencies: RealtimeTranscriptionDependencies,
    peer: RealtimePeerConnectionPort,
  ) {
    this.captureSessionId = options.captureSessionId;
    this.maximumTranscriptCharacters = options.session.maximumTranscriptCharacters;
    this.onError = options.onError;
    this.onTranscript = options.onTranscript;
    this.signal = options.signal;
    this.stream = options.stream;
    this.peer = peer;
    this.transcriptionSession = new RealtimeTranscriptionSession(
      options.captureSessionId,
      options.session.maximumTranscriptCharacters,
    );
    this.channel = this.peer.createDataChannel("oai-events");
    let rejectReady!: (error: RealtimeTranscriptionError) => void;
    let resolveReady!: (ready: RealtimeTranscriptionReady) => void;
    this.ready = new Promise<RealtimeTranscriptionReady>((resolve, reject) => {
      rejectReady = reject;
      resolveReady = resolve;
    });
    this.rejectReady = rejectReady;
    this.resolveReady = resolveReady;
    this.attachHandlers(options.signal);
    this.peer.addTrack(options.stream.getAudioTracks()[0]!, options.stream);
    void this.connect(options.session, dependencies.fetch);
  }

  commit = (): void => {
    if (this.state !== "ready" || this.channel.readyState !== "open") {
      throw new RealtimeTranscriptionError(
        "connection_failed",
        "Realtime transcription is not ready to commit audio.",
      );
    }
    this.transcriptionSession.beginCommit();
    this.state = "committing";
    for (const track of this.stream.getAudioTracks()) {
      track.enabled = false;
    }
    try {
      this.channel.send(
        JSON.stringify({ type: openAIRealtimeClientEventType.inputAudioBufferCommit }),
      );
    } catch (cause) {
      this.fail(
        new RealtimeTranscriptionError(
          "connection_lost",
          "The Realtime transcription commit could not be sent.",
          { cause },
        ),
      );
    }
  };

  close = (): void => {
    if (isTerminalState(this.state)) {
      return;
    }
    this.state = "closed";
    const error = new RealtimeTranscriptionError("aborted", "Realtime transcription was canceled.");
    this.rejectPendingReady(error);
    this.closeResources();
  };

  private attachHandlers(signal: AbortSignal | undefined): void {
    this.channel.setHandlers({
      close: this.handleChannelClose,
      error: this.handleChannelError,
      message: this.handleMessage,
      open: this.handleChannelOpen,
    });
    this.peer.setConnectionStateHandler(this.handleConnectionStateChange);
    if (signal) {
      signal.addEventListener("abort", this.close, { once: true });
    }
  }

  private async connect(
    session: SpeechTranscriptionSession,
    fetchProvider: RealtimeTranscriptionDependencies["fetch"],
  ): Promise<void> {
    try {
      const offer = await this.peer.createOffer();
      this.assertConnecting();
      if (typeof offer.sdp !== "string" || offer.sdp.trim() === "") {
        throw new RealtimeTranscriptionError(
          "connection_failed",
          "Browser WebRTC did not create a valid audio offer.",
        );
      }
      await this.peer.setLocalDescription(offer);
      this.assertConnecting();
      const response = await fetchProvider(session.webRTCURL, {
        body: offer.sdp,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: openAIOperations.createRealtimeCall.responseMediaType,
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": openAIOperations.createRealtimeCall.requestMediaType,
        },
        method: "POST",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: this.abortController.signal,
      });
      const answerSDP = await readProviderAnswer(response);
      await this.peer.setRemoteDescription({ sdp: answerSDP, type: "answer" });
      this.remoteDescriptionSet = true;
      this.resolveReadyWhenComplete();
    } catch (error) {
      if (!isTerminalState(this.state)) {
        this.fail(connectionError(error, this.abortController.signal.aborted));
      }
    }
  }

  private handleChannelOpen = (): void => {
    if (isTerminalState(this.state)) {
      return;
    }
    this.channelOpen = true;
    this.resolveReadyWhenComplete();
  };

  private handleChannelClose = (): void => {
    if (!isTerminalState(this.state)) {
      this.fail(
        new RealtimeTranscriptionError(
          "connection_lost",
          "The Realtime transcription connection closed unexpectedly.",
        ),
      );
    }
  };

  private handleChannelError = (): void => {
    if (!isTerminalState(this.state)) {
      this.fail(
        new RealtimeTranscriptionError(
          "connection_lost",
          "The Realtime transcription data channel failed.",
        ),
      );
    }
  };

  private handleConnectionStateChange = (): void => {
    if (isTerminalState(this.state) || !failedConnectionState(this.peer.connectionState)) {
      return;
    }
    this.fail(
      new RealtimeTranscriptionError(
        "connection_lost",
        "The Realtime transcription peer connection was lost.",
      ),
    );
  };

  private handleMessage = (message: unknown): void => {
    if (isTerminalState(this.state)) {
      return;
    }
    try {
      this.assertEventSize(message);
      const event = decodeRealtimeTranscriptionServerEvent(message);
      this.applyEvent(event);
    } catch (error) {
      this.fail(eventError(error));
    }
  };

  private applyEvent(event: RealtimeTranscriptionServerEvent): void {
    const update = this.transcriptionSession.accept(event);
    if (event.type === openAIRealtimeServerEventType.sessionCreated) {
      this.resolveReadyWhenComplete();
    }
    if (update === null) {
      return;
    }
    if (update.type === "completed") {
      this.state = "completed";
      this.closeResources();
    }
    this.onTranscript(update);
  }

  private assertConnecting(): void {
    if (this.state !== "connecting") {
      throw new RealtimeTranscriptionError("aborted", "Realtime transcription was canceled.");
    }
  }

  private assertEventSize(message: unknown): void {
    if (
      typeof message === "string" &&
      message.length > this.maximumTranscriptCharacters + maximumRealtimeEventOverheadCharacters
    ) {
      throw new RealtimeTranscriptionError(
        "malformed_event",
        "OpenAI sent an oversized Realtime transcription event.",
      );
    }
  }

  private resolveReadyWhenComplete(): void {
    const providerSessionId = this.transcriptionSession.providerSessionId;
    if (
      this.state !== "connecting" ||
      !this.channelOpen ||
      !this.remoteDescriptionSet ||
      providerSessionId === null
    ) {
      return;
    }
    this.state = "ready";
    this.readySettled = true;
    this.resolveReady({
      captureSessionId: this.captureSessionId,
      providerSessionId,
    });
  }

  private fail(error: RealtimeTranscriptionError): void {
    if (isTerminalState(this.state)) {
      return;
    }
    this.state = "failed";
    this.rejectPendingReady(error);
    this.closeResources();
    this.onError(error);
  }

  private rejectPendingReady(error: RealtimeTranscriptionError): void {
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(error);
    }
  }

  private closeResources(): void {
    this.abortController.abort();
    this.signal?.removeEventListener("abort", this.close);
    this.channel.clearHandlers();
    this.peer.clearConnectionStateHandler();
    this.channel.close();
    this.peer.close();
  }
}

async function readProviderAnswer(response: Response): Promise<string> {
  const declaredLength = validateProviderAnswerHeaders(response);
  const { answer, receivedBytes } = await readProviderAnswerText(response);
  if (answer.trim() === "" || (declaredLength !== null && declaredLength !== receivedBytes)) {
    throw malformedSDPError();
  }
  return answer;
}

function validateProviderAnswerHeaders(response: Response): number | null {
  if (response.status !== 201) {
    throw providerStatusError(response.status);
  }
  validateProviderAnswerMediaType(response.headers.get("Content-Type"));
  const declaredLengthHeader = response.headers.get("Content-Length");
  if (declaredLengthHeader === null) {
    return null;
  }
  const declaredLength = Number(declaredLengthHeader);
  if (
    !Number.isInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maximumSDPResponseBytes
  ) {
    throw malformedSDPError();
  }
  return declaredLength;
}

function validateProviderAnswerMediaType(contentType: string | null): void {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (!providerAnswerMediaTypeAllowed(mediaType)) {
    throw new RealtimeTranscriptionError(
      "provider_response_malformed",
      `OpenAI returned Realtime session response type ${JSON.stringify(mediaType ?? "")}.`,
    );
  }
}

function providerAnswerMediaTypeAllowed(mediaType: string | undefined): boolean {
  return openAIOperations.createRealtimeCall.wireResponseMediaTypes.some(
    (candidate) => candidate === mediaType,
  );
}

async function readProviderAnswerText(
  response: Response,
): Promise<{ answer: string; receivedBytes: number }> {
  if (response.body === null) {
    throw malformedSDPError();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let answer = "";
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await readProviderAnswerChunk(reader);
    if (done) {
      return {
        answer: answer + decodeProviderAnswerBytes(decoder),
        receivedBytes,
      };
    }
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumSDPResponseBytes) {
      await reader.cancel();
      throw malformedSDPError();
    }
    answer += decodeProviderAnswerBytes(decoder, value);
  }
}

async function readProviderAnswerChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  try {
    return await reader.read();
  } catch (error) {
    throw new RealtimeTranscriptionError(
      "provider_unavailable",
      "OpenAI Realtime session response could not be read.",
      { cause: error },
    );
  }
}

function decodeProviderAnswerBytes(decoder: TextDecoder, value?: Uint8Array): string {
  try {
    return value ? decoder.decode(value, { stream: true }) : decoder.decode();
  } catch (error) {
    throw new RealtimeTranscriptionError(
      "provider_response_malformed",
      "OpenAI returned a malformed Realtime session response.",
      { cause: error },
    );
  }
}

function providerStatusError(status: number): RealtimeTranscriptionError {
  if (status === 401 || status === 403) {
    return new RealtimeTranscriptionError(
      "provider_rejected",
      "OpenAI rejected the Realtime transcription credential or model access.",
    );
  }
  if (status === 429) {
    return new RealtimeTranscriptionError(
      "provider_rate_limited",
      "OpenAI speech rate limit or quota was reached.",
    );
  }
  if (status === 408 || status >= 500) {
    return new RealtimeTranscriptionError(
      "provider_unavailable",
      "OpenAI Realtime transcription is unavailable.",
    );
  }
  return new RealtimeTranscriptionError(
    "provider_response_malformed",
    `OpenAI Realtime transcription returned unexpected status ${status}.`,
  );
}

function validateTransportInput(
  options: CreateRealtimeTranscriptionTransportOptions,
  now: number,
): void {
  if (options.signal?.aborted) {
    throw new RealtimeTranscriptionError("aborted", "Realtime transcription was canceled.");
  }
  if (
    options.captureSessionId.trim() === "" ||
    options.captureSessionId !== options.captureSessionId.trim()
  ) {
    throw invalidSessionError("Capture session ID is invalid.");
  }
  const expiresAt = Date.parse(options.session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw invalidSessionError("Realtime transcription session is expired or invalid.");
  }
  validateSessionCredentialAndURL(options.session);
  if (
    !Number.isInteger(options.session.maximumTranscriptCharacters) ||
    options.session.maximumTranscriptCharacters < 1
  ) {
    throw invalidSessionError("Realtime transcript character limit is invalid.");
  }
  validateMediaStream(options.stream);
}

function validateSessionCredentialAndURL(session: SpeechTranscriptionSession): void {
  if (session.clientSecret.trim() === "" || session.clientSecret !== session.clientSecret.trim()) {
    throw invalidSessionError("Realtime transcription credential is invalid.");
  }
  let url: URL;
  try {
    url = new URL(session.webRTCURL);
  } catch (error) {
    throw invalidSessionError("Realtime WebRTC URL is invalid.", error);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw invalidSessionError("Realtime WebRTC URL is invalid.");
  }
}

function validateMediaStream(stream: MediaStream): void {
  const tracks = stream.getTracks();
  const audioTracks = stream.getAudioTracks();
  if (
    audioTracks.length !== 1 ||
    tracks.length !== 1 ||
    tracks[0]?.kind !== "audio" ||
    audioTracks[0]?.readyState === "ended"
  ) {
    throw new RealtimeTranscriptionError(
      "invalid_media",
      "Realtime transcription requires one live audio-only media track.",
    );
  }
}

function connectionError(error: unknown, aborted: boolean): RealtimeTranscriptionError {
  if (error instanceof RealtimeTranscriptionError) {
    return error;
  }
  if (aborted) {
    return new RealtimeTranscriptionError("aborted", "Realtime transcription was canceled.");
  }
  return new RealtimeTranscriptionError(
    "connection_failed",
    "The browser could not establish the Realtime transcription connection.",
    { cause: error },
  );
}

function eventError(error: unknown): RealtimeTranscriptionError {
  if (error instanceof RealtimeTranscriptionError) {
    return error;
  }
  return new RealtimeTranscriptionError(
    "malformed_event",
    "OpenAI sent a malformed Realtime transcription event.",
    { cause: error },
  );
}

function invalidSessionError(message: string, cause?: unknown): RealtimeTranscriptionError {
  return new RealtimeTranscriptionError("invalid_session", message, { cause });
}

function malformedSDPError(): RealtimeTranscriptionError {
  return new RealtimeTranscriptionError(
    "provider_response_malformed",
    "OpenAI returned a malformed Realtime session response.",
  );
}

function failedConnectionState(state: RTCPeerConnectionState): boolean {
  return state === "closed" || state === "disconnected" || state === "failed";
}

function isTerminalState(state: TransportState): boolean {
  return state === "closed" || state === "completed" || state === "failed";
}

const browserRealtimeTranscriptionDependencies: RealtimeTranscriptionDependencies = {
  createPeerConnection: createBrowserPeerConnection,
  fetch: (url, init) => globalThis.fetch(url, init),
  now: () => Date.now(),
};

function createBrowserPeerConnection(): RealtimePeerConnectionPort {
  const peer = new RTCPeerConnection();
  return {
    addTrack: (track, stream) => {
      peer.addTrack(track, stream);
    },
    clearConnectionStateHandler: () => {
      peer.onconnectionstatechange = null;
    },
    close: () => {
      peer.close();
    },
    get connectionState() {
      return peer.connectionState;
    },
    createDataChannel: (label) => wrapBrowserDataChannel(peer.createDataChannel(label)),
    createOffer: () => peer.createOffer(),
    setConnectionStateHandler: (handler) => {
      peer.onconnectionstatechange = handler;
    },
    setLocalDescription: (description) => peer.setLocalDescription(description),
    setRemoteDescription: (description) => peer.setRemoteDescription(description),
  };
}

function wrapBrowserDataChannel(channel: RTCDataChannel): RealtimeDataChannelPort {
  return {
    clearHandlers: () => {
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      channel.onopen = null;
    },
    close: () => {
      channel.close();
    },
    get readyState() {
      return channel.readyState;
    },
    send: (data) => {
      channel.send(data);
    },
    setHandlers: (handlers) => {
      channel.onclose = handlers.close;
      channel.onerror = handlers.error;
      channel.onmessage = (event) => handlers.message(event.data);
      channel.onopen = handlers.open;
    },
  };
}
