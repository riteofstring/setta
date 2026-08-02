import type { ResponseDataAndStatus } from "@setta/app-subsystem-frontend-sdk";
import {
  buildPluginRestartActionPlan,
  getRestartRequiredPluginIds,
  requestPluginRestart,
} from "plugins/restart";
import {
  createPluginListEntry,
  createPluginStatusEntry,
  type PluginListEntry,
  type PluginRestartResponse,
} from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";

function buildPluginListEntry(
  overrides: Partial<PluginListEntry>,
): PluginListEntry {
  return createPluginListEntry({
    pluginId: "acme.plugin",
    name: "Acme Plugin",
    version: "1.0.0",
    sourceScope: "workspace",
    sourceScopeLabel: "workspace",
    sourceManager: "setta",
    sourceManagerHint: null,
    canonicalSourceKey: "github:acme/plugin",
    sourceDigestSha256: null,
    frontend: {
      entrypointUrl: null,
      styleUrl: null,
    },
    content: {
      hasBlueprints: false,
      hasProjectTemplates: false,
      hasPrompts: false,
    },
    config: {
      hasSchema: false,
      schemaJson: {},
      schemaJsonDigestSha256: null,
      currentConfig: {},
      currentConfigDigestSha256: null,
    },
    effectiveCapabilities: [],
    enablementSource: null,
    restartRequired: false,
    ...overrides,
  });
}

async function runRestartResponse(
  response: ResponseDataAndStatus<PluginRestartResponse>,
) {
  return requestPluginRestart(async () => response);
}

describe("plugin restart helpers", () => {
  it("collects and sorts restart-required plugin ids", () => {
    const ids = getRestartRequiredPluginIds([
      buildPluginListEntry({
        pluginId: "zeta.plugin",
        restartRequired: true,
      }),
      buildPluginListEntry({
        pluginId: "alpha.plugin",
        restartRequired: true,
      }),
      buildPluginListEntry({
        pluginId: "beta.plugin",
        restartRequired: false,
      }),
    ]);

    expect(ids).toEqual(["alpha.plugin", "zeta.plugin"]);
  });

  it("includes restart-required ids from status entries when list omits tombstones", () => {
    const ids = getRestartRequiredPluginIds(
      [],
      [
        createPluginStatusEntry({
          pluginId: "setta-fixture-backend",
          name: "Setta Fixture Backend",
          version: "0.1.0",
          state: "pending_restart",
          sourceScope: "workspace",
          sourceScopeLabel: "workspace",
          sourceManager: "setta",
          sourceManagerHint: null,
          sourcePath: "[redacted]:workspace:setta-fixture-backend",
          canonicalSourceKey: "redacted:workspace:setta-fixture-backend",
          sourceDigestSha256: null,
          shadowedBySourcePath: null,
          requestedCapabilities: [],
          effectiveCapabilities: [],
          blockedCapabilities: [],
          components: [],
          registeredCodegenTargets: [],
          registeredLanguageServers: [],
          registeredBackendRoutes: [],
          registeredStaticDirs: [],
          registeredListenerEndpoints: [],
          enablementSource: null,
          runtimePayloadDigestSha256: "digest-setta-fixture-backend",
          restartRequired: true,
          errors: [],
        }),
      ],
    );

    expect(ids).toEqual(["setta-fixture-backend"]);
  });

  it("normalizes manual and unavailable restart plans", () => {
    const manual = buildPluginRestartActionPlan({
      mode: "manual",
      command: "",
      reason: "No daemon restart support",
    });

    expect(manual).toEqual({
      mode: "manual",
      command: "setta",
      reason: "No daemon restart support",
      message: "Manual restart required: setta. No daemon restart support",
    });

    const unavailable = buildPluginRestartActionPlan(null);
    expect(unavailable.mode).toBe("unavailable");
  });

  it("maps restart endpoint responses to accepted and manual-required outcomes", () => {
    return Promise.all([
      expect(
        runRestartResponse({
          status: 200,
          hasResponse: true,
          data: {
            accepted: true,
            mode: "programmatic",
            command: null,
            reason: null,
          },
        }),
      ).resolves.toEqual({
        kind: "accepted",
      }),
      expect(
        runRestartResponse({
          status: 200,
          hasResponse: true,
          data: {
            accepted: false,
            mode: "programmatic",
            command: "setta restart",
            reason: "Programmatic restart request was rejected.",
          },
        }),
      ).resolves.toEqual({
        kind: "manual_required",
        command: "setta restart",
        reason: "Programmatic restart request was rejected.",
        message:
          "Manual restart required: setta restart. Programmatic restart request was rejected.",
      }),
    ]);
  });

  it("maps non-success restart endpoint responses to request_failed", async () => {
    await expect(
      runRestartResponse({
        status: 500,
        hasResponse: true,
        data: undefined,
      }),
    ).resolves.toEqual({
      kind: "request_failed",
      message: "Restart request failed.",
    });
  });

  it("maps error detail from restart endpoint payloads", async () => {
    await expect(
      runRestartResponse({
        status: 500,
        hasResponse: true,
        data: {
          detail: "restart endpoint failed",
        } as unknown as {
          accepted: boolean;
          mode: "programmatic" | "manual";
          command: string | null;
          reason: string | null;
        },
      }),
    ).resolves.toEqual({
      kind: "request_failed",
      message: "Restart request failed: restart endpoint failed",
    });
  });

  it("requests restart through injected route caller", async () => {
    const requestMock = vi.fn(async () => ({
      status: 200,
      hasResponse: true,
      data: {
        accepted: true,
        mode: "programmatic" as const,
        command: null,
        reason: null,
      },
    }));

    const result = await requestPluginRestart(requestMock);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: "accepted" });
  });
});
