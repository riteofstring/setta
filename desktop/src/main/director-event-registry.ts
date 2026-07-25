import type { DirectorEvent, DirectorEventCursor } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { ipcEvents } from "@shared/ipc";

import { startDirectorEventStream, type DirectorEventStream } from "./director-event-stream";

interface DirectorEventSender {
  id: number;
  isDestroyed: () => boolean;
  on: (event: "did-start-navigation", listener: NavigationListener) => void;
  once: (event: "destroyed", listener: () => void) => void;
  removeListener: (event: "did-start-navigation", listener: NavigationListener) => void;
  send: (channel: string, event: DirectorEvent) => void;
}

type NavigationListener = (
  event: unknown,
  url: string,
  isInPlace: boolean,
  isMainFrame: boolean,
) => void;

interface DirectorEventRegistryOptions {
  backendConnection: () => { baseURL: string; fetchImpl: BackendFetch };
  recordEvent?: (event: DirectorEvent) => void;
  startEventStream?: typeof startDirectorEventStream;
}

interface RegisteredDirectorStream {
  generation: object;
  sender: DirectorEventSender;
  stream: DirectorEventStream;
}

/**
 * One app-scoped Director stream per window.
 *
 * There is no per-workstream subscription to add, release, or reference count:
 * the whole app is one stream, and a window that reloads or navigates away
 * closes it. Subscribing again replaces the current stream, which is what a
 * resync does — the shell takes a fresh snapshot and continues from its cursor.
 */
export class DirectorEventRegistry {
  private readonly streams = new Map<number, RegisteredDirectorStream>();
  private readonly navigationListeners = new Map<number, NavigationListener>();
  private readonly destructionObserved = new Set<number>();

  constructor(private readonly options: DirectorEventRegistryOptions) {}

  subscribe(sender: DirectorEventSender, cursor: DirectorEventCursor): void {
    void this.stop(sender.id);
    const { baseURL, fetchImpl } = this.options.backendConnection();
    const generation = {};
    const stream = (this.options.startEventStream ?? startDirectorEventStream)({
      baseURL,
      cursor,
      fetchImpl,
      sendEvent: (event) => this.forwardEvent(sender.id, generation, event),
    });
    this.streams.set(sender.id, { generation, sender, stream });
    this.observeSender(sender);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.streams.keys()].map((senderId) => this.stop(senderId)));
  }

  private forwardEvent(senderId: number, generation: object, event: DirectorEvent): void {
    const current = this.streams.get(senderId);
    if (!current || current.generation !== generation) {
      return;
    }
    if (current.sender.isDestroyed()) {
      void this.stop(senderId);
      return;
    }
    this.options.recordEvent?.(event);
    current.sender.send(ipcEvents.directorEvent, event);
  }

  private observeSender(sender: DirectorEventSender): void {
    if (this.navigationListeners.has(sender.id)) {
      return;
    }
    const navigationListener: NavigationListener = (_event, _url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      sender.removeListener("did-start-navigation", navigationListener);
      this.navigationListeners.delete(sender.id);
      void this.stop(sender.id);
    };
    this.navigationListeners.set(sender.id, navigationListener);
    sender.on("did-start-navigation", navigationListener);
    if (this.destructionObserved.has(sender.id)) {
      return;
    }
    this.destructionObserved.add(sender.id);
    sender.once("destroyed", () => {
      this.navigationListeners.delete(sender.id);
      this.destructionObserved.delete(sender.id);
      void this.stop(sender.id);
    });
  }

  private async stop(senderId: number): Promise<void> {
    const current = this.streams.get(senderId);
    if (!current) {
      return;
    }
    this.streams.delete(senderId);
    await current.stream.stop();
  }
}
