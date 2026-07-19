import type { ConversationPendingApproval } from "@generated/backend";

export type PendingConversationApproval = ConversationPendingApproval;

export function pendingConversationApproval(
  approvals: readonly ConversationPendingApproval[],
  turnId: string,
): PendingConversationApproval | null {
  for (let index = approvals.length - 1; index >= 0; index -= 1) {
    const approval = approvals[index];
    if (approval?.turnId === turnId) {
      return approval;
    }
  }
  return null;
}
