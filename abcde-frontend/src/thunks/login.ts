import { dbLogin } from "dbRequests/authentication";
import { useAuth } from "models/auth";
import { useUserSettings } from "models/userSettings";

export async function login({ username, password }) {
  const res = await dbLogin({ username, password });
  if (res.status === 200) {
    useAuth.getState().loginSuccess(res.data.username);
    useUserSettings.setState({ darkMode: res.data.darkMode });
  } else {
    useAuth.getState().loginFail();
  }
}
