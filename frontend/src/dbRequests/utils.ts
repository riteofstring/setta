import axios, { AxiosResponse } from "axios";
import { COMMON_CONSTS } from "utils/constants";

export async function post<S, R>({
  address,
  body,
}: {
  address: string;
  body: S;
}) {
  return axios
    .post<S, AxiosResponse<R>>(`${COMMON_CONSTS.backend}${address}`, body, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((res) => res)
    .catch((res) => res);
}
