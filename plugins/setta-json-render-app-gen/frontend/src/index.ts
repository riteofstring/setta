import { AppPreview } from "./components/Pages/Project/AppPreview";
import { AppPage } from "./components/Pages/App/AppPage";
import { AppConfigPane } from "components/Panes/Overview/App/AppConfigPane";
import {
  APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  buildAppGenerationSlashCommandDefinitions,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  doesAppSubsystemModeRequireImageAttachment,
} from "./appSubsystemChatUi";
import { useAppConfigs, useAppPreview } from "state/definitions";

export const appSubsystemFrontendRegistration = {
  overviewTab: {
    component: AppConfigPane,
    titleQuickInfo: "Configure the JSON Render app subsystem.",
    moreMenuQuickInfo: "Open JSON Render app configuration.",
    moreMenuLabel: "JSON Render",
  },
  previewSurface: {
    component: AppPreview,
  },
  appModeRoute: {
    component: AppPage,
  },
  slashCommands: buildAppGenerationSlashCommandDefinitions(),
  imageRequiredModes: APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS.filter(
    (option) => doesAppSubsystemModeRequireImageAttachment(option.id),
  ).map((option) => option.id),
  customSlashCommandModes: {
    options: APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
    defaultMode: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  },
  resetProjectState: () => {
    useAppConfigs.getState().reset?.();
    useAppPreview.getState().reset?.();
  },
};

export default appSubsystemFrontendRegistration;
