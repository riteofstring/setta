export function getProjectChatDeleteRecoveryTooltipContent(
  target: "thread" | "group",
): string {
  if (target === "group") {
    return "Delete this group and move its chats to Ungrouped. Use Undo Delete in the toolbar to undo.";
  }
  return "Remove this chat from history. Use Undo Delete in the toolbar to undo.";
}
