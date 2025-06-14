import { C_ADDRESSES } from "./c_addresses";

export function replaceAddressParams(
  address: string,
  addressParams?: Record<string, any>,
): string {
  if (!addressParams) return address;

  let output = address;
  for (const [key, value] of Object.entries(addressParams)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(regex, String(value));
  }
  return output;
}

export async function get(
  address: string,
  addressParams?: Record<string, any>,
) {
  const fullAddress = replaceAddressParams(address, addressParams);
  try {
    const response = await fetch(`${C_ADDRESSES.BACKEND}${fullAddress}`);
    return await response.json();
  } catch (error) {
    console.error("Error:", error);
  }
}

export async function post(address: string, body: any = null) {
  try {
    const response = await fetch(`${C_ADDRESSES.BACKEND}${address}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body === null ? null : JSON.stringify(body),
    });
    return response.json();
  } catch (error) {
    console.error("Error:", error);
  }
}
