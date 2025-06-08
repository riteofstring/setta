import axios from "axios";
import { C_ADDRESSES } from "utils/c_addresses";
import { RouteEnum } from "utils/generatedTypes";

type PostFunctionType = { address: RouteEnum; body: any };

export async function post({ address, body }: PostFunctionType) {
  return axios
    .post(`${C_ADDRESSES.BACKEND}${address}`, body, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .then((res) => res)
    .catch((res) => res);
}

export function pseudoTemplatedStr(inputStr: RouteEnum, replacements) {
  let output = inputStr;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{${key}\\}`, "g"); // Creates a global regex
    output = output.replace(regex, value);
  }
  return output;
}
