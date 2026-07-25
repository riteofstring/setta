import type { ConversationPaneResourceBinding, WorkspaceSession } from "@generated/backend";
import { useEffect } from "react";

import type { ConversationProjection } from "../../stores/conversation-projection";
import { retainConversationProjection } from "../../stores/conversation-projection-runtime";
import { useConversationNavigatorStore } from "../../stores/conversation-navigator-store";
import { useConversationStore } from "../../stores/conversation-store";
import { useWorkspaceStore, workspaceAvailability } from "../../stores/workspace-store";
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
  const effectiveWorkspaceId = conversationSurfaceWorkspaceId({
    projection,
    resourceBindings,
    workspaceSession,
    workspaceId: workspaceId ?? null,
  });
  const workspaceAvailable =
    workspaceAvailability(workspaceSession, effectiveWorkspaceId)?.available ?? false;
  useEffect(() => {
    return retainConversationProjection(effectiveWorkspaceId, conversationId);
  }, [conversationId, effectiveWorkspaceId]);
  const commands = useEasyButtonConversationCommands({
    conversationId,
    paneId,
    projection,
    speechCapture,
    workspaceAvailable,
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

function conversationSurfaceWorkspaceId({
  projection,
  resourceBindings,
  workspaceSession,
  workspaceId,
}: {
  projection: ConversationProjection | undefined;
  resourceBindings: ConversationPaneResourceBinding[] | undefined;
  workspaceSession: WorkspaceSession | null;
  workspaceId: string | null;
}): string | null {
  const projectedWorkspaceId = projectionWorkspaceId(projection);
  if (resourceBindings === undefined) {
    return projectedWorkspaceId ?? workspaceId;
  }
  const folderRootPath = folderBindingRootPath(resourceBindings);
  if (folderRootPath === null) {
    return null;
  }
  return activeWorkspaceIdForRootPath(workspaceSession, folderRootPath) ?? projectedWorkspaceId;
}

function projectionWorkspaceId(projection: ConversationProjection | undefined): string | null {
  return projection?.snapshot?.conversation.workspaceId ?? null;
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
