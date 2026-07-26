import type { HostedAccessProgress } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import type { HostedAccessProgressSubscriptionRequest } from "@shared/hosted-access-ipc";

import { streamHostedAccessProgress } from "./hosted-access-client";

interface HostedAccessProgressSender {
  id: number;
  isDestroyed: () => boolean;
  once: (event: "destroyed", listener: () => void) => void;
  send: (channel: string, progress: HostedAccessProgress) => void;
}

interface HostedAccessProgressRegistryOptions {
  reportDisconnect?: (error: unknown) => void;
  socketPath: () => string;
  streamProgress?: typeof streamHostedAccessProgress;
}

interface RegisteredHostedAccessProgressStream {
  abort: AbortController;
  sender: HostedAccessProgressSender;
}

export class HostedAccessProgressRegistry {
  private readonly streams = new Map<string, RegisteredHostedAccessProgressStream>();
  private readonly observedSenders = new Set<number>();

  constructor(private readonly options: HostedAccessProgressRegistryOptions) {}

  subscribe(
    sender: HostedAccessProgressSender,
    request: HostedAccessProgressSubscriptionRequest,
  ): void {
    const key = streamKey(sender.id, request.intentId);
    if (this.streams.has(key)) {
      return;
    }
    const registered = { abort: new AbortController(), sender };
    this.streams.set(key, registered);
    this.observeSender(sender);
    void this.consume(key, request, registered);
  }

  release(sender: HostedAccessProgressSender, intentId: string): void {
    this.stop(streamKey(sender.id, intentId));
  }

  stopAll(): void {
    for (const key of [...this.streams.keys()]) {
      this.stop(key);
    }
  }

  private async consume(
    key: string,
    request: HostedAccessProgressSubscriptionRequest,
    registered: RegisteredHostedAccessProgressStream,
  ): Promise<void> {
    try {
      const stream = (this.options.streamProgress ?? streamHostedAccessProgress)(
        this.options.socketPath(),
        request.intentId,
        request.lastEventId,
        registered.abort.signal,
      );
      for await (const progress of stream) {
        if (registered.sender.isDestroyed() || this.streams.get(key) !== registered) {
          this.stop(key);
          return;
        }
        registered.sender.send(ipcEvents.hostedAccessProgress, progress);
      }
    } catch (error) {
      if (!registered.abort.signal.aborted) {
        this.options.reportDisconnect?.(error);
      }
    } finally {
      if (this.streams.get(key) === registered) {
        this.streams.delete(key);
      }
    }
  }

  private observeSender(sender: HostedAccessProgressSender): void {
    if (this.observedSenders.has(sender.id)) {
      return;
    }
    this.observedSenders.add(sender.id);
    sender.once("destroyed", () => {
      this.observedSenders.delete(sender.id);
      for (const [key, registered] of this.streams) {
        if (registered.sender.id === sender.id) {
          this.stop(key);
        }
      }
    });
  }

  private stop(key: string): void {
    const registered = this.streams.get(key);
    if (!registered) {
      return;
    }
    this.streams.delete(key);
    registered.abort.abort();
  }
}

function streamKey(senderId: number, intentId: string): string {
  return `${senderId}:${intentId}`;
}
