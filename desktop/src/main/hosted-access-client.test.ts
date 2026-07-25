import { ensureHostedAccess, streamHostedAccessProgress } from "./hosted-access-client";
import type { EnsureHostedAccessIntent, HostedAccessProgress } from "@generated/backend";
import { mkdtemp, rmdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const intent = {
  idempotencyKey: "typed-intent",
  userId: "typed-user",
  projectId: "typed-project",
  workstreamId: "typed-workstream",
  client: { deviceId: "typed-device", kind: "phone" },
  requestedCapabilities: ["observe", "steer", "approve", "artifacts"],
} as const satisfies EnsureHostedAccessIntent;

const preparing = progress("1", "preparing_access");
const syncing = progress("2", "syncing_project");
const ready = {
  ...progress("3", "ready_on_phone"),
  accessGrant: {
    deviceId: intent.client.deviceId,
    projectId: intent.projectId,
    workstreamId: intent.workstreamId,
    grantedCapabilities: [...intent.requestedCapabilities],
    expiresAt: "2026-07-25T18:00:00Z",
  },
} as const satisfies HostedAccessProgress;

describe("hosted access client", () => {
  let fixture: Awaited<ReturnType<typeof startFixture>> | undefined;

  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
  });

  it("submits a provider-neutral intent and streams ready-on-phone progress", async () => {
    fixture = await startFixture();
    await expect(ensureHostedAccess(fixture.socketPath, intent)).resolves.toEqual(preparing);

    const received: HostedAccessProgress[] = [];
    for await (const event of streamHostedAccessProgress(
      fixture.socketPath,
      intent.idempotencyKey,
    )) {
      received.push(event);
    }
    expect(received).toEqual([preparing, syncing, ready]);
    expect(JSON.stringify({ intent, received })).not.toMatch(
      /provider|sprite|runtime|region|machine|endpoint|pairing|wake/i,
    );
  });

  it("resumes after the last accepted cursor and rejects mismatched SSE ids", async () => {
    fixture = await startFixture({ eventID: "different" });
    const stream = streamHostedAccessProgress(fixture.socketPath, intent.idempotencyKey, "2");
    await expect(stream.next()).rejects.toThrow("cursor is invalid or out of order");
  });
});

function progress(cursor: string, state: HostedAccessProgress["state"]): HostedAccessProgress {
  return {
    accessGrant: null,
    cursor,
    intentId: intent.idempotencyKey,
    occurredAt: "2026-07-24T18:00:00Z",
    reasonCode: "",
    retryable: false,
    state,
  };
}

async function startFixture(options: { eventID?: string } = {}): Promise<{
  close: () => Promise<void>;
  socketPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "setta-hosted-client-"));
  const socketPath = join(directory, "admin.sock");
  const server = createServer((request, response) => {
    if (request.url === "/v1/hosted-access/ensure") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(preparing));
      return;
    }
    response.setHeader("Content-Type", "text/event-stream");
    const events = request.headers["last-event-id"] === "2" ? [ready] : [preparing, syncing, ready];
    for (const event of events) {
      response.write(
        `id: ${options.eventID ?? event.cursor}\nevent: hosted_access_progress\ndata: ${JSON.stringify(event)}\n\n`,
      );
    }
    response.end();
  });
  await listen(server, socketPath);
  return {
    socketPath,
    close: async () => {
      await close(server);
      await rmdir(directory);
    },
  };
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
