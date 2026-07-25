import {
  decodeHostedAccessProgress,
  type EnsureHostedAccessIntent,
  type HostedAccessProgress,
} from "@generated/backend";
import { parseServerSentEvents } from "@shared/server-sent-events";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { Readable } from "node:stream";

const maximumResponseBytes = 64 * 1024;

export async function ensureHostedAccess(
  socketPath: string,
  intent: EnsureHostedAccessIntent,
): Promise<HostedAccessProgress> {
  const body = Buffer.from(JSON.stringify(intent));
  const response = await requestHostedAccess(
    socketPath,
    {
      headers: {
        "Content-Length": body.byteLength,
        "Content-Type": "application/json",
      },
      method: "POST",
      path: "/v1/hosted-access/ensure",
    },
    body,
  );
  requireResponse(response, "application/json");
  return decodeHostedAccessProgress(JSON.parse(await readBoundedResponse(response)));
}

export async function* streamHostedAccessProgress(
  socketPath: string,
  intentID: string,
  lastEventID = "",
): AsyncGenerator<HostedAccessProgress> {
  const headers: Record<string, string> = {};
  if (lastEventID !== "") {
    headers["Last-Event-ID"] = lastEventID;
  }
  const response = await requestHostedAccess(socketPath, {
    headers,
    method: "GET",
    path: `/v1/hosted-access/events?intentId=${encodeURIComponent(intentID)}`,
  });
  requireResponse(response, "text/event-stream");
  let cursor = parseCursor(lastEventID);
  const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
  for await (const message of parseServerSentEvents(body)) {
    if (message.event !== "hosted_access_progress") {
      throw new Error(`unsupported hosted access event ${JSON.stringify(message.event)}`);
    }
    const progress = decodeHostedAccessProgress(JSON.parse(message.data));
    const nextCursor = parseCursor(progress.cursor);
    if (message.id !== progress.cursor || nextCursor <= cursor) {
      throw new Error("hosted access progress cursor is invalid or out of order");
    }
    cursor = nextCursor;
    yield progress;
  }
}

function requestHostedAccess(
  socketPath: string,
  options: RequestOptions,
  body?: Buffer,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ ...options, socketPath }, resolve);
    request.on("error", reject);
    request.end(body);
  });
}

function requireResponse(response: IncomingMessage, contentType: string): void {
  if (response.statusCode !== 200) {
    response.destroy();
    throw new Error(`hosted access request returned HTTP ${response.statusCode ?? 0}`);
  }
  if (!response.headers["content-type"]?.startsWith(contentType)) {
    response.destroy();
    throw new Error(`hosted access request returned an invalid ${contentType} response`);
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
      throw new Error("hosted access response exceeded its size limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseCursor(cursor: string): number {
  if (cursor === "") {
    return 0;
  }
  if (!/^[1-9][0-9]*$/.test(cursor)) {
    throw new Error("hosted access cursor must be a positive integer");
  }
  return Number(cursor);
}
