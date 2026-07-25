import type { ConversationPaneResourceBinding, WorkspaceSession } from "@generated/backend";
import { useEffect } from "react";

import type { ConversationProjection } from "../../stores/conversation-projection";
import {
  retainConversationProjection,
  useConversationProjectionRuntimeGeneration,
} from "../../stores/conversation-projection-runtime";
import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { useConversationStore } from "../../stores/conversation-store";
import { useWorkspaceStore, workspaceAvailability } from "../../stores/workspace-store";
import { emptyWorkspaceRuntimeId } from "../../workspace-layout/workspace-layout-area-runtime";
import { usePaneSpeechPresentation } from "../global-speech/app-shell-speech-status";
import type { GlobalSpeechPresentationSource } from "../global-speech/global-speech-presentation";
import type { SpeechCaptureRequester } from "../global-speech/speech-capture-destination";
import { useEasyButtonConversationCommands } from "./easy-button-conversation-commands";
import {
  EasyButtonProjectionSurface,
  easyButtonConversationProjection,
  easyButtonProjectionView,
} from "./easy-button-surface";

interface EasyButtonSurfaceProps {
  conversationId: string;
  paneId?: string | null;
  resourceBindings?: ConversationPaneResourceBinding[];
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
  workspaceId?: string | null;
}

export function EasyButtonSurface({
  conversationId,
  paneId = null,
  resourceBindings,
  speechCapture,
  speechPresentation,
  workspaceId,
}: EasyButtonSurfaceProps) {
  const workspaceSession = useWorkspaceStore((state) => state.session);
  const projection = useConversationStore((state) =>
    easyButtonConversationProjection(state.conversations, conversationId),
  );
  const projectionRuntimeGeneration = useConversationProjectionRuntimeGeneration();
  const effectiveWorkspaceId = conversationSurfaceWorkspaceId({
    projection,
    resourceBindings,
    workspaceSession,
    workspaceId: workspaceId ?? null,
  });
  const workspaceScopeResolved = effectiveWorkspaceId !== undefined;
  const workspaceAvailable =
    workspaceScopeResolved &&
    (workspaceAvailability(workspaceSession, effectiveWorkspaceId)?.available ?? false);
  useEffect(() => {
    if (effectiveWorkspaceId === undefined) {
      return;
    }
    return retainConversationProjection(effectiveWorkspaceId, conversationId);
  }, [conversationId, effectiveWorkspaceId, projectionRuntimeGeneration]);
  const commands = useEasyButtonConversationCommands({
    conversationId,
    paneId,
    projection,
    speechCapture,
    workspaceAvailable,
    workspaceScopeResolved,
    workspaceId: effectiveWorkspaceId,
  });
  const speech = usePaneSpeechPresentation(conversationId, paneId, speechPresentation);
  const readOnly = effectiveWorkspaceId ? !workspaceAvailable : false;
  const parentTitle = useConversationNavigatorStore((state) => {
    const parentConversationId = projection?.snapshot?.branch?.parentConversationId;
    if (!effectiveWorkspaceId || !parentConversationId) {
      return null;
    }
    return (
      state.workspaces[effectiveWorkspaceId]?.items.find(
        (item) => item.conversation.id === parentConversationId,
      )?.conversation.title ?? null
    );
  });
  const projectedView = easyButtonProjectionView(conversationId, projection, paneId, parentTitle);
  const view = commands.error ? { ...projectedView, error: commands.error } : projectedView;
  return (
    <EasyButtonProjectionSurface
      commands={commands}
      readOnly={readOnly}
      speech={speech}
      view={view}
    />
  );
}

export function conversationSurfaceWorkspaceId({
  projection,
  resourceBindings,
  workspaceSession,
  workspaceId,
}: {
  projection: ConversationProjection | undefined;
  resourceBindings: ConversationPaneResourceBinding[] | undefined;
  workspaceSession: WorkspaceSession | null;
  workspaceId: string | null;
}): string | null | undefined {
  const projectedWorkspaceId = projectionWorkspaceId(projection);
  if (resourceBindings === undefined) {
    return projectedWorkspaceId !== undefined
      ? projectedWorkspaceId
      : mountedWorkspaceId(workspaceId);
  }
  const folderRootPath = folderBindingRootPath(resourceBindings);
  if (folderRootPath === null) {
    return null;
  }
  const activeWorkspaceId = activeWorkspaceIdForRootPath(workspaceSession, folderRootPath);
  if (activeWorkspaceId !== null) {
    return activeWorkspaceId;
  }
  return projectedWorkspaceId;
}

function projectionWorkspaceId(
  projection: ConversationProjection | undefined,
): string | null | undefined {
  return projection?.snapshot?.conversation.workspaceId;
}

function folderBindingRootPath(resourceBindings: ConversationPaneResourceBinding[]): string | null {
  return resourceBindings.find((binding) => binding.kind === "folder")?.folder.rootPath ?? null;
}

function activeWorkspaceIdForRootPath(
  workspaceSession: WorkspaceSession | null,
  rootPath: string,
): string | null {
  return (
    workspaceSession?.activeWorkspaces.find((workspace) => workspace.rootPath === rootPath)?.id ??
    null
  );
}

function mountedWorkspaceId(workspaceId: string | null): string | undefined {
  if (!workspaceId || workspaceId === emptyWorkspaceRuntimeId) {
    return undefined;
  }
  return workspaceId;
}
