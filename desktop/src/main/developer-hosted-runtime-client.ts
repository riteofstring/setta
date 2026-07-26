import {
  decodeDeveloperHostedRuntimeStatus,
  type DestroyDeveloperHostedRuntimeRequest,
  type DeveloperHostedRuntimeStatus,
  type EnsureDeveloperHostedRuntimeRequest,
} from "@generated/backend";
import { parseServerSentEvents } from "@shared/server-sent-events";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { Readable } from "node:stream";
import type { RuntimeAccessCredential } from "./desktop-credential-store";
import type {
  ControlPlaneRuntimeCredentialClient,
  RefreshRuntimeCredentialRequest,
} from "./runtime-credential-manager";

const maximumResponseBytes = 64 * 1024;
const endpointPrefix = "/v1/developer-hosted-runtime";

export interface DeveloperHostedRuntimeBootstrap {
  baseUrl: string;
  deviceId: string;
  deviceSecret: string;
  expiresAt: string;
  protocolVersion: number;
  runtimeId: string;
  token: string;
  userId: string;
}

export async function readDeveloperHostedRuntimeStatus(
  socketPath: string,
): Promise<DeveloperHostedRuntimeStatus | null> {
  const response = await requestDeveloperHostedRuntime(socketPath, {
    method: "GET",
    path: `${endpointPrefix}/status`,
  });
  if (response.statusCode === 204) {
    response.resume();
    return null;
  }
  requireResponse(response, "application/json");
  return decodeDeveloperHostedRuntimeStatus(JSON.parse(await readBoundedResponse(response)));
}

export function ensureDeveloperHostedRuntime(
  socketPath: string,
  request: EnsureDeveloperHostedRuntimeRequest,
): Promise<DeveloperHostedRuntimeStatus> {
  return postStatus(socketPath, `${endpointPrefix}/ensure`, request);
}

export function destroyDeveloperHostedRuntime(
  socketPath: string,
  request: DestroyDeveloperHostedRuntimeRequest,
): Promise<DeveloperHostedRuntimeStatus> {
  return postStatus(socketPath, `${endpointPrefix}/destroy`, request);
}

export async function readDeveloperHostedRuntimeBootstrap(
  socketPath: string,
): Promise<DeveloperHostedRuntimeBootstrap> {
  const response = await requestDeveloperHostedRuntime(socketPath, {
    method: "GET",
    path: `${endpointPrefix}/bootstrap`,
  });
  requireResponse(response, "application/json");
  return decodeBootstrap(JSON.parse(await readBoundedResponse(response)));
}

export function confirmDeveloperHostedRuntimeConnected(
  socketPath: string,
  runtimeRegistryId: string,
): Promise<DeveloperHostedRuntimeStatus> {
  return postStatus(socketPath, `${endpointPrefix}/connected`, { runtimeRegistryId });
}

export class DeveloperHostedRuntimeCredentialClient implements ControlPlaneRuntimeCredentialClient {
  constructor(
    private readonly enabled: () => boolean,
    private readonly socketPath: () => string,
  ) {}

  async refreshRuntimeCredential(
    request: RefreshRuntimeCredentialRequest,
  ): Promise<RuntimeAccessCredential> {
    if (!this.enabled() || !request.managedHosted) {
      throw new Error("control-plane runtime credential refresh is unavailable");
    }
    const response = await postJSON(this.socketPath(), `${endpointPrefix}/credential`, {
      deviceId: request.deviceIdentity.deviceId,
      deviceSecret: request.deviceIdentity.secret,
      runtimeId: request.runtimeId,
    });
    const record = requireRecord(response, "DeveloperHostedRuntimeCredential");
    const expected = ["deviceId", "expiresAt", "runtimeId", "token"];
    for (const key of Object.keys(record)) {
      if (!expected.includes(key)) {
        throw new Error(`DeveloperHostedRuntimeCredential contains unknown field ${key}`);
      }
    }
    return {
      deviceId: requireString(record, "deviceId"),
      expiresAt: requireString(record, "expiresAt"),
      runtimeId: requireString(record, "runtimeId"),
      token: requireString(record, "token"),
    };
  }
}

export async function finalizeDeveloperHostedRuntimeRemoval(socketPath: string): Promise<void> {
  const response = await requestDeveloperHostedRuntime(
    socketPath,
    {
      headers: { "Content-Length": "2", "Content-Type": "application/json" },
      method: "POST",
      path: `${endpointPrefix}/finalize-removal`,
    },
    Buffer.from("{}"),
  );
  requireResponse(response, "application/json");
  await readBoundedResponse(response);
}

