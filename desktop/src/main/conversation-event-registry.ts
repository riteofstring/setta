import type { ConversationEvent, ConversationEventCursor, TurnStatus } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { ipcEvents } from "@shared/ipc";

import {
  startConversationEventStream,
  type ConversationEventStream,
} from "./conversation-event-stream";

export interface ConversationEventTarget {
  conversationId: string;
  workspaceId: string;
}

interface ConversationEventSender {
  id: number;
  isDestroyed: () => boolean;
  on: (event: "did-start-navigation", listener: NavigationListener) => void;
  once: (event: "destroyed", listener: () => void) => void;
  removeListener: (event: "did-start-navigation", listener: NavigationListener) => void;
  send: (channel: string, event: ConversationEvent) => void;
}

type NavigationListener = (
  event: unknown,
  url: string,
  isInPlace: boolean,
  isMainFrame: boolean,
) => void;

interface ConversationEventRegistryOptions {
  backendConnection: () => { baseURL: string; fetchImpl: BackendFetch };
  recordEvent?: (event: ConversationEvent) => void;
  startEventStream?: typeof startConversationEventStream;
}

interface RegisteredConversationStream {
  keepAlive: boolean;
  pendingTerminalNarrationSequence: number | null;
  pendingTerminalNarrationTurnId: string | null;
  sender: ConversationEventSender;
  stream: ConversationEventStream;
  target: ConversationEventTarget;
  terminalNarrationPending: boolean;
}

export class ConversationEventRegistry {
  private readonly streams = new Map<string, RegisteredConversationStream>();
  private readonly navigationListeners = new Map<number, NavigationListener>();

  constructor(private readonly options: ConversationEventRegistryOptions) {}

  subscribe(
    sender: ConversationEventSender,
    target: ConversationEventTarget,
    cursor: ConversationEventCursor,
  ): void {
    const key = streamKey(sender.id, target);
    const current = this.streams.get(key);
    if (current) {
      current.keepAlive = false;
      return;
    }
    const { baseURL, fetchImpl } = this.options.backendConnection();
    const stream = (this.options.startEventStream ?? startConversationEventStream)({
      baseURL,
      conversationId: target.conversationId,
      cursor,
      fetchImpl,
      sendEvent: (event) => this.forwardEvent(key, event),
      workspaceId: target.workspaceId,
    });
    this.streams.set(key, {
      keepAlive: false,
      pendingTerminalNarrationSequence: null,
      pendingTerminalNarrationTurnId: null,
      sender,
      stream,
      target,
      terminalNarrationPending: false,
    });
    this.observeSender(sender);
  }

  release(
    sender: ConversationEventSender,
    target: ConversationEventTarget,
    keepAlive: boolean,
  ): Promise<void> {
    const key = streamKey(sender.id, target);
    const current = this.streams.get(key);
    if (!current) {
      return Promise.resolve();
    }
    current.keepAlive = keepAlive;
    return keepAlive ? Promise.resolve() : this.stop(key);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.streams.keys()].map((key) => this.stop(key)));
  }

  private forwardEvent(key: string, event: ConversationEvent): void {
    const current = this.streams.get(key);
    if (!current || current.sender.isDestroyed()) {
      void this.stop(key);
      return;
    }
    this.options.recordEvent?.(event);
    current.sender.send(ipcEvents.conversationEvent, event);
    if (this.keepAliveStreamCanStop(current, event)) {
      void this.stop(key);
    }
  }

  private keepAliveStreamCanStop(
    current: RegisteredConversationStream,
    event: ConversationEvent,
  ): boolean {
    switch (event.payload.type) {
      case "conversation.updated":
        updateTerminalNarrationBoundary(current, event.payload.conversation);
        return false;
      case "conversation.turn.updated":
        updatePendingTerminalTurn(current, event.payload.turn.id, event.payload.turn.status);
        return false;
      case "conversation.narration.created":
        return current.keepAlive && terminalNarrationMatches(current, event.payload.event);
      case "conversation.narrator_state.updated":
        return current.keepAlive && terminalNarrationCannotRecover(current, event.payload.state);
      default:
        return false;
    }
  }

  private observeSender(sender: ConversationEventSender): void {
    if (this.navigationListeners.has(sender.id)) {
      return;
    }
    const navigationListener: NavigationListener = (_event, _url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      sender.removeListener("did-start-navigation", navigationListener);
      this.navigationListeners.delete(sender.id);
      void this.stopSender(sender.id);
    };
    this.navigationListeners.set(sender.id, navigationListener);
    sender.on("did-start-navigation", navigationListener);
    sender.once("destroyed", () => {
      this.navigationListeners.delete(sender.id);
      void this.stopSender(sender.id);
    });
  }

  private async stopSender(senderId: number): Promise<void> {
    const keys = [...this.streams]
      .filter(([, registered]) => registered.sender.id === senderId)
      .map(([key]) => key);
    await Promise.all(keys.map((key) => this.stop(key)));
  }

  private async stop(key: string): Promise<void> {
    const current = this.streams.get(key);
    if (!current) {
      return;
    }
    this.streams.delete(key);
    await current.stream.stop();
  }
}

function updateTerminalNarrationBoundary(
  current: RegisteredConversationStream,
  conversation: Extract<
    ConversationEvent["payload"],
    { type: "conversation.updated" }
  >["conversation"],
): void {
  if (conversation.status === "working" || conversation.status === "waiting_for_approval") {
    current.terminalNarrationPending = false;
    current.pendingTerminalNarrationSequence = null;
    current.pendingTerminalNarrationTurnId = null;
    return;
  }
  current.terminalNarrationPending = true;
  if (current.pendingTerminalNarrationSequence !== conversation.lastTrajectorySequence) {
    current.pendingTerminalNarrationSequence = conversation.lastTrajectorySequence;
    current.pendingTerminalNarrationTurnId = null;
  }
}

function updatePendingTerminalTurn(
  current: RegisteredConversationStream,
  turnId: string,
  status: TurnStatus,
): void {
  if (current.terminalNarrationPending && terminalTurnStatus(status)) {
    current.pendingTerminalNarrationTurnId = turnId;
  }
}

function terminalNarrationMatches(
  current: RegisteredConversationStream,
  event: Extract<ConversationEvent["payload"], { type: "conversation.narration.created" }>["event"],
): boolean {
  return (
    current.terminalNarrationPending &&
    current.pendingTerminalNarrationTurnId !== null &&
    event.kind === "final_summary" &&
    event.turnId === current.pendingTerminalNarrationTurnId
  );
}

function terminalNarrationCannotRecover(
  current: RegisteredConversationStream,
  state: Extract<
    ConversationEvent["payload"],
    { type: "conversation.narrator_state.updated" }
  >["state"],
): boolean {
  return (
    current.terminalNarrationPending &&
    state.status === "degraded" &&
    state.degradation?.retryable === false
  );
}

function terminalTurnStatus(status: TurnStatus): boolean {
  switch (status) {
    case "completed":
    case "cancelled":
    case "failed":
      return true;
    case "queued":
    case "running":
      return false;
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported conversation turn status ${JSON.stringify(value)}`);
}

function streamKey(senderId: number, target: ConversationEventTarget): string {
  return `${senderId}\u0000${target.workspaceId}\u0000${target.conversationId}`;
}
