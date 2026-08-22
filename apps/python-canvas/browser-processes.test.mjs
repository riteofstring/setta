import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  headlessChromeArguments,
  resolveHeadlessChromeBinary,
} from "./browser-processes.mjs";

test("Headless Chrome keeps an isolated renderer profile and audio flag", () => {
  const profileDirectory = "/tmp/setta-python-canvas-isolated-profile";
  const arguments_ = headlessChromeArguments(profileDirectory);

  for (const requiredArgument of [
    "--headless=new",
    "--mute-audio",
    "--password-store=basic",
    "--use-mock-keychain",
  ]) {
    assert.ok(
      arguments_.includes(requiredArgument),
      `Headless Chrome is missing ${requiredArgument}.`,
    );
  }
  assert.deepEqual(
    arguments_.filter((argument) => argument.startsWith("--user-data-dir=")),
    [`--user-data-dir=${profileDirectory}`],
  );
});

test("macOS browser launch fails closed without an explicit raw headless executable", (t) => {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-browser-processes-"),
  );
  t.after(() => {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });
  const headlessShellPath = path.join(
    temporaryDirectory,
    "chrome-headless-shell",
  );
  const nonExecutablePath = path.join(temporaryDirectory, "not-executable");
  writeFileSync(headlessShellPath, "#!/bin/sh\nexit 0\n", "utf8");
  writeFileSync(nonExecutablePath, "not executable\n", "utf8");
  chmodSync(headlessShellPath, 0o700);

  assert.throws(
    () => resolveHeadlessChromeBinary({ environment: {}, platform: "darwin" }),
    /PYTHON_CANVAS_CHROME_BINARY is required on macOS/u,
  );
  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        environment: {
          PYTHON_CANVAS_CHROME_BINARY:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        },
        platform: "darwin",
      }),
    /GUI \.app\/Contents\/MacOS application paths are not supported/u,
  );
  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        environment: { PYTHON_CANVAS_CHROME_BINARY: nonExecutablePath },
        platform: "darwin",
      }),
    /existing absolute executable path/u,
  );
  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        environment: { PYTHON_CANVAS_CHROME_BINARY: "chrome-headless-shell" },
        platform: "darwin",
      }),
    /existing absolute executable path/u,
  );
  assert.equal(
    resolveHeadlessChromeBinary({
      environment: { PYTHON_CANVAS_CHROME_BINARY: headlessShellPath },
      platform: "darwin",
    }),
    headlessShellPath,
  );
});
