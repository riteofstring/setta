import type { ConversationPaneResourceBinding } from "@generated/backend";
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
    workspaceId: workspaceId ?? null,
  });
  const workspaceAvailable =
    workspaceAvailability(workspaceSession, effectiveWorkspaceId)?.available ?? false;
  useEffect(() => {
    if (!effectiveWorkspaceId) {
      return;
    }
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
  const folderResourceRequired = !effectiveWorkspaceId;
  const readOnly = !folderResourceRequired && !workspaceAvailable;
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
  workspaceId,
}: {
  projection: ConversationProjection | undefined;
  resourceBindings: ConversationPaneResourceBinding[] | undefined;
  workspaceId: string | null;
}): string | null {
  if (resourceBindings) {
    return resourceBindings.some((binding) => binding.kind === "folder") ? workspaceId : null;
  }
  return projection?.snapshot?.conversation.workspaceId ?? workspaceId;
}
