import { useEffect, useRef } from "react";

import { useConversationPaneStore } from "../stores/conversation-pane-store";
import {
  conversationPanePresentationRequestEvent,
  presentConversationPane,
  type ConversationPanePresentationEventDetail,
  type ConversationPanePresentationRequest,
  type ConversationPanePresentationResult,
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
  useConversationPanePresentationRequests(options);
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
    const result = applyConversationPanePresentation(
      focusRequest,
      runLayoutAction,
      runtime,
      stageViewport,
    );
    const blockedReason = result.kind === "blocked" ? result.reason : null;
    onPresentationError?.(blockedReason);
  }, [focusRequest, onPresentationError, runLayoutAction, runtime, stageViewport, workspaceId]);
}

function useConversationPanePresentationRequests({
  onPresentationError,
  runLayoutAction,
  runtime,
  stageViewport,
  workspaceId,
}: ConversationPaneRuntimeOptions): void {
  useEffect(() => {
    if (runtime.mode !== "workspace") {
      return;
    }
    const present = (event: Event) => {
      const detail = (event as CustomEvent<ConversationPanePresentationEventDetail>).detail;
      if (!detail?.request || detail.request.workspaceId !== workspaceId || detail.result) {
        return;
      }
      detail.result = applyConversationPanePresentation(
        detail.request,
        runLayoutAction,
        runtime,
        stageViewport,
      );
      onPresentationError?.(detail.result.kind === "blocked" ? detail.result.reason : null);
    };
    window.addEventListener(conversationPanePresentationRequestEvent, present);
    return () => window.removeEventListener(conversationPanePresentationRequestEvent, present);
  }, [onPresentationError, runLayoutAction, runtime, stageViewport, workspaceId]);
}

function applyConversationPanePresentation(
  request: ConversationPanePresentationRequest,
  runLayoutAction: (action: () => void) => void,
  runtime: WorkspaceRuntime,
  stageViewport: () => Rect,
): ConversationPanePresentationResult {
  let result: ConversationPanePresentationResult = {
    kind: "blocked",
    reason: `Workspace ${request.workspaceId} is not mounted.`,
  };
  runLayoutAction(() => {
    result = presentConversationPane(runtime.store, request);
    if (result.kind === "blocked") {
      return;
    }
    runtime.store.ensureFocusedColumnVisible(stageViewport());
    runtime.store.snapScrollToTarget();
  });
  return result;
}
