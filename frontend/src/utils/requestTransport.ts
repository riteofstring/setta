import { buildShareSessionHeaders } from "./shareSessionHeaders";
import { buildBackendURL } from "./transportUrlCore";

type AddressParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type ResponseDataAndStatus<T> = {
  data: T | undefined;
  status: number | undefined;
  hasResponse: boolean;
};

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

async function parseBinaryResponse(
  response: Response,
): Promise<unknown | undefined> {
  if (response.status === 204) {
    return undefined;
  }
  if (response.ok) {
    return new Uint8Array(await response.arrayBuffer());
  }
  return await parseResponse<unknown>(response);
}

export async function get<T>(
  address: string,
  addressParams?: AddressParams,
): Promise<ResponseDataAndStatus<T>> {
  try {
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(buildBackendURL(address, addressParams), {
      credentials: "include",
      headers: shareHeaders,
    });
    return {
      data: await parseResponse<T>(response),
      status: response.status,
      hasResponse: true,
    };
  } catch (error) {
    console.error("GET error:", error);
    return { data: undefined, status: undefined, hasResponse: false };
  }
}

export async function getBinary(
  address: string,
  addressParams?: AddressParams,
): Promise<ResponseDataAndStatus<Uint8Array>> {
  try {
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(buildBackendURL(address, addressParams), {
      credentials: "include",
      headers: shareHeaders,
    });
    const parsed = await parseBinaryResponse(response);
    return {
      data: parsed as Uint8Array | undefined,
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
