import axios, { AxiosResponse } from "axios";
import { C } from "utils/constants";

export async function post<S, R>({
  address,
  body,
}: {
  address: string;
  body: S;
}) {
  return axios
    .post<S, AxiosResponse<R>>(`${C.BACKEND}${address}`, body, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((res) => res)
    .catch((res) => res);
}
