import axios from "axios";
import { C_ADDRESSES } from "utils/c_addresses";
import { RouteEnum } from "utils/generatedTypes";

type PostFunctionType = {
  address: RouteEnum;
  addressParams?: Record<string, any>;
  body: any;
};

export function replaceAddressParams(
  address: RouteEnum,
  addressParams?: Record<string, any>,
): string {
  if (!addressParams) return address;

  let output: string = address;
  for (const [key, value] of Object.entries(addressParams)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(regex, String(value));
  }
  return output;
}

export async function post({ address, addressParams, body }: PostFunctionType) {
  const finalAddress = replaceAddressParams(address, addressParams);
  return axios
    .post(`${C_ADDRESSES.BACKEND}${finalAddress}`, body, {
      headers: {
        "Content-Type": "application/json",
      },
    })
    .catch((res) => res);
}
