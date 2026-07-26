import type { TrajectoryApprovalRequest, TrajectoryEvent } from "@generated/backend";

export interface PendingConversationApproval {
  approval: TrajectoryApprovalRequest;
  turnId: string;
}

export function pendingConversationApproval(
  trajectory: readonly TrajectoryEvent[],
  turnId: string,
): PendingConversationApproval | null {
  const resolved = new Set<string>();
  for (let index = trajectory.length - 1; index >= 0; index -= 1) {
    const pending = pendingApprovalFromEvent(trajectory[index], turnId, resolved);
    if (pending) {
      return pending;
    }
  }
  return null;
}

function pendingApprovalFromEvent(
  event: TrajectoryEvent | undefined,
  turnId: string,
  resolved: Set<string>,
): PendingConversationApproval | null {
  if (!event || event.turnId !== turnId) {
    return null;
  }
  const resolution = event.approvalResolved?.resolution;
  if (resolution) {
    resolved.add(resolution.approvalId);
    return null;
  }
  const approval = event.approvalRequested?.approval;
  return approval && !resolved.has(approval.id) ? { approval, turnId } : null;
}
