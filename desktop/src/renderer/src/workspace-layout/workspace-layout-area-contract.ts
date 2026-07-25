import type { DesktopPlatform } from "@shared/types";

import type { AppShellMasterController } from "../features/global-master/app-shell-master-controller";
import type { AppShellSpeechCaptureController } from "../features/global-speech/app-shell-speech-capture-controller";
import type { AppShellSpeechPlaybackController } from "../features/global-speech/app-shell-speech-playback-controller";
import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import type { SpeechCaptureRequester } from "../features/global-speech/speech-capture-destination";
import type {
  WorkspaceConversationFocusRequest,
  WorkspaceConversationPlacementPreflightRequest,
} from "./conversation-pane-runtime";
import type { WorkspaceSceneMode } from "./runtime-mode-options";
import type { RealWorkspaceStoredLayout } from "./workspace-scene";

export interface WorkspaceLayoutAreaProps {
  focusConversationRequest?: WorkspaceConversationFocusRequest | null;
  masterController?: AppShellMasterController;
  masterSpeechCapture?: AppShellSpeechCaptureController;
  masterSpeechPlayback?: AppShellSpeechPlaybackController;
  onConversationPresentationError?: (message: string | null) => void;
  onOpenSettingsPage: () => void;
  onOpenVoiceCredentialSettings?: () => void;
  placementPreflightRequest?: WorkspaceConversationPlacementPreflightRequest | null;
  platform: DesktopPlatform;
  shellOverlayActive?: boolean;
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
}

export interface WorkspaceLayoutRuntimeAreaProps {
  focusConversationRequest: WorkspaceConversationFocusRequest | null;
  initialLayout: RealWorkspaceStoredLayout | null;
  initialMaximizedPaneId: string | null;
  layoutLoadError: string | null;
  masterController: AppShellMasterController | undefined;
  masterSpeechCapture: AppShellSpeechCaptureController | undefined;
  masterSpeechPlayback: AppShellSpeechPlaybackController | undefined;
  mode: WorkspaceSceneMode;
  onConversationPresentationError?: (message: string | null) => void;
  onOpenSettingsPage: () => void;
  onOpenVoiceCredentialSettings: (() => void) | undefined;
  placementPreflightRequest: WorkspaceConversationPlacementPreflightRequest | null;
  platform: DesktopPlatform;
  shellOverlayActive: boolean;
  speechCapture: SpeechCaptureRequester | undefined;
  speechPresentation: GlobalSpeechPresentationSource | undefined;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string | null;
}
