import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { AddExistingMachineSSHRuntimeRequest } from "@shared/types";

const execFileAsync = promisify(execFile);
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

interface SettaCLIInvocation {
  args: string[];
  command: string;
  cwd: string;
}

type ExecFileRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    maxBuffer: number;
  },
) => Promise<{ stderr: string; stdout: string }>;

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
    const { stdout } = await runSettaCLI(runner, invocation, args, {
      ...options.env,
      SETTA_APP_DATA_DIR: options.appDataDir,
    });
    return parseRemoteAddCLIResult(stdout);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function settaCLIInvocation(repoRoot: string, env: NodeJS.ProcessEnv): SettaCLIInvocation {
  const explicitPath = env.SETTA_CLI_PATH?.trim();
  if (explicitPath) {
    return {
      args: [],
      command: explicitPath,
      cwd: repoRoot,
    };
  }
  return {
    args: ["run", "./cmd/setta"],
    command: join(repoRoot, "scripts", "go.sh"),
    cwd: repoRoot,
  };
}

async function runSettaCLI(
  runner: ExecFileRunner,
  invocation: SettaCLIInvocation,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stderr: string; stdout: string }> {
  try {
    return await runner(invocation.command, args, {
      cwd: invocation.cwd,
      env,
      maxBuffer: settaRemoteAddMaxBufferBytes,
    });
  } catch (error) {
    throw new Error(settaCLIErrorMessage(error), { cause: error });
  }
}

async function defaultExecFileRunner(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    maxBuffer: number;
  },
): Promise<{ stderr: string; stdout: string }> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
    maxBuffer: options.maxBuffer,
  });
  return {
    stderr: result.stderr,
    stdout: result.stdout,
  };
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

function settaCLIErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const stderr = readNonEmptyString(error.stderr);
    if (stderr) {
      return stderr.trim();
    }
    const message = readNonEmptyString(error.message);
    if (message) {
      return message;
    }
  }
  return errorMessage(error);
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
