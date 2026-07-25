import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const fakeTopicCodexFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-app-server.mjs",
);
const fakeTopicArtifactToolFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-artifact-tool.mjs",
);
const fakeTopicArtifactTurnsFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-artifact-turns.mjs",
);
const fakeTopicRestrictedThreadFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-restricted-thread.mjs",
);
const fakeTopicAppServerHelpersFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-app-server-helpers.mjs",
);
const fakeTopicDirectorDecisionsFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-director-decisions.mjs",
);
const fakeTopicInputRoutesFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-topic-codex-input-routes.mjs",
);

export async function installFakeTopicCodex(fixture) {
  const binDir = join(fixture.tempRoot, "fake-topic-bin");
  const statePath = join(fixture.tempRoot, "fake-topic-codex-state.json");
  await mkdir(binDir, { recursive: true });
  const scriptPath = join(binDir, "fake-topic-codex-app-server.mjs");
  await copyFile(fakeTopicCodexFixture, scriptPath);
  await copyFile(fakeTopicArtifactToolFixture, join(binDir, "fake-topic-artifact-tool.mjs"));
  await copyFile(fakeTopicArtifactTurnsFixture, join(binDir, "fake-topic-artifact-turns.mjs"));
  await copyFile(
    fakeTopicAppServerHelpersFixture,
    join(binDir, "fake-topic-codex-app-server-helpers.mjs"),
  );
  await copyFile(
    fakeTopicDirectorDecisionsFixture,
    join(binDir, "fake-topic-codex-director-decisions.mjs"),
  );
  await copyFile(fakeTopicInputRoutesFixture, join(binDir, "fake-topic-codex-input-routes.mjs"));
  await copyFile(
    fakeTopicRestrictedThreadFixture,
    join(binDir, "fake-topic-codex-restricted-thread.mjs"),
  );
  if (process.platform === "win32") {
    await writeFile(join(binDir, "codex.cmd"), `@echo off\r\nnode "${scriptPath}" %*\r\n`, "utf8");
  } else {
    const commandPath = join(binDir, "codex");
    await writeFile(commandPath, `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`, "utf8");
    await chmod(commandPath, 0o755);
  }
  return { binDir, statePath };
}