export async function* streamDeveloperHostedRuntimeStatus(
  socketPath: string,
  operationId: string,
  lastEventId = "",
  signal?: AbortSignal,
): AsyncGenerator<DeveloperHostedRuntimeStatus> {
  const headers: Record<string, string> = {};
  if (lastEventId !== "") {
    headers["Last-Event-ID"] = lastEventId;
  }
  const response = await requestDeveloperHostedRuntime(
    socketPath,
    {
      headers,
      method: "GET",
      path: `${endpointPrefix}/events?operationId=${encodeURIComponent(operationId)}`,
    },
    undefined,
    signal,
  );
  requireResponse(response, "text/event-stream");
  let cursor = parseCursor(lastEventId);
  const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
  for await (const message of parseServerSentEvents(body)) {
    if (message.event !== "developer_hosted_runtime_status") {
      throw new Error(
        `unsupported developer hosted runtime event ${JSON.stringify(message.event)}`,
      );
    }
    const status = decodeDeveloperHostedRuntimeStatus(JSON.parse(message.data));
    const nextCursor = parseCursor(status.cursor);
    if (message.id !== status.cursor || nextCursor <= cursor) {
      throw new Error("developer hosted runtime cursor is invalid or out of order");
    }
    cursor = nextCursor;
    yield status;
  }
}

async function postStatus(
  socketPath: string,
  path: string,
  payload: unknown,
): Promise<DeveloperHostedRuntimeStatus> {
  const body = Buffer.from(JSON.stringify(payload));
  const response = await requestDeveloperHostedRuntime(
    socketPath,
    {
      headers: {
        "Content-Length": String(body.byteLength),
        "Content-Type": "application/json",
      },
      method: "POST",
      path,
    },
    body,
  );
  requireResponse(response, "application/json");
  return decodeDeveloperHostedRuntimeStatus(JSON.parse(await readBoundedResponse(response)));
}

async function postJSON(socketPath: string, path: string, payload: unknown): Promise<unknown> {
  const body = Buffer.from(JSON.stringify(payload));
  const response = await requestDeveloperHostedRuntime(
    socketPath,
    {
      headers: {
        "Content-Length": String(body.byteLength),
        "Content-Type": "application/json",
      },
      method: "POST",
      path,
    },
    body,
  );
  requireResponse(response, "application/json");
  return JSON.parse(await readBoundedResponse(response));
}

function requestDeveloperHostedRuntime(
  socketPath: string,
  options: RequestOptions,
  body?: Buffer,
  signal?: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ ...options, signal, socketPath }, resolve);
    request.on("error", reject);
    request.end(body);
  });
}

function requireResponse(response: IncomingMessage, contentType: string): void {
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error(`developer hosted runtime request returned HTTP ${response.statusCode ?? 0}`);
  }
  if (!response.headers["content-type"]?.startsWith(contentType)) {
    response.destroy();
    throw new Error(`developer hosted runtime returned invalid ${contentType}`);
  }
}

async function readBoundedResponse(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > maximumResponseBytes) {
      response.destroy();
      throw new Error("developer hosted runtime response exceeded its size limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function decodeBootstrap(value: unknown): DeveloperHostedRuntimeBootstrap {
  const record = requireRecord(value, "DeveloperHostedRuntimeBootstrap");
  const expected = [
    "baseUrl",
    "deviceId",
    "deviceSecret",
    "expiresAt",
    "protocolVersion",
    "runtimeId",
    "token",
    "userId",
  ];
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      throw new Error(`DeveloperHostedRuntimeBootstrap contains unknown field ${key}`);
    }
  }
  return {
    baseUrl: requireString(record, "baseUrl"),
    deviceId: requireString(record, "deviceId"),
    deviceSecret: requireString(record, "deviceSecret"),
    expiresAt: requireString(record, "expiresAt"),
    protocolVersion: requirePositiveInteger(record, "protocolVersion"),
    runtimeId: requireString(record, "runtimeId"),
    token: requireString(record, "token"),
    userId: requireString(record, "userId"),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`DeveloperHostedRuntimeBootstrap.${field} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`DeveloperHostedRuntimeBootstrap.${field} must be a positive integer`);
  }
  return Number(value);
}

function parseCursor(cursor: string): number {
  if (cursor === "") {
    return 0;
  }
  if (!/^[1-9][0-9]*$/.test(cursor)) {
    throw new Error("developer hosted runtime cursor must be a positive integer");
  }
  return Number(cursor);
}
