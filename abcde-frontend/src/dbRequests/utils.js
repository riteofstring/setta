import axios from "axios";
import { useAuth } from "models/auth";
import { BACKEND } from "utils/constants";

export async function post({
  address,
  body = null,
  thenFn = () => {},
  catchFn = () => {},
}) {
  const access_token = useAuth.getState().access_token;
  return axios
    .post(BACKEND + address, body, tokenConfig(access_token))
    .then(thenFn)
    .catch(catchFn);
}

function tokenConfig(access_token) {
  // Headers
  const config = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  // If token, add to headers config
  if (access_token) {
    config.headers["Authorization"] = `Bearer ${access_token}`;
  }

  return config;
}
