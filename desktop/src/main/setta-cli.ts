import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultSettaCLIMaxBufferBytes = 10 * 1024 * 1024;

export interface SettaCLIInvocation {
  args: string[];
  command: string;
  cwd: string;
}

export type ExecFileRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    maxBuffer: number;
  },
) => Promise<{ stderr: string; stdout: string }>;

export function settaCLIInvocation(repoRoot: string, env: NodeJS.ProcessEnv): SettaCLIInvocation {
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

export async function runSettaCLI(
  runner: ExecFileRunner,
  invocation: SettaCLIInvocation,
  args: string[],
  env: NodeJS.ProcessEnv,
  maxBuffer = defaultSettaCLIMaxBufferBytes,
): Promise<{ stderr: string; stdout: string }> {
  try {
    return await runner(invocation.command, args, {
      cwd: invocation.cwd,
      env,
      maxBuffer,
    });
  } catch (error) {
    throw new Error(settaCLIErrorMessage(error), { cause: error });
  }
}

export async function defaultExecFileRunner(
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
