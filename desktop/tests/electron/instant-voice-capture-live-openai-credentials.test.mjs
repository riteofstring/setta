import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  resolveLiveOpenAIApiKey,
  rootEnvPathForWorkflowModule,
} from "./instant-voice-capture-live-openai-credentials.mjs";

test("exported OPENAI_API_KEY takes precedence over root .env", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=sk-rootfixture\n");

  const result = await resolveLiveOpenAIApiKey({
    env: { OPENAI_API_KEY: "sk-exportedfixture" },
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    apiKey: "sk-exportedfixture",
    source: "environment",
  });
});

test("resolves OPENAI_API_KEY from the repository root .env", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=sk-rootfixture\n");

  const result = await resolveLiveOpenAIApiKey({
    env: {},
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    apiKey: "sk-rootfixture",
    source: "root-env",
  });
});

test("root .env resolution is based on workflow module location", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=sk-rootfixture\n");

  assert.equal(rootEnvPathForWorkflowModule(fixture.workflowModuleURL), fixture.rootEnvPath);
});

test("ignores unrelated root .env values", async (t) => {
  const fixture = await createRepositoryFixture(
    t,
    `SETTA_E2E_OPENAI_SPEECH_BASE_URL=https://invalid.example
UNRELATED_SECRET=sk-unrelatedfixture
OPENAI_API_KEY=sk-rootfixture
`,
  );

  const result = await resolveLiveOpenAIApiKey({
    env: {},
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    apiKey: "sk-rootfixture",
    source: "root-env",
  });
  assert.equal(Object.hasOwn(result, "UNRELATED_SECRET"), false);
  assert.equal(Object.hasOwn(result, "SETTA_E2E_OPENAI_SPEECH_BASE_URL"), false);
});

test("blocks missing credentials", async (t) => {
  const fixture = await createRepositoryFixture(t, "UNRELATED=value\n");

  const result = await resolveLiveOpenAIApiKey({
    env: {},
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    reason: "OPENAI_API_KEY was absent from the task environment and root .env",
    status: "blocked",
  });
});

test("blocks empty exported credentials", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=sk-rootfixture\n");

  const result = await resolveLiveOpenAIApiKey({
    env: { OPENAI_API_KEY: "" },
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    reason: "OPENAI_API_KEY was empty in the task environment",
    status: "blocked",
  });
});

test("blocks malformed exported credentials", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=sk-rootfixture\n");

  const result = await resolveLiveOpenAIApiKey({
    env: { OPENAI_API_KEY: "not-an-openai-key" },
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    reason: "OPENAI_API_KEY was malformed in the task environment",
    status: "blocked",
  });
});

test("blocks empty root .env credentials", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=\n");

  const result = await resolveLiveOpenAIApiKey({
    env: {},
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    reason: "OPENAI_API_KEY was empty in the repository root .env",
    status: "blocked",
  });
});

test("blocks malformed credentials", async (t) => {
  const fixture = await createRepositoryFixture(t, "OPENAI_API_KEY=not-an-openai-key\n");

  const result = await resolveLiveOpenAIApiKey({
    env: {},
    workflowModuleURL: fixture.workflowModuleURL,
  });

  assert.deepEqual(result, {
    reason: "OPENAI_API_KEY was malformed in the repository root .env",
    status: "blocked",
  });
});

async function createRepositoryFixture(t, rootEnvContent) {
  const root = await mkdtemp(join(tmpdir(), "setta-live-openai-credentials-"));
  t.after(async () => {
    await rm(root, { force: true, recursive: true });
  });
  const rootEnvPath = join(root, ".env");
  await writeFile(rootEnvPath, rootEnvContent, "utf8");
  return {
    root,
    rootEnvPath,
    workflowModuleURL: pathToFileURL(
      join(root, "desktop", "tests", "electron", "fixture-workflow.test.mjs"),
    ).href,
  };
}
