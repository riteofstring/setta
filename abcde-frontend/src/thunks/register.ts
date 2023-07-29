import { dbRegister } from "dbRequests/authentication";
import { useUser } from "models/user";
import { router } from "utils/Routes/router";

export async function register({ username, password }) {
  const res = await dbRegister({ username, password });
  if (res.status === 200) {
    useUser.getState().loginSuccess(res);
    router.navigate("/");
  } else {
    useUser.getState().loginFail();
  }
}
