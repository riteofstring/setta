import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const openAIApiKeyName = "OPENAI_API_KEY";

export async function resolveLiveOpenAIApiKey({
  env = process.env,
  workflowModuleURL,
  rootEnvPath = rootEnvPathForWorkflowModule(workflowModuleURL),
} = {}) {
  const exported = resolveExportedCredential(env);
  if (exported) {
    return exported;
  }

  const parsedRootEnv = await parseRootEnvFile(rootEnvPath);
  if (parsedRootEnv.status === "blocked") {
    return parsedRootEnv;
  }

  return resolveRootEnvCredential(parsedRootEnv.values);
}

export function rootEnvPathForWorkflowModule(workflowModuleURL) {
  if (typeof workflowModuleURL !== "string" || workflowModuleURL === "") {
    throw new Error("workflowModuleURL is required to resolve the repository root .env");
  }
  return resolve(dirname(fileURLToPath(workflowModuleURL)), "../../..", ".env");
}

async function parseRootEnvFile(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return blockedCredential("OPENAI_API_KEY was absent from the task environment and root .env");
    }
    throw error;
  }

  try {
    return { status: "available", values: parseEnv(content) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return blockedCredential(`repository root .env could not be parsed: ${message}`);
  }
}

function resolveExportedCredential(env) {
  if (!Object.hasOwn(env, openAIApiKeyName)) {
    return null;
  }
  return credentialResolutionResult(
    credentialFromValue(env[openAIApiKeyName]),
    "environment",
    "task environment",
    "OPENAI_API_KEY was malformed in the task environment",
  );
}

function resolveRootEnvCredential(values) {
  const credential = Object.hasOwn(values, openAIApiKeyName)
    ? credentialFromValue(values[openAIApiKeyName])
    : { status: "missing" };
  return credentialResolutionResult(
    credential,
    "root-env",
    "repository root .env",
    "OPENAI_API_KEY was absent from the task environment and root .env",
  );
}

function credentialResolutionResult(credential, source, location, missingReason) {
  switch (credential.status) {
    case "available":
      return { apiKey: credential.apiKey, source };
    case "empty":
      return blockedCredential(`OPENAI_API_KEY was empty in the ${location}`);
    case "missing":
      return blockedCredential(missingReason);
    case "malformed":
      return blockedCredential(`OPENAI_API_KEY was malformed in the ${location}`);
  }
}

function credentialFromValue(value) {
  if (typeof value !== "string") {
    return { status: "missing" };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { status: "empty" };
  }
  if (!isPlausibleOpenAIApiKey(trimmed)) {
    return { status: "malformed" };
  }
  return { apiKey: trimmed, status: "available" };
}

function isPlausibleOpenAIApiKey(value) {
  return /^sk-[A-Za-z0-9_-]+$/.test(value);
}

function blockedCredential(reason) {
  return { reason, status: "blocked" };
}
