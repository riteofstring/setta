const events = new Map<string, unknown>();

export const eventBus = {
  send(topic: string, event: unknown): void {
    events.set(topic, event);
  },
};
