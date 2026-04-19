import type { AppSubsystemFrontendRegistration } from "@setta/app-subsystem-frontend-sdk";
import { AppPreview } from "./components/Pages/Project/AppPreview";
import { AppPage } from "./components/Pages/App/AppPage";
import { PublishAppDeploymentModal } from "./components/Modals/AppDeploymentsModal/PublishAppDeploymentModal";
import { AppConfigPane } from "./components/Panes/Overview/App/AppConfigPane";
import {
  APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  buildAppGenerationSlashCommandDefinitions,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  doesAppSubsystemModeRequireImageAttachment,
} from "./appSubsystemChatUi";
import {
  applyAppDefinitionStructuredContentToStore,
  applyAppSpecPatchPreviewDeltaToStore,
  clearAllAppSpecPatchPreviewStreams,
  clearAppSpecPatchPreviewStream,
} from "./appSubsystemPreviewController";
import { useAppConfigs, useAppPreview } from "./appSubsystemProjectState";
import {
  initializeAppSessionFromCurrentDeployment,
  resetAppSessionState,
} from "./state/actions/app";
import { processAppProjectStateUpdateFromBackend } from "./state/actions/appProjectState";
import { createReactAppSubsystemRenderer } from "./appSubsystemReactRenderer";
import { registerAppSubsystemFrontend } from "./appSubsystemPluginHost";

export const apiVersion = 1;

export function register(host: unknown): void {
  registerAppSubsystemFrontend(host, appSubsystemFrontendRegistration);
}

export const appSubsystemFrontendRegistration: AppSubsystemFrontendRegistration =
  {
    overviewTab: {
      renderer: createReactAppSubsystemRenderer(AppConfigPane),
      titleQuickInfo: "Configure the JSON Render app subsystem.",
      moreMenuQuickInfo: "Open JSON Render app configuration.",
      moreMenuLabel: "JSON Render",
    },
    previewSurface: {
      renderer: createReactAppSubsystemRenderer(AppPreview),
    },
    appModeRoute: {
      renderer: createReactAppSubsystemRenderer(AppPage, {
        browserRouter: true,
      }),
    },
    appDeploymentModal: {
      renderer: createReactAppSubsystemRenderer(PublishAppDeploymentModal),
    },
    chat: {
      slashCommands: buildAppGenerationSlashCommandDefinitions(),
      imageRequiredModes:
        APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS.filter((option) =>
          doesAppSubsystemModeRequireImageAttachment(option.id),
        ).map((option) => option.id),
      customSlashCommandModes: {
        options: APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
        defaultMode: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
      },
    },
    controller: {
      getPreviewEnabled: () => useAppPreview.getState().isPreviewEnabled,
      subscribePreviewEnabled: (
        listener: (previewEnabled: boolean) => void,
      ) => {
        let previousPreviewEnabled = useAppPreview.getState().isPreviewEnabled;
        return useAppPreview.subscribe((state) => {
          if (state.isPreviewEnabled === previousPreviewEnabled) {
            return;
          }
          previousPreviewEnabled = state.isPreviewEnabled;
          listener(state.isPreviewEnabled);
        });
      },
      applyAppDefinitionStructuredContentToStore,
      applyAppSpecPatchPreviewDeltaToStore,
      clearAppSpecPatchPreviewStream,
      clearAllAppSpecPatchPreviewStreams,
      initializeAppSessionFromCurrentDeployment,
      resetAppSessionState,
      processAppProjectStateUpdateFromBackend,
      resetProjectState: () => {
        clearAllAppSpecPatchPreviewStreams();
        useAppConfigs.getState().reset?.();
        useAppPreview.getState().reset?.();
      },
    },
  };

export default appSubsystemFrontendRegistration;
