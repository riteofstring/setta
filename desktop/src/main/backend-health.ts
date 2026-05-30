import type { BackendHealth } from "@generated/backend";

export async function fetchBackendHealth(baseURL: string): Promise<BackendHealth> {
  const response = await fetch(new URL("/health", baseURL));
  if (!response.ok) {
    throw new Error(`backend health failed with HTTP ${response.status}`);
  }
  return parseBackendHealth(await response.json());
}

function parseBackendHealth(value: unknown): BackendHealth {
  if (!isRecord(value)) {
    throw new Error("backend health response must be an object");
  }
  if (value.ok !== true) {
    throw new Error("backend health response ok must be true");
  }
  if (typeof value.name !== "string") {
    throw new Error("backend health response name must be a string");
  }
  if (typeof value.version !== "string") {
    throw new Error("backend health response version must be a string");
  }
  return {
    ok: value.ok,
    name: value.name,
    version: value.version,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
