import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  headlessChromeArguments,
  launcherArguments,
  resolveHeadlessChromeBinary,
  startSupervisedProcess,
  stopProcess,
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

test("launcher checks API and web readiness on one supplied origin", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const serverOrigin = "http://127.0.0.1:43111";
  let webAttempts = 0;
  globalThis.fetch = async (origin) => {
    requests.push(origin);
    if (origin === serverOrigin && webAttempts++ === 0) {
      throw new TypeError("connection refused");
    }
    return { ok: true };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await waitForLauncher(
    {
      child: { exitCode: null },
      label: "Python Canvas launcher",
      output: { stderr: "", stdout: "" },
    },
    serverOrigin,
  );

  assert.deepEqual(requests, [
    "http://127.0.0.1:43111/api/v2/project",
    "http://127.0.0.1:43111",
    "http://127.0.0.1:43111",
  ]);
});

test("launcher receives one per-run same-origin port", () => {
  assert.deepEqual(
    launcherArguments("/tmp/python-canvas/project.json", true, 43111),
    [
      "--project",
      "/tmp/python-canvas/project.json",
      "--port",
      "43111",
      "--create",
    ],
  );
});

test("supervised launcher keeps stdin open until its owner shuts down", async (t) => {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-supervisor-"),
  );
  const fixturePath = path.join(temporaryDirectory, "supervised-child.mjs");
  writeFileSync(
    fixturePath,
    [
      'process.once("SIGTERM", () => {',
      '  process.stdout.write("received signal\\n");',
      "  process.exit(9);",
      "});",
      'process.stdin.once("end", () => {',
      '  process.stdout.write("supervisor stdin closed\\n");',
      "  process.exit(0);",
      "});",
      "process.stdin.resume();",
      'process.stdout.write("ready\\n");',
    ].join("\n"),
    "utf8",
  );
  const processHandle = startSupervisedProcess(
    process.execPath,
    [fixturePath],
    {
      cwd: temporaryDirectory,
      label: "supervised launcher fixture",
    },
  );
  t.after(async () => {
    await stopProcess(processHandle);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  await waitForProcessOutput(processHandle, "ready\n");
  assert.equal(processHandle.child.exitCode, null);

  await stopProcess(processHandle);

  assert.equal(processHandle.child.exitCode, 0);
  assert.match(processHandle.output.stdout, /supervisor stdin closed/u);
  assert.doesNotMatch(processHandle.output.stdout, /received signal/u);
});

test("supervised launcher falls back to SIGTERM after an ignored EOF", async (t) => {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-supervisor-fallback-"),
  );
  const fixturePath = path.join(temporaryDirectory, "supervised-child.mjs");
  writeFileSync(
    fixturePath,
    [
      "const keepAlive = setInterval(() => {}, 1_000);",
      'process.once("SIGTERM", () => {',
      "  clearInterval(keepAlive);",
      '  process.stdout.write("received signal\\n");',
      "  process.exit(0);",
      "});",
      "process.stdin.resume();",
      'process.stdout.write("ready\\n");',
    ].join("\n"),
    "utf8",
  );
  const processHandle = startSupervisedProcess(
    process.execPath,
    [fixturePath],
    {
      cwd: temporaryDirectory,
      label: "supervised fallback fixture",
    },
  );
  t.after(async () => {
    await stopProcess(processHandle);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  await waitForProcessOutput(processHandle, "ready\n");
  await stopProcess(processHandle);

  assert.equal(processHandle.child.exitCode, 0);
  assert.match(processHandle.output.stdout, /received signal/u);
});

test("unsupervised process receives SIGTERM without an EOF wait", async (t) => {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-signal-"),
  );
  const fixturePath = path.join(temporaryDirectory, "signal-child.mjs");
  writeFileSync(
    fixturePath,
    [
      "const timeout = setTimeout(() => {",
      '  process.stdout.write("waited instead of receiving signal\\n");',
      "  process.exit(8);",
      "}, 1_000);",
      'process.once("SIGTERM", () => {',
      "  clearTimeout(timeout);",
      '  process.stdout.write("received signal\\n");',
      "  process.exit(0);",
      "});",
      'process.stdout.write("ready\\n");',
    ].join("\n"),
    "utf8",
  );
  const processHandle = startUnsupervisedProcess(
    process.execPath,
    [fixturePath],
    temporaryDirectory,
    "unsupervised signal fixture",
  );
  t.after(async () => {
    await stopProcess(processHandle);
    rmSync(temporaryDirectory, { force: true, recursive: true });
  });

  await waitForProcessOutput(processHandle, "ready\n");
  await stopProcess(processHandle);

  assert.equal(processHandle.child.exitCode, 0);
  assert.match(processHandle.output.stdout, /received signal/u);
  assert.doesNotMatch(
    processHandle.output.stdout,
    /waited instead of receiving signal/u,
  );
});

test("production launcher supplies the private same-origin server inputs", () => {
  const launcher = readFileSync(
    new URL("../../scripts/run-python-canvas.sh", import.meta.url),
    "utf8",
  );

  assert.match(
    launcher,
    /server_args=\([\s\S]*serve[\s\S]*--project "\$\{canonical_project\}"[\s\S]*--launcher-python "\$\{launcher_python\}"[\s\S]*--basedpyright "\$\{basedpyright\}"[\s\S]*--web-root "\$\{web_root\}"[\s\S]*--port "\$\{server_port\}"[\s\S]*--session-nonce "\$\{session_nonce\}"[\s\S]*--supervised-stdin[\s\S]*\)[\s\S]*exec "\$\{go_command\}" -C apps\/python-canvas\/backend run \.\/cmd\/python-canvas/u,
  );
  assert.doesNotMatch(
    launcher,
    /--app-origin|vite preview|PYTHON_CANVAS_BACKEND_ORIGIN/u,
  );
});

async function waitForProcessOutput(processHandle, output) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (processHandle.output.stdout.includes(output)) {
      return;
    }
    if (processHandle.child.exitCode !== null) {
      throw new Error(
        `${processHandle.label} exited before writing ${JSON.stringify(output)}.`,
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(
    `${processHandle.label} did not write ${JSON.stringify(output)}.`,
  );
}

function startUnsupervisedProcess(command, arguments_, cwd, label) {
  const child = spawn(command, arguments_, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`;
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`;
  });
  return {
    child,
    label,
    output,
    ownsProcessGroup: false,
    supervisedStdin: false,
  };
}

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
