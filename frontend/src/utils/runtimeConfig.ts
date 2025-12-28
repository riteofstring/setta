type RuntimeConfig = {
  apiBaseUrl: string;
  token: string;
};

const CONFIG_ENDPOINT = "/__setta__/config";
const WEBSOCKET_PROTOCOL_PREFIX = "setta.token.";

let runtimeConfig: RuntimeConfig | null = null;
let runtimeConfigPromise: Promise<RuntimeConfig> | null = null;

function normalizeBaseUrl(url: string): string {
  let next = url.trim();
  while (next.endsWith("/")) {
    next = next.slice(0, -1);
  }
  return next;
}

function parseRuntimeConfig(payload: unknown): RuntimeConfig {
  if (!payload || typeof payload !== "object") {
    throw new Error("Runtime config response is invalid.");
  }
  const record = payload as Record<string, unknown>;
  const apiBaseUrl = record.apiBaseUrl;
  const token = record.token;
  if (typeof apiBaseUrl !== "string" || apiBaseUrl.trim() === "") {
    throw new Error("Runtime config apiBaseUrl is missing.");
  }
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("Runtime config token is missing.");
  }
  return {
    apiBaseUrl: normalizeBaseUrl(apiBaseUrl),
    token: token.trim(),
  };
}

export async function ensureRuntimeConfig(): Promise<RuntimeConfig> {
  if (runtimeConfig) {
    return runtimeConfig;
  }
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch(CONFIG_ENDPOINT, {
      method: "GET",
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Runtime config fetch failed with status ${response.status}.`,
        );
      }
      const payload = (await response.json()) as unknown;
      const parsed = parseRuntimeConfig(payload);
      runtimeConfig = parsed;
      return parsed;
    });
  }
  return runtimeConfigPromise;
}

function getRuntimeConfig(): RuntimeConfig {
  if (!runtimeConfig) {
    throw new Error("Runtime config has not been loaded.");
  }
  return runtimeConfig;
}

export function getWebsocketBaseUrl(): string {
  const apiBaseUrl = getRuntimeConfig().apiBaseUrl;
  if (apiBaseUrl.startsWith("https://")) {
    return `wss://${apiBaseUrl.slice("https://".length)}`;
  }
  if (apiBaseUrl.startsWith("http://")) {
    return `ws://${apiBaseUrl.slice("http://".length)}`;
  }
  throw new Error("Runtime config apiBaseUrl must start with http(s)://.");
}

export function getWebsocketAuthProtocol(): string {
  return `${WEBSOCKET_PROTOCOL_PREFIX}${getRuntimeConfig().token}`;
}
