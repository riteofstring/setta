import { BACKEND } from "abcde-utils/src/addresses";
import axios, { AxiosResponse } from "axios";

export async function post<S, R>({
  address,
  body,
}: {
  address: string;
  body: S;
}) {
  return axios
    .post<S, AxiosResponse<R>>(`${BACKEND}${address}`, body, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((res) => res)
    .catch((res) => res);
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
