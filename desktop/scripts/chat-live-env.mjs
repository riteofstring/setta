import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export async function prepareLiveCodexEnv(repoRoot) {
  const openAIKey = await openAIKeyFromDotEnv(repoRoot);
  if (openAIKey === null) {
    return null;
  }
  const codexHome = await mkdtemp(join(tmpdir(), "setta-live-codex-home-"));
  await runCommand("codex", ["login", "--with-api-key"], {
    env: { ...process.env, CODEX_HOME: codexHome },
    input: openAIKey + "\n",
  });
  return {
    codexHome,
    env: {
      CODEX_HOME: codexHome,
      OPENAI_API_KEY: openAIKey,
    },
  };
}

async function openAIKeyFromDotEnv(repoRoot) {
  const dotEnvPath = join(repoRoot, ".env");
  if (!existsSync(dotEnvPath)) {
    return null;
  }
  const content = await readFile(dotEnvPath, "utf8");
  for (const line of content.split("\n")) {
    const parsed = parseDotEnvLine(line);
    if (parsed?.key === "OPENAI_API_KEY" && parsed.value !== "") {
      return parsed.value;
    }
  }
  return null;
}

function parseDotEnvLine(line) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) {
    return null;
  }
  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const separator = withoutExport.indexOf("=");
  if (separator === -1) {
    return null;
  }
  const key = withoutExport.slice(0, separator).trim();
  let value = withoutExport.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

async function runCommand(command, args, { env, input }) {
  const child = spawn(command, args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  if (input !== undefined) {
    child.stdin.end(input);
  }
  const code = await onceExit(child);
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr}`);
  }
}

function onceExit(child) {
  return new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
}
