import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  headlessChromeArguments,
  resolveHeadlessChromeBinary,
  waitForLauncher,
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

test("launcher readiness waits for the Vite frontend after the backend", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let frontendAttempts = 0;
  globalThis.fetch = async (origin) => {
    requests.push(origin);
    if (origin === "http://127.0.0.1:5173" && frontendAttempts++ === 0) {
      throw new TypeError("connection refused");
    }
    return { ok: true };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await waitForLauncher({
    child: { exitCode: null },
    label: "Python Canvas launcher",
    output: { stderr: "", stdout: "" },
  });

  assert.deepEqual(requests, [
    "http://127.0.0.1:8080/api/v2/project",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5173",
  ]);
});

function writeExecutable(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, "#!/bin/sh\nexit 0\n", "utf8");
  chmodSync(filePath, 0o700);
}

function cachedHeadlessShellPath(cacheRoot, revision) {
  return path.join(
    cacheRoot,
    `chromium_headless_shell-${revision}`,
    "chrome-headless-shell-mac-arm64",
    "chrome-headless-shell",
  );
}

test("macOS browser launch resolves an explicit binary before the valid cached raw headless shell", (t) => {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-browser-processes-"),
  );
  t.after(() => {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });
  const cacheRoot = path.join(temporaryDirectory, "ms-playwright");
  const lowerRevisionShellPath = cachedHeadlessShellPath(cacheRoot, "18");
  const higherRevisionShellPath = cachedHeadlessShellPath(cacheRoot, "57");
  const nonExecutableShellPath = cachedHeadlessShellPath(cacheRoot, "103");
  const linkedShellPath = cachedHeadlessShellPath(cacheRoot, "88");
  const wrongShapeShellPath = path.join(
    cacheRoot,
    "chromium-144",
    "chrome-headless-shell-mac-arm64",
    "chrome-headless-shell",
  );
  const explicitShellPath = path.join(
    temporaryDirectory,
    "explicit-headless-shell",
  );
  const guiApplicationPath = path.join(
    temporaryDirectory,
    "Browser.app",
    "Contents",
    "MacOS",
    "Browser",
  );
  writeExecutable(lowerRevisionShellPath);
  writeExecutable(higherRevisionShellPath);
  mkdirSync(path.dirname(nonExecutableShellPath), { recursive: true });
  writeFileSync(nonExecutableShellPath, "not executable\n", "utf8");
  chmodSync(nonExecutableShellPath, 0o600);
  mkdirSync(path.dirname(linkedShellPath), { recursive: true });
  symlinkSync(higherRevisionShellPath, linkedShellPath);
  writeExecutable(wrongShapeShellPath);
  writeExecutable(explicitShellPath);
  writeExecutable(guiApplicationPath);

  assert.deepEqual(
    resolveHeadlessChromeBinary({
      cacheRoot,
      environment: {},
      platform: "darwin",
    }),
    {
      path: higherRevisionShellPath,
      source: "Playwright cache revision 57",
    },
  );
  assert.deepEqual(
    resolveHeadlessChromeBinary({
      cacheRoot,
      environment: { PYTHON_CANVAS_CHROME_BINARY: explicitShellPath },
      platform: "darwin",
    }),
    {
      path: explicitShellPath,
      source: "PYTHON_CANVAS_CHROME_BINARY",
    },
  );

  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        environment: { PYTHON_CANVAS_CHROME_BINARY: nonExecutableShellPath },
        cacheRoot,
        platform: "darwin",
      }),
    /existing absolute executable path/u,
  );
  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        environment: { PYTHON_CANVAS_CHROME_BINARY: "chrome-headless-shell" },
        cacheRoot,
        platform: "darwin",
      }),
    /existing absolute executable path/u,
  );
  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        cacheRoot,
        environment: { PYTHON_CANVAS_CHROME_BINARY: guiApplicationPath },
        platform: "darwin",
      }),
    /GUI application executable paths are not supported/u,
  );

  const emptyCacheRoot = path.join(temporaryDirectory, "empty-ms-playwright");
  const missingBinaryError = `Python Canvas browser suite requires a valid absolute PYTHON_CANVAS_CHROME_BINARY or a regular executable Playwright raw headless shell at ${path.join(emptyCacheRoot, "chromium_headless_shell-<numeric revision>", "chrome-headless-shell-mac-arm64", "chrome-headless-shell")}.`;
  assert.throws(
    () =>
      resolveHeadlessChromeBinary({
        cacheRoot: emptyCacheRoot,
        environment: {},
        platform: "darwin",
      }),
    (error) => {
      assert.equal(error.message, missingBinaryError);
      return true;
    },
  );
});
