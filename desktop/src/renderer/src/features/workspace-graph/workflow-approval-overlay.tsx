import type {
  ApprovalAnswer,
  WorkflowGraphProjection,
  WorkflowPendingApproval,
} from "@generated/backend";
import { useState } from "react";

import { ApprovalCard, type SubmitApproval } from "../../components/chat-transcript-approvals";

export function WorkflowApprovalOverlay({
  pendingApproval,
  projection,
  setWorkflowProjection,
}: {
  pendingApproval: WorkflowPendingApproval | null;
  projection: WorkflowGraphProjection | null;
  setWorkflowProjection: (projection: WorkflowGraphProjection | null) => void;
}) {
  const [error, setError] = useState("");
  if (pendingApproval === null || projection === null) {
    return null;
  }
  const submitApproval: SubmitApproval = async (
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ) => {
    setError("");
    try {
      await window.setta.workflow.submitApproval({
        answers,
        approvalId,
        approved,
        cancelled,
        executionId: pendingApproval.executionId,
        nodeExecutionId: pendingApproval.nodeExecutionId,
        response,
        workspaceId: pendingApproval.workspaceId,
      });
      const refreshed = await window.setta.workflow.graphProjection(
        pendingApproval.workspaceId,
        projection.definitionId,
        projection.definitionVersionId,
        pendingApproval.executionId,
      );
      setWorkflowProjection(refreshed.projection);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Workflow approval failed");
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-end sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-auto">
      <div className="pointer-events-auto w-full max-w-md shadow-xl">
        <ApprovalCard approval={pendingApproval.approval} submitApproval={submitApproval} />
        {error ? (
          <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
