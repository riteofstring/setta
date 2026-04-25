import type { ResponseDataAndStatus } from "../../plugin-sdk/app-subsystem/src/requestTransport";
import { buildShareSessionHeaders } from "./shareSessionHeaders";
import { buildBackendURL } from "./transportUrlCore";

type AddressParams = Record<
  string,
  string | number | boolean | null | undefined
>;

async function parseResponse<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const isJson =
    contentType.includes("application/json") || contentType.includes("+json");
  if (isJson) {
    return (await response.json()) as T;
  }
  const isText =
    contentType.startsWith("text/") || contentType.includes("charset=");
  if (!contentType || isText) {
    return (await response.text()) as T;
  }
  return new Uint8Array(await response.arrayBuffer()) as T;
}

export async function post<T>(
  address: string,
  body: unknown | null = null,
  addressParams?: AddressParams,
): Promise<ResponseDataAndStatus<T>> {
  try {
    const shareHeaders = buildShareSessionHeaders();
    const isFormData = body instanceof FormData;
    let requestBody: BodyInit | null = null;
    if (body !== null) {
      requestBody = isFormData ? body : JSON.stringify(body);
    }
    const response = await fetch(buildBackendURL(address, addressParams), {
      method: "POST",
      credentials: "include",
      headers: isFormData
        ? shareHeaders
        : {
            "Content-Type": "application/json",
            ...shareHeaders,
          },
      body: requestBody,
    });
    return {
      data: await parseResponse<T>(response),
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("POST error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}
