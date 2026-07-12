import type { WorkspaceUILayout } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";

import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import type { SpeechCaptureRequester } from "../features/global-speech/speech-capture-destination";
import type { WorkspaceConversationFocusRequest } from "./conversation-pane-runtime";
import type { WorkspaceSceneMode } from "./runtime-mode-options";
import type { WorkspaceSurfaceFocusRequest } from "./workspace-layout-area-runtime";

export interface WorkspaceLayoutAreaProps {
  focusConversationRequest?: WorkspaceConversationFocusRequest | null;
  focusSurfaceRequest?: WorkspaceSurfaceFocusRequest | null;
  onConversationPresentationError?: (message: string | null) => void;
  onToggleProjectPane: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
  shellOverlayActive?: boolean;
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
}

export interface WorkspaceLayoutRuntimeAreaProps {
  focusConversationRequest: WorkspaceConversationFocusRequest | null;
  focusSurfaceRequest: WorkspaceSurfaceFocusRequest | null;
  initialLayout: WorkspaceUILayout | null;
  layoutLoadError: string | null;
  mode: WorkspaceSceneMode;
  onConversationPresentationError?: (message: string | null) => void;
  onToggleProjectPane: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
  shellOverlayActive: boolean;
  speechCapture: SpeechCaptureRequester | undefined;
  speechPresentation: GlobalSpeechPresentationSource | undefined;
  workspaceId: string;
  workspaceName: string;
}
