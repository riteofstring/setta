import { dbRegister } from "dbRequests/authentication";
import { useAuth } from "models/auth";
import { router } from "utils/Routes/router";

export async function register({ username, password }) {
  const res = await dbRegister({ username, password });
  if (res.status === 200) {
    useAuth.getState().loginSuccess(res);
    router.navigate("/");
  } else {
    useAuth.getState().loginFail();
  }
}
