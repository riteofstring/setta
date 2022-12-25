import { BACKEND } from "abcde-utils/src/addresses";
import axios from "axios";

export async function post({
  address,
  body = {},
  thenFn = () => {},
  catchFn = () => {},
  withCredentials = false,
}) {
  return axios
    .post(`${BACKEND}${address}`, body, {
      headers: {
        "Content-Type": "application/json",
      },
      withCredentials,
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
