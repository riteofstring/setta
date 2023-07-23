import { dbLogout } from "dbRequests/authentication";
import { router } from "utils/Routes/router";
import { resetAllStores } from "./reset";

export function logout() {
  dbLogout();
  resetAllStores();
  router.navigate("/");
}
