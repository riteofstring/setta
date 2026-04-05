import { describe, expect, it } from "vitest";

import type { GetLauncherStatusResponse } from "openapi/http";

import {
  buildSetupLauncherRequest,
  deriveLauncherControlsState,
  normalizeLauncherScopeSettaHome,
  resolveInstallerInstructionsForUserAgent,
  resolveUpdateProgressLabel,
} from "./DesktopLauncherSettingsSection";

function buildLauncherStatusResponse(
  overrides: Partial<GetLauncherStatusResponse> = {},
): GetLauncherStatusResponse {
  return {
    ok: true,
    ...overrides,
  };
}

describe("DesktopLauncherSettingsSection helpers", () => {
  it("derives setup state for a fresh installation", () => {
    const status = buildLauncherStatusResponse({
      ok: true,
      installed: false,
      updateCapability: "unsupported",
    });

    const derived = deriveLauncherControlsState({
      launcherStatus: status,
      launcherActionInFlight: null,
    });

    expect(derived.launcherInstalled).toBe(false);
    expect(derived.canUpdateInApp).toBe(false);
    expect(derived.installerManagedChannel).toBe(false);
    expect(derived.launcherActionsDisabled).toBe(false);
    expect(derived.launcherSetupButtonLabel).toBe("Setup Desktop App");
  });

  it("derives in-app update state and in-flight setup label", () => {
    const status = buildLauncherStatusResponse({
      ok: true,
      installed: true,
      updateCapability: "in_app",
    });

    const derived = deriveLauncherControlsState({
      launcherStatus: status,
      launcherActionInFlight: "setup",
    });

    expect(derived.launcherInstalled).toBe(true);
    expect(derived.canUpdateInApp).toBe(true);
    expect(derived.installerManagedChannel).toBe(false);
    expect(derived.launcherActionsDisabled).toBe(true);
    expect(derived.launcherSetupButtonLabel).toBe("Setting up...");
  });

  it("marks installer-managed channels and re-run setup label", () => {
    const status = buildLauncherStatusResponse({
      ok: true,
      installed: true,
      updateCapability: "installer_managed",
    });

    const derived = deriveLauncherControlsState({
      launcherStatus: status,
      launcherActionInFlight: null,
    });

    expect(derived.launcherInstalled).toBe(true);
    expect(derived.canUpdateInApp).toBe(false);
    expect(derived.installerManagedChannel).toBe(true);
    expect(derived.launcherSetupButtonLabel).toBe("Re-run Setup");
  });

  it("maps update stage labels", () => {
    expect(resolveUpdateProgressLabel("idle")).toBeNull();
    expect(resolveUpdateProgressLabel("checking")).toBe(
      "Update progress: checking",
    );
    expect(resolveUpdateProgressLabel("downloading")).toBe(
      "Update progress: downloading/installing",
    );
    expect(resolveUpdateProgressLabel("rebinding")).toBe(
      "Update progress: rebinding",
    );
    expect(resolveUpdateProgressLabel("done")).toBe("Update progress: done");
    expect(resolveUpdateProgressLabel("failed")).toBe(
      "Update progress: failed",
    );
  });

  it("returns OS-specific installer instructions", () => {
    const mac = resolveInstallerInstructionsForUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2)",
    );
    const windows = resolveInstallerInstructionsForUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    );
    const linux = resolveInstallerInstructionsForUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64)",
    );

    expect(mac[0]).toContain("macOS installer");
    expect(windows[0]).toContain("Windows installer");
    expect(linux[0]).toContain("Linux package");
  });

  it("builds setup payload from existing launcher status", () => {
    const status = buildLauncherStatusResponse({
      ok: true,
      installed: true,
      channel: "uv-tool",
      openMode: "browser",
      workspaceBehavior: "always_prompt",
      managedArtifacts: {
        desktop: "/tmp/setta.desktop",
      },
      artifactOptions: {
        app_name: "Setta",
      },
    });

    const payload = buildSetupLauncherRequest("/tmp/setta-home", status);

    expect(payload).toMatchObject({
      settaHome: "/tmp/setta-home",
      installArtifacts: true,
      channel: "uv-tool",
      openMode: "browser",
      workspaceBehavior: "always_prompt",
      artifactOptions: {
        app_name: "Setta",
      },
    });
  });

  it("sets installArtifacts=false when launcher has no managed artifacts", () => {
    const status = buildLauncherStatusResponse({
      ok: true,
      installed: true,
      managedArtifacts: {},
    });

    const payload = buildSetupLauncherRequest("/tmp/setta-home", status);

    expect(payload).toMatchObject({
      settaHome: "/tmp/setta-home",
      installArtifacts: false,
    });
  });

  it("omits setup defaults when launcher is not installed", () => {
    const status = buildLauncherStatusResponse({
      ok: true,
      installed: false,
      updateCapability: "unsupported",
    });

    const payload = buildSetupLauncherRequest("/tmp/setta-home", status);
    expect(payload).toEqual({ settaHome: "/tmp/setta-home" });
  });

  it("normalizes launcher scope settaHome values", () => {
    expect(normalizeLauncherScopeSettaHome(undefined)).toBeNull();
    expect(normalizeLauncherScopeSettaHome(null)).toBeNull();
    expect(normalizeLauncherScopeSettaHome("   ")).toBeNull();
    expect(normalizeLauncherScopeSettaHome(" /tmp/setta-home ")).toBe(
      "/tmp/setta-home",
    );
  });
});
