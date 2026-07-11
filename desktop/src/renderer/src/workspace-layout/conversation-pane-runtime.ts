import { useEffect, useRef } from "react";

import { useConversationPaneStore } from "../stores/conversation-pane-store";
import {
  presentConversationPane,
  type ConversationPanePresentationRequest,
} from "./conversation-pane-coordinator";
import type { PaneId, Rect } from "./types";
import type { WorkspaceRuntime } from "./workspace-runtime";

export interface WorkspaceConversationFocusRequest extends ConversationPanePresentationRequest {
  requestId: number;
}

interface ConversationPaneRuntimeOptions {
  focusRequest: WorkspaceConversationFocusRequest | null;
  focusedPaneId: PaneId;
  layoutRevision: number;
  onPresentationError?: (message: string | null) => void;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  stageViewport: () => Rect;
  workspaceId: string;
}

export function useConversationPaneRuntime(options: ConversationPaneRuntimeOptions): void {
  useConversationPaneIndex(options);
  useConversationPanePresentation(options);
}

function useConversationPaneIndex({
  focusedPaneId,
  layoutRevision,
  runtime,
  workspaceId,
}: ConversationPaneRuntimeOptions): void {
  const syncWorkspace = useConversationPaneStore((state) => state.syncWorkspace);
  const removeWorkspace = useConversationPaneStore((state) => state.removeWorkspace);

  useEffect(() => {
    if (runtime.mode !== "workspace") {
      return;
    }
    syncWorkspace(workspaceId, runtime.store.toScene(), focusedPaneId);
  }, [focusedPaneId, layoutRevision, runtime, syncWorkspace, workspaceId]);
  useEffect(
    () => () => {
      removeWorkspace(workspaceId);
    },
    [removeWorkspace, workspaceId],
  );
}

function useConversationPanePresentation({
  focusRequest,
  onPresentationError,
  runLayoutAction,
  runtime,
  stageViewport,
  workspaceId,
}: ConversationPaneRuntimeOptions): void {
  const lastFocusRequestIdRef = useRef(0);

  useEffect(() => {
    if (
      !focusRequest ||
      runtime.mode !== "workspace" ||
      focusRequest.workspaceId !== workspaceId ||
      focusRequest.requestId <= lastFocusRequestIdRef.current
    ) {
      return;
    }
    lastFocusRequestIdRef.current = focusRequest.requestId;
    let blockedReason: string | null = null;
    runLayoutAction(() => {
      const result = presentConversationPane(runtime.store, focusRequest);
      if (result.kind === "blocked") {
        blockedReason = result.reason;
        return;
      }
      runtime.store.ensureFocusedColumnVisible(stageViewport());
      runtime.store.snapScrollToTarget();
    });
    onPresentationError?.(blockedReason);
  }, [focusRequest, onPresentationError, runLayoutAction, runtime, stageViewport, workspaceId]);
}
