import type { ConversationEvent, ConversationEventCursor } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { ipcEvents } from "@shared/ipc";

import {
  startConversationEventStream,
  type ConversationEventStream,
} from "./conversation-event-stream";

export interface ConversationEventTarget {
  conversationId: string;
  workspaceId: string | null;
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
  recordDisconnect?: (error: unknown) => void;
  recordEvent?: (event: ConversationEvent) => void;
  startEventStream?: typeof startConversationEventStream;
}

interface RegisteredConversationStream {
  keepAlive: boolean;
  sender: ConversationEventSender;
  stream: ConversationEventStream;
  target: ConversationEventTarget;
  terminalNarrationSeen: boolean;
  terminalStatusSequence: number | null;
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
      reportDisconnect: this.options.recordDisconnect,
      sendEvent: (event) => this.forwardEvent(key, event),
      workspaceId: target.workspaceId,
    });
    this.streams.set(key, {
      keepAlive: false,
      sender,
      stream,
      target,
      terminalNarrationSeen: false,
      terminalStatusSequence: null,
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
    if (keepAlive && terminalBoundaryComplete(current)) {
      return this.stop(key);
    }
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
        if (conversationHasActiveWork(event.payload.conversation.status)) {
          current.terminalNarrationSeen = false;
          current.terminalStatusSequence = null;
          return false;
        }
        current.terminalStatusSequence = event.payload.conversation.lastTrajectorySequence;
        return current.keepAlive && terminalBoundaryComplete(current);
      case "conversation.narration.created":
        if (!terminalFinalSummary(event.payload.event, current.terminalStatusSequence)) {
          return false;
        }
        current.terminalNarrationSeen = true;
        return current.keepAlive && terminalBoundaryComplete(current);
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

function conversationHasActiveWork(
  status: Extract<
    ConversationEvent["payload"],
    { type: "conversation.updated" }
  >["conversation"]["status"],
): boolean {
  switch (status) {
    case "working":
    case "waiting_for_approval":
      return true;
    case "failed":
    case "idle":
      return false;
    default:
      return assertNever(status);
  }
}

function terminalFinalSummary(
  event: Extract<ConversationEvent["payload"], { type: "conversation.narration.created" }>["event"],
  terminalStatusSequence: number | null,
): boolean {
  return (
    terminalStatusSequence !== null &&
    event.kind === "final_summary" &&
    event.trigger === "turn_terminal" &&
    event.sourceSequenceEnd === terminalStatusSequence
  );
}

function terminalBoundaryComplete(current: RegisteredConversationStream): boolean {
  return current.terminalStatusSequence !== null && current.terminalNarrationSeen;
}

function assertNever(value: never): never {
  throw new Error(`unsupported conversation turn status ${JSON.stringify(value)}`);
}

function streamKey(senderId: number, target: ConversationEventTarget): string {
  return `${senderId}\u0000${target.workspaceId}\u0000${target.conversationId}`;
}
