import { describe, expect, test } from "vitest";

import { parseReadyLine, startSpawnedBackend } from "./backend-supervisor";

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
