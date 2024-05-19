import { LOAD_SETTINGS, SET_DARK_MODE } from "z_utils/routes";
import { post } from "./utils";

export async function dbSetDarkMode(darkMode) {
  return await post({
    address: SET_DARK_MODE,
    body: { darkMode },
  });
}

export async function dbLoadSettings() {
  return await post({
    address: LOAD_SETTINGS,
    body: {},
  });
}

export async function dbLoadConstants() {
  return await post({
    address: "/constants",
    body: {},
  });
}
