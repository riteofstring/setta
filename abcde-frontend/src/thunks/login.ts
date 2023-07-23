import { dbLogin } from "dbRequests/authentication";
import { useAuth } from "models/auth";

export async function login({ username, password }) {
  try {
    const res = await dbLogin({ username, password });
    useAuth.getState().loginSuccess(res);
  } catch (error) {
    useAuth.getState().loginFail();
  }
}
