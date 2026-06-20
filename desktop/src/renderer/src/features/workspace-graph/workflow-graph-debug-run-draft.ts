import type { WorkflowGraphProjection } from "@generated/backend";
import { type MutableRefObject, useEffect } from "react";

export function useWorkflowGraphDebugRunDraftRegistration({
  runWorkflowDraft,
  surfaceId,
  workflowProjectionRef,
}: {
  runWorkflowDraft: () => Promise<void>;
  surfaceId: string;
  workflowProjectionRef: MutableRefObject<WorkflowGraphProjection | null>;
}) {
  useEffect(() => {
    if (!window.setta.app.flags.workflowGraphDebug) {
      return;
    }
    const callbacks = window.__settaWorkflowGraphRunDrafts ?? new Map();
    window.__settaWorkflowGraphRunDrafts = callbacks;
    const runWorkflowDraftForDebug = async () => {
      await runWorkflowDraft();
      const projection = workflowProjectionRef.current;
      return {
        definitionId: projection?.definitionId ?? "",
        executionId: projection?.executionId ?? "",
        viewMode: projection?.viewMode ?? "",
        workspaceId: projection?.workspaceId ?? "",
      };
    };
    callbacks.set(surfaceId, runWorkflowDraftForDebug);
    return () => {
      if (callbacks.get(surfaceId) === runWorkflowDraftForDebug) {
        callbacks.delete(surfaceId);
      }
      if (callbacks.size === 0 && window.__settaWorkflowGraphRunDrafts === callbacks) {
        delete window.__settaWorkflowGraphRunDrafts;
      }
    };
  }, [runWorkflowDraft, surfaceId, workflowProjectionRef]);
}
