import { SET_DARK_MODE } from "abcde-utils/src/routes";
import { post } from "./utils";

export async function dbSetDarkMode(darkMode) {
  return await post({
    address: SET_DARK_MODE,
    body: { darkMode },
  });
}
