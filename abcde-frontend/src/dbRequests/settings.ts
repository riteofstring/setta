import { SET_DARK_MODE } from "abcde-utils/src/routes";
import { NO_AUTH } from "utils/constants";
import { post } from "./utils";

export async function dbSetDarkMode(darkMode) {
  if (NO_AUTH) {
    return;
  }

  return await post({
    address: SET_DARK_MODE,
    body: { darkMode },
    withCredentials: true,
  });
}
