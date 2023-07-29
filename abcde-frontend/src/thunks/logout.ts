import { dbLogout } from "dbRequests/authentication";
import { useUser } from "models/user";
import { router } from "utils/Routes/router";
import { resetAllStores } from "./reset";

export function logout() {
  dbLogout();
  useUser.getState().loginFail();
  resetAllStores();
  router.navigate("/");
}
