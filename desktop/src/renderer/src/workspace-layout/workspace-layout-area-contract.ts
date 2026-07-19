import type { WorkspaceUILayout } from "@generated/backend";
import type { DesktopPlatform } from "@shared/types";

import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import type { InitialEasyButtonPaneStartup } from "../features/easy-button/initial-easy-button-pane";
import type { SpeechCaptureRequester } from "../features/global-speech/speech-capture-destination";
import type {
  WorkspaceConversationFocusRequest,
  WorkspaceConversationPlacementPreflightRequest,
} from "./conversation-pane-runtime";
import type { WorkspaceSceneMode } from "./runtime-mode-options";

export interface WorkspaceLayoutAreaProps {
  focusConversationRequest?: WorkspaceConversationFocusRequest | null;
  initialEasyButtonPaneStartup?: InitialEasyButtonPaneStartup;
  onConversationPresentationError?: (message: string | null) => void;
  onOpenSettingsPage: () => void;
  placementPreflightRequest?: WorkspaceConversationPlacementPreflightRequest | null;
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
  initialEasyButtonPaneStartup: InitialEasyButtonPaneStartup;
  initialLayout: WorkspaceUILayout | null;
  initialMaximizedPaneId: string | null;
  layoutLoadError: string | null;
  mode: WorkspaceSceneMode;
  onConversationPresentationError?: (message: string | null) => void;
  onOpenSettingsPage: () => void;
  placementPreflightRequest: WorkspaceConversationPlacementPreflightRequest | null;
  onToggleProjectPane: () => void;
  platform: DesktopPlatform;
  projectPaneOpen: boolean;
  projectPaneWidth: number;
  shellOverlayActive: boolean;
  speechCapture: SpeechCaptureRequester | undefined;
  speechPresentation: GlobalSpeechPresentationSource | undefined;
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string | null;
}
