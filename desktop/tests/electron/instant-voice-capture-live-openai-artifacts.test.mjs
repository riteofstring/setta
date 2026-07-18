import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  finalizeLiveOpenAIArtifacts,
  liveOpenAIArtifactPrivacyViolationCode,
} from "./instant-voice-capture-live-openai-artifacts.mjs";

test("detects a marker written during artifact finalization and removes the artifact tree", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const marker = "sk-finalizedteardownmarker";
  await writeFile(join(artifactDir, "summary.json"), '{"status":"passed"}\n', "utf8");

  await assert.rejects(
    finalizeLiveOpenAIArtifacts({
      artifactDir,
      finalizers: [
        async () => {
          await writeFile(join(artifactDir, "electron-output.log"), `shutdown ${marker}\n`, "utf8");
        },
      ],
      markers: [marker],
    }),
    (error) => {
      assert.equal(error.code, liveOpenAIArtifactPrivacyViolationCode);
      assert.equal(error.message.includes(marker), false);
      assert.equal(error.message.includes("contaminated artifacts were removed"), true);
      return true;
    },
  );
  await assert.rejects(readFile(join(artifactDir, "summary.json"), "utf8"), {
    code: "ENOENT",
  });
});

test("scans failed workflow artifacts and redacts the original failure on privacy violation", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const marker = "ek-finalizedfailuremarker";
  const originalFailure = new Error(`provider failed after issuing ${marker}`);
  await writeFile(join(artifactDir, "summary.json"), '{"status":"failed"}\n', "utf8");

  await assert.rejects(
    finalizeLiveOpenAIArtifacts({
      artifactDir,
      finalizers: [
        async () => {
          await writeFile(join(artifactDir, "failure.log"), `failure artifact ${marker}\n`, "utf8");
        },
      ],
      markers: [marker],
      workflowError: originalFailure,
    }),
    (error) => {
      assert.equal(error.code, liveOpenAIArtifactPrivacyViolationCode);
      assert.equal(error.message.includes(marker), false);
      assert.equal(
        error.originalWorkflowFailure,
        "provider failed after issuing [REDACTED_SECRET]",
      );
      return true;
    },
  );
  await assert.rejects(readFile(join(artifactDir, "failure.log"), "utf8"), {
    code: "ENOENT",
  });
});

test("keeps clean finalized artifacts available", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const marker = "sk-cleanfinalizedmarker";
  await writeFile(join(artifactDir, "summary.json"), '{"status":"passed"}\n', "utf8");

  const scan = await finalizeLiveOpenAIArtifacts({
    artifactDir,
    finalizers: [
      async () => {
        await writeFile(join(artifactDir, "electron-output.log"), "clean shutdown\n", "utf8");
      },
    ],
    markers: [marker],
  });

  assert.equal(scan.leakedFileCount, 0);
  assert.equal(await readFile(join(artifactDir, "summary.json"), "utf8"), '{"status":"passed"}\n');
  assert.equal(
    await readFile(join(artifactDir, "electron-output.log"), "utf8"),
    "clean shutdown\n",
  );
});

async function createArtifactFixture(t) {
  const artifactDir = await mkdtemp(join(tmpdir(), "setta-live-openai-artifacts-"));
  t.after(async () => {
    await rm(artifactDir, { force: true, recursive: true });
  });
  return artifactDir;
}
