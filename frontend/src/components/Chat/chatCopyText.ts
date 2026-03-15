import { addTemporaryNotification } from "state/actions/notifications";

export function copyTextWithNotifications({
  text,
  emptyMessage,
  successMessage,
  failureMessage,
}: {
  text: string;
  emptyMessage: string;
  successMessage: string;
  failureMessage: string;
}) {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) {
    addTemporaryNotification(emptyMessage, "warning");
    return;
  }
  void navigator.clipboard
    .writeText(normalizedText)
    .then(() => {
      addTemporaryNotification(successMessage);
    })
    .catch((error) => {
      console.error("Failed to copy text:", error);
      addTemporaryNotification(failureMessage, "error");
    });
}
