import { AppPage } from "components/Pages/App/AppPage";
import { AppPreview } from "components/Pages/Project/AppPreview";
import { AppConfigPane } from "components/Panes/Overview/App/AppConfigPane";
import {
  APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
  buildAppGenerationSlashCommandDefinitions,
  DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
} from "plugins/appSubsystemChatUi";
import { useAppConfigs, useAppPreview } from "state/definitions";

export default {
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
  customSlashCommandModes: {
    options: APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE_OPTIONS,
    defaultMode: DEFAULT_APP_SUBSYSTEM_CUSTOM_SLASH_COMMAND_MODE,
  },
  resetProjectState: () => {
    useAppConfigs.getState().reset?.();
    useAppPreview.getState().reset?.();
  },
};
