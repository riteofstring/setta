import axios from "axios";
import { BACKEND } from "utils/constants";

export async function post({
  address,
  body = {},
  thenFn = () => {},
  catchFn = () => {},
  withCredentials = false,
  auth = null,
}) {
  return axios
    .post(BACKEND + address, body, {
      headers: {
        "Content-Type": "application/json",
      },
      withCredentials,
      auth,
    })
    .then(thenFn)
    .catch(catchFn);
}

// function tokenConfig(access_token) {
//   // Headers
//   const config = {
//     headers: {
//       "Content-Type": "application/json",
//     },
//   };

//   // If token, add to headers config
//   if (access_token) {
//     config.headers["Authorization"] = `Bearer ${access_token}`;
//   }

//   return config;
// }
