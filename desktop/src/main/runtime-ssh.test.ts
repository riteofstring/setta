import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runSettaRemoteAddSSH } from "./runtime-ssh";

describe("runtime SSH installer", () => {
  test("invokes setta remote add through a short-lived auth key file", async () => {
    const appDataDir = "/tmp/setta-app-data";
    const repoRoot = "/repo";
    let authKeyPath = "";
    let capturedEnv: NodeJS.ProcessEnv = {};
    const result = await runSettaRemoteAddSSH(
      {
        installerSha256: "a".repeat(64),
        minisignPublicKey: "RWQtestminisignpublickey",
        releaseBaseUrl: "https://downloads.example.test/setta/v1.2.3",
        runtimeName: "setta-gpu-box",
        settaVersion: "v1.2.3",
        sshTarget: "ssh://ubuntu@example.com",
        tailscaleAuthKey: "tskey-auth-secret",
      },
      {
        appDataDir,
        env: { SETTA_CLI_PATH: "/opt/setta" },
        repoRoot,
        execFileRunner: async (command, args, options) => {
          expect(command).toBe("/opt/setta");
          expect(options.cwd).toBe(repoRoot);
          capturedEnv = options.env;
          expect(args).not.toContain("tskey-auth-secret");
          const keyFileIndex = args.indexOf("--tailscale-auth-key-file");
          expect(keyFileIndex).toBeGreaterThan(-1);
          authKeyPath = args[keyFileIndex + 1] ?? "";
          await expect(readFile(authKeyPath, "utf8")).resolves.toBe("tskey-auth-secret\n");
          expect(args).toContain("ssh://ubuntu@example.com");
          expect(args).toContain("--runtime-name");
          expect(args).toContain("setta-gpu-box");
          return {
            stderr: "",
            stdout: JSON.stringify({
              ok: true,
              pairingUrl:
                "setta://pair?rt=0123456789abcdef0123456789abcdef&tok=tok&url=http%3A%2F%2F100.64.0.12%3A7345",
              runtimeName: "setta-gpu-box",
              target: "ssh://ubuntu@example.com",
              transcriptPath: join(appDataDir, "remote-setup", "transcript.json"),
              transport: "tailscale",
            }),
          };
        },
      },
    );

    expect(result.transcriptPath).toBe(join(appDataDir, "remote-setup", "transcript.json"));
    expect(capturedEnv.SETTA_APP_DATA_DIR).toBe(appDataDir);
    await expect(stat(authKeyPath)).rejects.toThrow();
  });

  test("requires release fields before invoking the CLI", async () => {
    await expect(
      runSettaRemoteAddSSH(
        {
          installerSha256: "",
          minisignPublicKey: "RWQtestminisignpublickey",
          releaseBaseUrl: "https://downloads.example.test/setta/v1.2.3",
          settaVersion: "v1.2.3",
          sshTarget: "ssh://ubuntu@example.com",
          tailscaleAuthKey: "tskey-auth-secret",
        },
        {
          appDataDir: "/tmp/setta-app-data",
          env: { SETTA_CLI_PATH: "/opt/setta" },
          repoRoot: "/repo",
          execFileRunner: async () => {
            throw new Error("should not run");
          },
        },
      ),
    ).rejects.toThrow("Installer SHA-256 is required");
  });
});
