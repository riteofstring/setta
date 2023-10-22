import { dbSetDarkMode } from "dbRequests/settings";
import { useUser } from "models/user";

export function toggleDarkMode() {
  useUser.getState().toggleDarkMode();
  dbSetDarkMode(useUser.getState().darkMode);
}
