import { dbLogin } from "dbRequests/authentication";
import { useAuth } from "models/auth";
import { useUserSettings } from "models/userSettings";

export async function login({ username, password }) {
  try {
    const res = await dbLogin({ username, password });
    useAuth.getState().loginSuccess(res.data.username);
    useUserSettings.setState(res.data.settings);
  } catch (error) {
    useAuth.getState().loginFail();
  }
}
