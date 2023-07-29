import { dbSetDarkMode } from "dbRequests/settings";
import { useUser } from "models/user";

export function toggleDarkMode() {
  useUser.setState((state) => ({ darkMode: !state.darkMode }));
  dbSetDarkMode(useUser.getState().darkMode);
}
