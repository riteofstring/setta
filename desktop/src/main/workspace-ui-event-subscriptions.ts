export interface WorkspaceUIEventStreamHandle {
  stop: () => Promise<void>;
}

export interface WorkspaceUIEventSubscriber {
  id: number;
  once: (event: "destroyed", listener: () => void) => void;
}

interface WorkspaceUIEventSubscriptionRegistryOptions {
  startStream: (workspaceId: string) => WorkspaceUIEventStreamHandle | null;
}

interface WorkspaceUIEventSubscriptionEntry {
  senderCounts: Map<number, number>;
  stream: WorkspaceUIEventStreamHandle | null;
  subscribers: number;
}

export function createWorkspaceUIEventSubscriptionRegistry(
  options: WorkspaceUIEventSubscriptionRegistryOptions,
) {
  const entries = new Map<string, WorkspaceUIEventSubscriptionEntry>();
  const trackedSenderIds = new Set<number>();

  function subscribe(workspaceId: unknown, sender: WorkspaceUIEventSubscriber): void {
    const normalizedWorkspaceId = requireWorkspaceUIEventWorkspaceID(workspaceId);
    const entry = workspaceUIEventSubscriptionEntry(entries, normalizedWorkspaceId);
    trackSender(sender);
    entry.subscribers += 1;
    entry.senderCounts.set(sender.id, (entry.senderCounts.get(sender.id) ?? 0) + 1);
    if (entry.stream === null) {
      entry.stream = options.startStream(normalizedWorkspaceId);
    }
  }

  function unsubscribe(workspaceId: unknown, sender: WorkspaceUIEventSubscriber): void {
    const normalizedWorkspaceId = requireWorkspaceUIEventWorkspaceID(workspaceId);
    const entry = entries.get(normalizedWorkspaceId);
    if (!entry) {
      return;
    }
    decrementSenderSubscription(normalizedWorkspaceId, entry, sender.id);
  }

  function startStreams(): void {
    for (const [workspaceId, entry] of entries) {
      if (entry.stream === null) {
        entry.stream = options.startStream(workspaceId);
      }
    }
  }

  async function stopStreams(): Promise<void> {
    const streams: WorkspaceUIEventStreamHandle[] = [];
    for (const entry of entries.values()) {
      if (entry.stream !== null) {
        streams.push(entry.stream);
        entry.stream = null;
      }
    }
    await Promise.all(streams.map((stream) => stream.stop()));
  }

  function trackSender(sender: WorkspaceUIEventSubscriber): void {
    if (trackedSenderIds.has(sender.id)) {
      return;
    }
    trackedSenderIds.add(sender.id);
    sender.once("destroyed", () => {
      trackedSenderIds.delete(sender.id);
      removeSenderSubscriptions(sender.id);
    });
  }

  function removeSenderSubscriptions(senderId: number): void {
    for (const [workspaceId, entry] of Array.from(entries)) {
      const count = entry.senderCounts.get(senderId) ?? 0;
      if (count === 0) {
        continue;
      }
      entry.senderCounts.delete(senderId);
      entry.subscribers -= count;
      removeEntryIfEmpty(workspaceId, entry);
    }
  }

  function decrementSenderSubscription(
    workspaceId: string,
    entry: WorkspaceUIEventSubscriptionEntry,
    senderId: number,
  ): void {
    const count = entry.senderCounts.get(senderId) ?? 0;
    if (count === 0) {
      return;
    }
    if (count === 1) {
      entry.senderCounts.delete(senderId);
    } else {
      entry.senderCounts.set(senderId, count - 1);
    }
    entry.subscribers -= 1;
    removeEntryIfEmpty(workspaceId, entry);
  }

  function removeEntryIfEmpty(workspaceId: string, entry: WorkspaceUIEventSubscriptionEntry): void {
    if (entry.subscribers > 0) {
      return;
    }
    entries.delete(workspaceId);
    const stream = entry.stream;
    entry.stream = null;
    void stream?.stop();
  }

  return {
    startStreams,
    stopStreams,
    subscribe,
    unsubscribe,
  };
}

function workspaceUIEventSubscriptionEntry(
  entries: Map<string, WorkspaceUIEventSubscriptionEntry>,
  workspaceId: string,
): WorkspaceUIEventSubscriptionEntry {
  const existing = entries.get(workspaceId);
  if (existing) {
    return existing;
  }
  const entry: WorkspaceUIEventSubscriptionEntry = {
    senderCounts: new Map(),
    stream: null,
    subscribers: 0,
  };
  entries.set(workspaceId, entry);
  return entry;
}

function requireWorkspaceUIEventWorkspaceID(workspaceId: unknown): string {
  if (typeof workspaceId !== "string" || workspaceId === "") {
    throw new Error("workspace UI event subscription requires workspaceId");
  }
  return workspaceId;
}
