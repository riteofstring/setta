import { dbLogin } from "dbRequests/authentication";
import { useUser } from "models/user";

export async function login({ username, password }) {
  const res = await dbLogin({ username, password });
  if (res.status === 200) {
    useUser.getState().loginSuccess(res.data);
  } else {
    useUser.getState().loginFail();
  }
}
