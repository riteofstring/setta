import { dbLogout } from "dbRequests/authentication";
import { useAuth } from "models/auth";
import { router } from "utils/Routes/router";
import { resetAllStores } from "./reset";

export function logout() {
  dbLogout();
  useAuth.getState().loginFail();
  resetAllStores();
  router.navigate("/");
}
