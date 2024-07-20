import axios, { AxiosResponse } from "axios";
import { BACKEND } from "z_utils/addresses";

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
