export class ChatBackendLifecycleAbort extends Error {
  constructor() {
    super("chat backend request cancelled because backend lifecycle changed");
    this.name = "ChatBackendLifecycleAbort";
  }
}

export function isChatBackendLifecycleAbort(error: unknown): error is ChatBackendLifecycleAbort {
  return error instanceof ChatBackendLifecycleAbort;
}
