export type ChatBackgroundActionName =
  | "backend-lifecycle-resync"
  | "event-stream-resync"
  | "workspace-chat-sync";

interface ChatBackgroundActionFailure {
  error: unknown;
  name: ChatBackgroundActionName;
}

type ChatBackgroundActionFailureReporter = (failure: ChatBackgroundActionFailure) => void;

export function runChatBackgroundAction(
  name: ChatBackgroundActionName,
  action: () => Promise<void>,
  reportFailure: ChatBackgroundActionFailureReporter = reportChatBackgroundActionFailure,
): void {
  void action().catch((error: unknown) => {
    reportFailure({ error, name });
  });
}

function reportChatBackgroundActionFailure({ error, name }: ChatBackgroundActionFailure): void {
  console.error(`background chat action failed: ${name}`, error);
}
