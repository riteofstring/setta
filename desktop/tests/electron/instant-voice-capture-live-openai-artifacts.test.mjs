import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  finalizeLiveOpenAIArtifacts,
  liveOpenAIArtifactPrivacyViolationCode,
  scanArtifactsForMarkers,
} from "./instant-voice-capture-live-openai-artifacts.mjs";

test("scans nested finalized artifact bytes for long-lived and ephemeral markers", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const longLivedMarker = "sk-artifactboundarylonglived";
  const ephemeralMarker = "ek-artifactboundaryephemeral";
  await mkdir(join(artifactDir, "nested"), { recursive: true });
  await writeFile(join(artifactDir, "nested", "renderer-events.jsonl"), `${longLivedMarker}\n`);
  await writeFile(
    join(artifactDir, "backend-http.bin"),
    Buffer.concat([Buffer.from([0x00, 0xff]), Buffer.from(ephemeralMarker)]),
  );

  const scan = await scanArtifactsForMarkers(artifactDir, [longLivedMarker, ephemeralMarker]);

  assert.equal(scan.leakedFileCount, 2);
  assert.deepEqual(scan.leakedRelativePaths.toSorted(), [
    "backend-http.bin",
    join("nested", "renderer-events.jsonl"),
  ]);
  assert.equal(scan.scannedFileCount, 2);
});

test("does not scan private markers outside the finalized artifact root", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const outsideDir = await createArtifactFixture(t);
  const marker = "sk-outsideartifactroot";
  await writeFile(join(artifactDir, "summary.json"), '{"status":"passed"}\n', "utf8");
  await writeFile(join(outsideDir, "electron-user-data.log"), `outside ${marker}\n`, "utf8");

  const scan = await scanArtifactsForMarkers(artifactDir, [marker]);

  assert.equal(scan.leakedFileCount, 0);
  assert.deepEqual(scan.leakedRelativePaths, []);
  assert.equal(scan.scannedFileCount, 1);
});

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

test("scans temporary state roots before cleanup", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const tempStateDir = await createArtifactFixture(t);
  const marker = "sk-temporarystatemarker";
  await writeFile(join(artifactDir, "summary.json"), '{"status":"passed"}\n', "utf8");
  await writeFile(join(tempStateDir, "electron-user-data.json"), `saved ${marker}\n`, "utf8");

  await assert.rejects(
    finalizeLiveOpenAIArtifacts({
      artifactDir,
      cleanupFinalizers: [
        async () => {
          await rm(tempStateDir, { force: true, recursive: true });
        },
      ],
      markers: [marker],
      scanRoots: [{ description: "temporary-state", root: tempStateDir }],
    }),
    (error) => {
      assert.equal(error.code, liveOpenAIArtifactPrivacyViolationCode);
      assert.equal(error.message.includes(marker), false);
      assert.equal(error.message.includes("temporary-state"), true);
      return true;
    },
  );
  await assert.rejects(readFile(join(artifactDir, "summary.json"), "utf8"), {
    code: "ENOENT",
  });
  await assert.rejects(readFile(join(tempStateDir, "electron-user-data.json"), "utf8"), {
    code: "ENOENT",
  });
});

test("allows root-specific marker sets for temporary state", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const tempStateDir = await createArtifactFixture(t);
  const speechMarker = "sk-rootspecificspeechmarker";
  const runtimeToken = "runtime-device-token-may-persist-in-app-state";
  await writeFile(join(artifactDir, "summary.json"), '{"status":"passed"}\n', "utf8");
  await writeFile(join(tempStateDir, "known-runtimes.json"), `${runtimeToken}\n`, "utf8");

  const scan = await finalizeLiveOpenAIArtifacts({
    artifactDir,
    markers: [speechMarker, runtimeToken],
    scanRoots: [{ markers: [speechMarker], root: tempStateDir }],
  });

  assert.equal(scan.leakedFileCount, 0);
  assert.equal(scan.scannedRootCount, 2);
  assert.equal(scan.scannedFileCount, 2);
});

test("redacts root-specific markers from privacy violation workflow failures", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const tempStateDir = await createArtifactFixture(t);
  const artifactMarker = "sk-rootspecificartifactmarker";
  const tempStateMarker = "sk-rootspecifictemporarystatemarker";
  const originalFailure = new Error(`provider failed after issuing ${tempStateMarker}`);
  await writeFile(join(artifactDir, "summary.json"), '{"status":"failed"}\n', "utf8");
  await writeFile(join(tempStateDir, "electron-user-data.json"), tempStateMarker, "utf8");

  await assert.rejects(
    finalizeLiveOpenAIArtifacts({
      artifactDir,
      cleanupFinalizers: [
        async () => {
          await rm(tempStateDir, { force: true, recursive: true });
        },
      ],
      markers: [artifactMarker],
      scanRoots: [{ markers: [tempStateMarker], root: tempStateDir }],
      workflowError: originalFailure,
    }),
    (error) => {
      assert.equal(error.code, liveOpenAIArtifactPrivacyViolationCode);
      assert.equal(error.message.includes(tempStateMarker), false);
      assert.equal(
        error.originalWorkflowFailure,
        "provider failed after issuing [REDACTED_SECRET]",
      );
      return true;
    },
  );
});

test("preserves scan failures when an earlier workflow error exists", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const cleanupDir = await createArtifactFixture(t);
  const marker = "sk-scanfailureworkflowmarker";
  const originalFailure = new Error(`provider failed after issuing ${marker}`);
  await writeFile(join(artifactDir, "summary.json"), '{"status":"failed"}\n', "utf8");
  await writeFile(join(cleanupDir, "state.json"), "temporary state\n", "utf8");

  await assert.rejects(
    finalizeLiveOpenAIArtifacts({
      artifactDir,
      cleanupFinalizers: [
        async () => {
          await rm(cleanupDir, { force: true, recursive: true });
        },
      ],
      markers: [marker],
      scanRoots: [join(cleanupDir, "missing")],
      workflowError: originalFailure,
    }),
    (error) => {
      assert.equal(error.message.includes("artifact privacy scan failed before cleanup"), true);
      assert.equal(error.message.includes(marker), false);
      assert.equal(
        error.originalWorkflowFailure,
        "provider failed after issuing [REDACTED_SECRET]",
      );
      return true;
    },
  );
  await assert.rejects(readFile(join(cleanupDir, "state.json"), "utf8"), {
    code: "ENOENT",
  });
});

test("redacts a failed workflow error even when finalized artifacts are clean", async (t) => {
  const artifactDir = await createArtifactFixture(t);
  const marker = "sk-cleanfailedworkflowmarker";
  const originalFailure = new Error(`provider failed after issuing ${marker}`);
  originalFailure.stack = `Error: provider failed after issuing ${marker}\n    at live-smoke`;
  await writeFile(join(artifactDir, "summary.json"), '{"status":"failed"}\n', "utf8");

  await assert.rejects(
    finalizeLiveOpenAIArtifacts({
      artifactDir,
      finalizers: [
        async () => {
          await writeFile(join(artifactDir, "electron-output.log"), "clean shutdown\n", "utf8");
        },
      ],
      markers: [marker],
      workflowError: originalFailure,
    }),
    (error) => {
      assert.equal(error.message, "provider failed after issuing [REDACTED_SECRET]");
      assert.equal(error.message.includes(marker), false);
      assert.equal(error.stack.includes(marker), false);
      return true;
    },
  );
  assert.equal(
    await readFile(join(artifactDir, "electron-output.log"), "utf8"),
    "clean shutdown\n",
  );
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
