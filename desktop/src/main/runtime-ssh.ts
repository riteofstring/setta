import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AddExistingMachineSSHRuntimeRequest } from "@shared/types";
import {
  defaultExecFileRunner,
  type ExecFileRunner,
  runSettaCLI,
  settaCLIInvocation,
} from "./setta-cli";

const settaRemoteAddMaxBufferBytes = 10 * 1024 * 1024;

export interface RemoteSSHAddCLIResult {
  ok: boolean;
  pairingUrl: string;
  runtimeName: string;
  target: string;
  transcriptPath: string;
  transport: "tailscale";
}

export interface RuntimeSSHInstallerOptions {
  appDataDir: string;
  env: NodeJS.ProcessEnv;
  execFileRunner?: ExecFileRunner;
  repoRoot: string;
}

export async function runSettaRemoteAddSSH(
  request: AddExistingMachineSSHRuntimeRequest,
  options: RuntimeSSHInstallerOptions,
): Promise<RemoteSSHAddCLIResult> {
  const sshTarget = requiredTrimmed("SSH target", request.sshTarget);
  const authKey = requiredTrimmed("Tailscale auth key", request.tailscaleAuthKey);
  const tempDir = await mkdtemp(join(tmpdir(), "setta-ssh-runtime-"));
  const authKeyPath = join(tempDir, "tailscale-auth-key");
  try {
    await writeFile(authKeyPath, authKey + "\n", { mode: 0o600 });
    const invocation = settaCLIInvocation(options.repoRoot, options.env);
    const args = [
      ...invocation.args,
      "remote",
      "add",
      sshTarget,
      "--json",
      "--tailscale-auth-key-file",
      authKeyPath,
      "--setta-version",
      requiredTrimmed("Setta version", request.settaVersion),
      "--release-base-url",
      requiredTrimmed("Release base URL", request.releaseBaseUrl),
      "--installer-sha256",
      requiredTrimmed("Installer SHA-256", request.installerSha256),
      "--minisign-public-key",
      requiredTrimmed("Minisign public key", request.minisignPublicKey),
    ];
    const runtimeName = request.runtimeName?.trim();
    if (runtimeName) {
      args.push("--runtime-name", runtimeName);
    }
    const runner = options.execFileRunner ?? defaultExecFileRunner;
    const { stdout } = await runSettaCLI(
      runner,
      invocation,
      args,
      {
        ...options.env,
        SETTA_APP_DATA_DIR: options.appDataDir,
      },
      settaRemoteAddMaxBufferBytes,
    );
    return parseRemoteAddCLIResult(stdout);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function parseRemoteAddCLIResult(stdout: string): RemoteSSHAddCLIResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`setta remote add did not return valid JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  if (!isRecord(parsed) || parsed.ok !== true) {
    throw new Error("setta remote add returned an unsuccessful result");
  }
  const pairingUrl = readNonEmptyString(parsed.pairingUrl);
  const runtimeName = readNonEmptyString(parsed.runtimeName);
  const target = readNonEmptyString(parsed.target);
  const transcriptPath = readNonEmptyString(parsed.transcriptPath);
  if (
    !pairingUrl ||
    !runtimeName ||
    !target ||
    !transcriptPath ||
    parsed.transport !== "tailscale"
  ) {
    throw new Error("setta remote add returned an incomplete result");
  }
  return {
    ok: true,
    pairingUrl,
    runtimeName,
    target,
    transcriptPath,
    transport: "tailscale",
  };
}

function requiredTrimmed(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
