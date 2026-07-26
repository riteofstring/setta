import { ensureHostedAccess, streamHostedAccessProgress } from "../src/main/hosted-access-client";
import type { EnsureHostedAccessIntent, HostedAccessProgress } from "../src/generated/backend";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("hosted access typed client production fixture", () => {
  it("reaches ready on phone without provider-facing client fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "setta-hosted-access-e2e-"));
    let server: ChildProcess | undefined;
    try {
      const binary = join(root, "bin", "setta-control-plane");
      await mkdir(dirname(binary), { mode: 0o700, recursive: true });
      await stage(
        "build control-plane fixture",
        execute(join(repositoryRoot, "scripts/go.sh"), [
          "build",
          "-o",
          binary,
          "./cmd/setta-control-plane",
        ]),
      );
      const dataDirectory = join(root, "data");
      const secretDirectory = join(root, "secrets");
      server = spawn(binary, ["serve", "--host", "127.0.0.1", "--port", "0"], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          SETTA_CONTROL_PLANE_DATA_DIR: dataDirectory,
          SETTA_CONTROL_PLANE_SECRET_DIR: secretDirectory,
          SPRITE_TOKEN: "deterministic-fixture-token",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      await stage("start control-plane fixture", waitForReady(server));

      const credential = {
        device_id: `device_${randomBytes(16).toString("base64url")}`,
        token: randomBytes(32).toString("base64url"),
      };
      const intent = {
        idempotencyKey: "typed-production-intent",
        userId: "typed-production-user",
        projectId: "typed-production-project",
        workstreamId: "typed-production-workstream",
        client: { deviceId: credential.device_id, kind: "phone" },
        requestedCapabilities: ["observe", "steer", "approve", "artifacts"],
      } as const satisfies EnsureHostedAccessIntent;
      const socketPath = join(dataDirectory, "admin.sock");
      const preparing = await stage(
        "submit hosted access intent",
        ensureHostedAccess(socketPath, intent),
      );
      expect(preparing.state).toBe("preparing_access");
      const progressPromise = collectProgress(socketPath, intent.idempotencyKey);

      const runtimeCredentialFile = join(root, "input", "runtime-credential");
      await mkdir(dirname(runtimeCredentialFile), { mode: 0o700, recursive: true });
      await writeFile(runtimeCredentialFile, "fixture-inner-runtime-credential", { mode: 0o600 });
      await chmod(runtimeCredentialFile, 0o600);
      const runtimeName = `setta-u-${createHash("sha256").update(intent.userId).digest("hex").slice(0, 32)}`;
      await stage(
        "bootstrap hosted access",
        execute(
          binary,
          [
            "bootstrap",
            "--client-credential-file",
            join(root, "client-credential.json"),
            "--client-credential-stdin",
            "--cpu-core-millionths",
            "1000000",
            "--data-dir",
            dataDirectory,
            "--device-name",
            "Typed fixture phone",
            "--hosted-access-intent-id",
            intent.idempotencyKey,
            "--idempotency-key",
            "typed-production-bootstrap",
            "--memory-bytes",
            "536870912",
            "--project-id",
            intent.projectId,
            "--runtime-credential-file",
            runtimeCredentialFile,
            "--runtime-name",
            runtimeName,
            "--runtime-release",
            "typed-production-release",
            "--runtime-secret-ref",
            "typed_production_runtime",
            "--secret-dir",
            secretDirectory,
            "--storage-bytes",
            "10737418240",
            "--user-id",
            intent.userId,
            "--workstream-id",
            intent.workstreamId,
          ],
          JSON.stringify(credential),
        ),
      );

      const progress = await stage("receive ready-on-phone progress", progressPromise);
      expect(progress.map((event) => event.state)).toEqual([
        "preparing_access",
        "syncing_project",
        "ready_on_phone",
      ]);
      expect(progress.at(-1)?.accessGrant).toMatchObject({
        deviceId: intent.client.deviceId,
        projectId: intent.projectId,
        workstreamId: intent.workstreamId,
      });
      expect(JSON.stringify({ intent, progress })).not.toMatch(
        /provider|sprite|runtime|region|machine|endpoint|pairing|wake/i,
      );
    } finally {
      await stage("stop control-plane fixture", stop(server));
      await stage("trash control-plane fixture", execute("/usr/bin/trash", [root]));
    }
  }, 60_000);
});

async function collectProgress(
  socketPath: string,
  intentID: string,
): Promise<HostedAccessProgress[]> {
  const progress: HostedAccessProgress[] = [];
  for await (const event of streamHostedAccessProgress(socketPath, intentID)) {
    progress.push(event);
  }
  return progress;
}

async function waitForReady(process: ChildProcess): Promise<void> {
  const stdout = process.stdout;
  if (!stdout) {
    throw new Error("control-plane fixture has no stdout");
  }
  let buffered = "";
  for await (const chunk of stdout.iterator({ destroyOnReturn: false })) {
    buffered += chunk.toString();
    const newline = buffered.indexOf("\n");
    if (newline === -1) {
      continue;
    }
    const event = JSON.parse(buffered.slice(0, newline)) as { event?: unknown };
    if (event.event !== "control_plane_ready") {
      throw new Error("control-plane fixture returned an invalid ready event");
    }
    return;
  }
  throw new Error("control-plane fixture exited before ready");
}

function execute(file: string, args: string[], stdin = ""): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: repositoryRoot }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    child.stdin?.end(stdin);
  });
}

async function stop(process: ChildProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  const exited = once(process, "exit");
  process.kill("SIGTERM");
  await exited;
}

function stage<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, 15_000);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
