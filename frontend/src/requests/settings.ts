import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbSaveSettings(settings) {
  return await post({
    address: RouteEnum.SAVE_SETTINGS,
    body: { settings },
  });
}

export async function dbLoadSettings() {
  return await post({
    address: RouteEnum.LOAD_SETTINGS,
    body: {},
  });
}

export async function dbSaveSettingsProject(settingsProject) {
  return await post({
    address: RouteEnum.SAVE_SETTINGS_PROJECT,
    body: { settingsProject },
  });
}

export async function dbLoadSettingsProject() {
  return await post({
    address: RouteEnum.LOAD_SETTINGS_PROJECT,
    body: {},
  });
}
