import { useEffect, useRef } from "react";

import { useConversationPaneStore } from "../stores/conversation-pane-store";
import {
  preflightConversationPanePlacement,
  presentConversationPane,
  type ConversationPanePlacementPreflightResult,
  type ConversationPanePlacementRequest,
  type ConversationPanePresentationRequest,
  type ConversationPanePresentationResult,
} from "./conversation-pane-coordinator";
import type { PaneId, Rect } from "./types";
import type { WorkspaceRuntime } from "./workspace-runtime";

export interface WorkspaceConversationFocusRequest extends ConversationPanePresentationRequest {
  complete: (result: ConversationPanePresentationResult) => void;
  requestId: number;
}

export interface WorkspaceConversationPlacementPreflightRequest extends ConversationPanePlacementRequest {
  complete: (result: ConversationPanePlacementPreflightResult) => void;
  requestId: number;
}

interface ConversationPaneRuntimeOptions {
  focusRequest: WorkspaceConversationFocusRequest | null;
  focusedPaneId: PaneId;
  layoutRevision: number;
  onPresentationError?: (message: string | null) => void;
  placementPreflightRequest: WorkspaceConversationPlacementPreflightRequest | null;
  runLayoutAction: (action: () => void) => Promise<boolean> | void;
  runtime: WorkspaceRuntime;
  stageViewport: () => Rect;
  workspaceId: string;
}

export function useConversationPaneRuntime(options: ConversationPaneRuntimeOptions): void {
  useConversationPaneIndex(options);
  useConversationPanePlacementPreflight(options);
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

function useConversationPanePlacementPreflight({
  placementPreflightRequest,
  runtime,
  workspaceId,
}: ConversationPaneRuntimeOptions): void {
  const lastPlacementRequestIdRef = useRef(0);

  useEffect(() => {
    if (
      !placementPreflightRequest ||
      runtime.mode !== "workspace" ||
      placementPreflightRequest.workspaceId !== workspaceId ||
      placementPreflightRequest.requestId <= lastPlacementRequestIdRef.current
    ) {
      return;
    }
    lastPlacementRequestIdRef.current = placementPreflightRequest.requestId;
    placementPreflightRequest.complete(
      preflightConversationPanePlacement(runtime.store, placementPreflightRequest),
    );
  }, [placementPreflightRequest, runtime, workspaceId]);
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
    void applyConversationPanePresentation(
      focusRequest,
      runLayoutAction,
      runtime,
      stageViewport,
    ).then(
      (result) => {
        onPresentationError?.(result.kind === "blocked" ? result.reason : null);
        focusRequest.complete(result);
      },
      () => {
        const result = {
          kind: "blocked",
          reason: "The workspace could not apply the conversation pane request.",
        } as const;
        onPresentationError?.(result.reason);
        focusRequest.complete(result);
      },
    );
  }, [focusRequest, onPresentationError, runLayoutAction, runtime, stageViewport, workspaceId]);
}

async function applyConversationPanePresentation(
  request: ConversationPanePresentationRequest,
  runLayoutAction: (action: () => void) => Promise<boolean> | void,
  runtime: WorkspaceRuntime,
  stageViewport: () => Rect,
): Promise<ConversationPanePresentationResult> {
  let result: ConversationPanePresentationResult = {
    kind: "blocked",
    reason: `Workspace ${request.workspaceId} is not mounted.`,
  };
  const persisted = await runLayoutAction(() => {
    result = presentConversationPane(runtime.store, request);
    if (result.kind === "blocked") {
      return;
    }
    runtime.store.ensureFocusedColumnVisible(stageViewport());
    runtime.store.snapScrollToTarget();
  });
  if (result.kind !== "blocked" && persisted === false) {
    return {
      kind: "blocked",
      reason: "The workspace could not persist the conversation pane request.",
    };
  }
  return result;
}
