import { C_ADDRESSES } from "./c_addresses";

export type ResponseDataAndStatus<T> = {
  data: T | undefined;
  status: number | undefined;
  hasResponse: boolean;
};

export function res200<T>(
  res: ResponseDataAndStatus<T>,
): res is ResponseDataAndStatus<T> & { data: T; status: number } {
  return res.status === 200;
}

export function replaceAddressParams(
  address: string,
  addressParams?: Record<string, string | number | boolean>,
): string {
  if (!addressParams) return address;

  let output = address;
  for (const [key, value] of Object.entries(addressParams)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(regex, String(value));
  }
  return output;
}

export async function get<T>(
  address: string,
  addressParams?: Record<string, string | number | boolean>,
): Promise<ResponseDataAndStatus<T>> {
  const fullAddress = replaceAddressParams(address, addressParams);
  try {
    const response = await fetch(`${C_ADDRESSES.BACKEND}${fullAddress}`, {
      credentials: "include",
    });
    return {
      data: await response.json(),
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("GET error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}

export async function post<T>(
  address: string,
  body: unknown | null = null,
): Promise<ResponseDataAndStatus<T>> {
  try {
    const response = await fetch(`${C_ADDRESSES.BACKEND}${address}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: body === null ? null : JSON.stringify(body),
    });
    return {
      data: await response.json(),
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("POST error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}
