import { useChatStore } from "./chat-store";

export type StoreBackedChatInteractiveActionName = "send-pending-steering";

interface StoreBackedChatInteractiveActionFailure {
  error: unknown;
  name: StoreBackedChatInteractiveActionName;
}

type StoreBackedChatInteractiveActionFailureReporter = (
  failure: StoreBackedChatInteractiveActionFailure,
) => void;

export function startStoreBackedChatInteractiveAction(
  name: StoreBackedChatInteractiveActionName,
  action: () => Promise<void>,
  reportFailure: StoreBackedChatInteractiveActionFailureReporter = reportStoreBackedChatInteractiveActionFailure,
): void {
  void action().catch((error: unknown) => {
    if (useChatStore.getState().error !== null) {
      return;
    }
    reportFailure({ error, name });
  });
}

function reportStoreBackedChatInteractiveActionFailure({
  error,
  name,
}: StoreBackedChatInteractiveActionFailure): void {
  console.error(`store-backed chat action rejected without a visible error: ${name}`, error);
}
