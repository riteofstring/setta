import { C_ADDRESSES } from "./c_addresses";

export async function get(address: string) {
  try {
    const response = await fetch(`${C_ADDRESSES.BACKEND}${address}`);
    return await response.json();
  } catch (error) {
    console.error("Error:", error);
  }
}

export async function post(address: string, body: any) {
  try {
    const response = await fetch(`${C_ADDRESSES.BACKEND}${address}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return response.json();
  } catch (error) {
    console.error("Error:", error);
  }
}
