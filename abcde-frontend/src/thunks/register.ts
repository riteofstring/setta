import { dbRegister } from "dbRequests/authentication";
import { useAuth } from "models/auth";
import { router } from "utils/Routes/router";

export async function register({ username, password }) {
  try {
    const res = await dbRegister({ username, password });
    useAuth.getState().loginSuccess(res);
    router.navigate("/");
  } catch (error) {
    useAuth.getState().loginFail();
  }
}
