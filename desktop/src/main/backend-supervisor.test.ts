import { describe, expect, test } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseReadyLine, startSpawnedBackend, type BackendHandle } from "./backend-supervisor";

describe("parseReadyLine", () => {
  test("accepts the machine-readable ready event", () => {
    expect(parseReadyLine('{"event":"ready","addr":"127.0.0.1:41000"}')).toEqual({
      addr: "127.0.0.1:41000",
      event: "ready",
    });
  });

  test("ignores non-readiness logging", () => {
    expect(parseReadyLine("server log line")).toBeNull();
    expect(parseReadyLine('{"event":"log","addr":"127.0.0.1:41000"}')).toBeNull();
  });
});

describe("startSpawnedBackend", () => {
  test("captures logs and stops a ready backend process", async () => {
    const handle = await startSpawnedBackend({
      args: [
        "-e",
        [
          "console.error('stderr log')",
          "console.log('stdout log')",
          "console.log(JSON.stringify({ event: 'ready', addr: '127.0.0.1:41000' }))",
          "setInterval(() => {}, 1000)",
        ].join(";"),
      ],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      readyTimeoutMs: 1000,
    });

    expect(handle.mode).toBe("spawned");
    expect(handle.url).toBe("http://127.0.0.1:41000");
    expect(handle.recentLogs()).toContain("stderr log");
    expect(handle.recentLogs()).toContain("stdout log");

    await handle.stop();
  });

  test("continues capturing stdout after readiness", async () => {
    const handle = await startSpawnedBackend({
      args: [
        "-e",
        [
          "console.log(JSON.stringify({ event: 'ready', addr: '127.0.0.1:41002' }))",
          "setTimeout(() => console.log('post-ready stdout'), 20)",
          "setInterval(() => {}, 1000)",
        ].join(";"),
      ],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      readyTimeoutMs: 1000,
    });

    try {
      await waitForLog(handle, "post-ready stdout");
      expect(handle.recentLogs()).toContain("post-ready stdout");
    } finally {
      await handle.stop();
    }
  });

  test("stops the backend process when readiness times out", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "setta-backend-supervisor-"));
    const readyForSignalPath = join(tempDir, "ready-for-signal");
    const markerPath = join(tempDir, "terminated");

    try {
      await expect(
        startSpawnedBackend({
          args: [
            "-e",
            [
              "const fs = require('node:fs')",
              `const markerPath = ${JSON.stringify(markerPath)}`,
              `const readyForSignalPath = ${JSON.stringify(readyForSignalPath)}`,
              "process.on('SIGTERM', () => { fs.writeFileSync(markerPath, 'terminated'); process.exit(0) })",
              "fs.writeFileSync(readyForSignalPath, 'ready')",
              "setInterval(() => {}, 1000)",
            ].join(";"),
          ],
          command: process.execPath,
          cwd: process.cwd(),
          env: process.env,
          readyTimeoutMs: 2000,
        }),
      ).rejects.toThrow("backend readiness timed out");
      expect(existsSync(readyForSignalPath)).toBe(true);
      expect(existsSync(markerPath)).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("reports backend logs when the process exits before readiness", async () => {
    await expect(
      startSpawnedBackend({
        args: [
          "-e",
          [
            "console.error('start backend: load workspace session: malformed app state')",
            "process.exit(1)",
          ].join(";"),
        ],
        command: process.execPath,
        cwd: process.cwd(),
        env: process.env,
        readyTimeoutMs: 1000,
      }),
    ).rejects.toThrow(
      [
        "backend exited before ready with code 1 and signal null",
        "Recent backend logs:",
        "start backend: load workspace session: malformed app state",
      ].join("\n"),
    );
  });

  test("reports unexpected exit after readiness", async () => {
    const handle = await startSpawnedBackend({
      args: [
        "-e",
        [
          "console.log(JSON.stringify({ event: 'ready', addr: '127.0.0.1:41001' }))",
          "setTimeout(() => process.exit(12), 20)",
        ].join(";"),
      ],
      command: process.execPath,
      cwd: process.cwd(),
      env: process.env,
      readyTimeoutMs: 1000,
    });

    const exit = await new Promise((resolve) => {
      handle.events.once("exit", resolve);
    });

    expect(exit).toEqual({ code: 12, expected: false, signal: null });
  });
});

function waitForLog(handle: BackendHandle, expectedLine: string): Promise<void> {
  if (handle.recentLogs().includes(expectedLine)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      handle.events.off("log", onLog);
      reject(new Error(`timed out waiting for log line: ${expectedLine}`));
    }, 1000);

    const onLog = (line: string) => {
      if (line !== expectedLine) {
        return;
      }
      clearTimeout(timeout);
      handle.events.off("log", onLog);
      resolve();
    };

    handle.events.on("log", onLog);
  });
}
