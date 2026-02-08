import { useShareSession } from "state/definitions";
import { C_ADDRESSES } from "./c_addresses";
import { RouteEnum } from "./generatedTypes";

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

export function getErrorDetail(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const detail = record.detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return null;
}

function resolveBackendUrl(address: string): string {
  if (address.startsWith(RouteEnum.BOOTSTRAP_PAGE)) {
    return `${C_ADDRESSES.BACKEND_ORIGIN}${address}`;
  }
  if (address === RouteEnum.LAUNCH) {
    return `${C_ADDRESSES.LAUNCHER}${address}`;
  }
  return `${C_ADDRESSES.BACKEND}${address}`;
}

function buildShareSessionHeaders(): Record<string, string> {
  const shareSession = useShareSession.getState();
  if (!shareSession.isShareMode || !shareSession.shareSessionId) {
    return {};
  }
  return { "X-Share-Session-Id": shareSession.shareSessionId };
}

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
  return (await response.text()) as T;
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
    const shareHeaders = buildShareSessionHeaders();
    const response = await fetch(resolveBackendUrl(fullAddress), {
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

export async function post<T>(
  address: string,
  body: unknown | null = null,
  addressParams?: Record<string, string | number | boolean>,
): Promise<ResponseDataAndStatus<T>> {
  const fullAddress = replaceAddressParams(address, addressParams);
  try {
    const shareHeaders = buildShareSessionHeaders();
    const isFormData = body instanceof FormData;
    let requestBody: BodyInit | null = null;
    if (body !== null) {
      requestBody = isFormData ? body : JSON.stringify(body);
    }
    const response = await fetch(resolveBackendUrl(fullAddress), {
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
