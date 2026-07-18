import type { WorkflowEvent, WorkflowExecutionSummary } from "@generated/backend";
import { useCallback, useEffect, useState } from "react";

import type { WorkflowGraphTarget } from "./workflow-graph-projection-state";
import { workflowGraphRunTarget } from "./workflow-graph-projection-state";
import { workflowActiveRunSummary } from "./workflow-graph-toolbar";

const workflowRunSummaryLimit = 20;
const workflowRunSummaryRefreshEventTypes = new Set<WorkflowEvent["type"]>([
  "workflow.execution.started",
  "workflow.execution.completed",
  "workflow.execution.failed",
  "workflow.execution.stopped",
  "workflow.execution.cancelled",
]);

export function useWorkflowRunSummaries({
  setWorkflowEditorError,
  target,
}: {
  setWorkflowEditorError: (message: string) => void;
  target: WorkflowGraphTarget | null;
}) {
  const [summariesByDefinition, setSummariesByDefinition] = useState<
    Record<string, WorkflowExecutionSummary[]>
  >({});
  const refreshRunSummaries = useCallback(async (workspaceId: string, definitionId: string) => {
    if (workspaceId === "" || definitionId === "") {
      return [];
    }
    const response = await window.setta.workflow.listExecutions(
      workspaceId,
      definitionId,
      workflowRunSummaryLimit,
    );
    const key = workflowRunSummaryKey(workspaceId, definitionId);
    setSummariesByDefinition((current) => ({
      ...current,
      [key]: response.executions,
    }));
    return response.executions;
  }, []);
  const targetKey =
    target === null ? "" : workflowRunSummaryKey(target.workspaceId, target.definitionId);
  const runSummaries = targetKey === "" ? [] : (summariesByDefinition[targetKey] ?? []);

  useEffect(() => {
    if (target === null) {
      return;
    }
    void refreshRunSummaries(target.workspaceId, target.definitionId).catch((error: unknown) => {
      console.error("Failed to load workflow runs", error);
      setWorkflowEditorError(
        error instanceof Error ? error.message : "Workflow run history load failed",
      );
    });
  }, [refreshRunSummaries, setWorkflowEditorError, target]);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const unsubscribe = window.setta.workflow.onEvent((event) => {
      if (
        workflowEventShouldRefreshRunSummaries(event) &&
        event.workspaceId === target.workspaceId &&
        event.definitionId === target.definitionId
      ) {
        void refreshRunSummaries(target.workspaceId, target.definitionId).catch(
          (error: unknown) => {
            console.error("Failed to refresh workflow runs", error);
            setWorkflowEditorError(
              error instanceof Error ? error.message : "Workflow run history refresh failed",
            );
          },
        );
      }
    });
    return unsubscribe;
  }, [refreshRunSummaries, setWorkflowEditorError, target]);

  return {
    activeRun: workflowActiveRunSummary(runSummaries),
    refreshRunSummaries,
    runSummaries,
  };
}

export function workflowGraphTargetForRunSummary(summary: WorkflowExecutionSummary) {
  return workflowGraphRunTarget({
    definitionId: summary.definitionId,
    executionId: summary.id,
    versionId: summary.definitionVersionId,
    workspaceId: summary.workspaceId,
  });
}

function workflowRunSummaryKey(workspaceId: string, definitionId: string) {
  return `${workspaceId}:${definitionId}`;
}

function workflowEventShouldRefreshRunSummaries(event: WorkflowEvent) {
  return workflowRunSummaryRefreshEventTypes.has(event.type);
}
