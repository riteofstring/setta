import { describe, expect, it } from "vitest";
import type { LaunchRequestInput } from "utils/generatedTypes";
import { buildLaunchRequestDedupeKey } from "./launchRequestDedupeKey";

describe("buildLaunchRequestDedupeKey", () => {
  it("produces the same key for equivalent requests with different field order", () => {
    const first: LaunchRequestInput = {
      workspaceRoot: "/tmp/workspace",
      settaFilesLocation: "auto",
      sshTarget: "user@host",
      localPort: 61000,
      profile: "dev",
      settaHome: "/tmp/setta-home",
      settaFilesRoot: "/tmp/state",
      runtimeRoot: "/tmp/runtime",
    };
    const second: LaunchRequestInput = {
      runtimeRoot: "/tmp/runtime",
      settaFilesRoot: "/tmp/state",
      settaHome: "/tmp/setta-home",
      profile: "dev",
      localPort: 61000,
      sshTarget: "user@host",
      settaFilesLocation: "auto",
      workspaceRoot: "/tmp/workspace",
    };

    expect(buildLaunchRequestDedupeKey(first)).toBe(
      buildLaunchRequestDedupeKey(second),
    );
  });

  it("changes the key when only profile and root-routing fields differ", () => {
    const base: LaunchRequestInput = {
      workspaceRoot: "/tmp/workspace",
      settaFilesLocation: "auto",
      sshTarget: null,
      sshArgs: null,
      remoteCmd: null,
      localPort: null,
      profile: "dev-a",
      settaHome: "/tmp/setta-home-a",
      settaFilesRoot: "/tmp/state-a",
      runtimeRoot: "/tmp/runtime-a",
    };
    const differentProfileAndRoots: LaunchRequestInput = {
      ...base,
      profile: "dev-b",
      settaHome: "/tmp/setta-home-b",
      settaFilesRoot: "/tmp/state-b",
      runtimeRoot: "/tmp/runtime-b",
    };

    expect(buildLaunchRequestDedupeKey(base)).not.toBe(
      buildLaunchRequestDedupeKey(differentProfileAndRoots),
    );
  });

  it("treats omitted optional launch fields the same as explicit nulls", () => {
    const omittedOptionalFields: LaunchRequestInput = {
      workspaceRoot: "/tmp/workspace",
    };
    const explicitNullOptionalFields: LaunchRequestInput = {
      workspaceRoot: "/tmp/workspace",
      profile: null,
      settaHome: null,
      settaFilesRoot: null,
      settaFilesLocation: null,
      runtimeRoot: null,
      sshTarget: null,
      sshArgs: null,
      remoteCmd: null,
      localPort: null,
    };

    expect(buildLaunchRequestDedupeKey(omittedOptionalFields)).toBe(
      buildLaunchRequestDedupeKey(explicitNullOptionalFields),
    );
  });
});
