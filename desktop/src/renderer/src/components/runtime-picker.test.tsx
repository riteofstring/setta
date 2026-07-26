import type { DeveloperHostedRuntimeStatus } from "@generated/backend";
import type { KnownRuntimeView, RuntimeRegistrySnapshot } from "@shared/types";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import {
  developerHostedFailureCopy,
  developerHostedOfflineDeletionWarning,
  developerHostedPresentation,
  RuntimeList,
} from "./runtime-picker";
import {
  runtimeControlsDisabled,
  runtimePickerControlsDisabled,
  useRuntimeStore,
} from "../stores/runtime-store";

beforeEach(() => {
  useRuntimeStore.setState(useRuntimeStore.getInitialState(), true);
});

describe("runtime picker", () => {
  test("keeps switch controls enabled when the active runtime is revoked", () => {
    const snapshot = runtimeSnapshot("revoked");
    expect(runtimeControlsDisabled(snapshot)).toBe(true);
    expect(runtimePickerControlsDisabled(snapshot, null)).toBe(false);

    const html = renderToString(
      <RuntimeList
        busy={runtimePickerControlsDisabled(snapshot, null)}
        onRemove={() => {}}
        onSwitch={() => {}}
        runtimes={snapshot.runtimes}
        status="ready"
      />,
    );
    const localSwitchButton = buttonTagByAriaLabel(html, "Switch to Local");

    expect(localSwitchButton).not.toBeNull();
    expect(localSwitchButton).not.toMatch(/\sdisabled(?:[=\s>]|$)/);
  });

  test("uses row options triggers and omits addresses from the closed list", () => {
    const snapshot = runtimeSnapshot("connected");

    const html = renderToString(
      <RuntimeList
        busy={false}
        onRemove={() => {}}
        onSwitch={() => {}}
        runtimes={snapshot.runtimes}
        status="ready"
      />,
    );

    expect(html).not.toContain("http://127.0.0.1:5011");
    expect(html).not.toContain("http://100.64.0.8:8080");
    expect(buttonTagByAriaLabel(html, "Open options for Local")).not.toBeNull();
    expect(buttonTagByAriaLabel(html, "Open options for Remote Runtime")).not.toBeNull();
    expect(buttonTagByAriaLabel(html, "Remove Remote Runtime")).toBeNull();
  });

  test("clears stale picker operations when a terminal runtime snapshot arrives", () => {
    useRuntimeStore.setState({ operation: "switching", status: "ready" });

    useRuntimeStore.getState().setSnapshot(runtimeSnapshot("unreachable"));

    expect(useRuntimeStore.getState().operation).toBeNull();
  });

  test("shows green only when the hosted runtime is selected and connected", () => {
    const hosted = runtimeView({
      active: true,
      baseUrl: "https://hosted.runtime.invalid/",
      connectionStatus: "connected",
      displayName: "Hosted developer runtime",
      isLocal: false,
      runtimeId: "hosted-runtime",
    });
    hosted.managedHosted = true;
    const snapshot = {
      ...runtimeSnapshot("connected"),
      activeRuntimeId: hosted.runtimeId,
      connection: {
        ...runtimeSnapshot("connected").connection,
        runtimeId: hosted.runtimeId,
        status: "connected" as const,
      },
      runtimes: [runtimeSnapshot("connected").runtimes[0]!, hosted],
    };
    const connected = developerHostedPresentation(developerHostedStatus(), hosted, snapshot);
    expect(connected.label).toBe("Connected");
    expect(connected.dotClass).toBe("bg-emerald-400");

    const reconnecting = developerHostedPresentation(
      developerHostedStatus(),
      { ...hosted, connectionStatus: "unreachable" },
      {
        ...snapshot,
        connection: { ...snapshot.connection, status: "unreachable" },
      },
    );
    expect(reconnecting.label).toBe("Reconnecting");
    expect(reconnecting.dotClass).not.toBe("bg-emerald-400");
  });

  test("shows explicit offline deletion limits and stable failure copy", () => {
    expect(developerHostedOfflineDeletionWarning).toContain(
      "Keep this controller running for automatic deletion.",
    );
    expect(developerHostedFailureCopy("cleanup_pending")).toBe(
      "Cleanup is still pending. Setta will keep retrying.",
    );
  });
});

function runtimeSnapshot(
  status: RuntimeRegistrySnapshot["connection"]["status"],
): RuntimeRegistrySnapshot {
  return {
    activeRuntimeId: "remote-runtime",
    connection: {
      message: status === "revoked" ? "Device token revoked" : "Runtime unreachable",
      protocolVersion: 1,
      runtimeId: "remote-runtime",
      status,
      updatedAt: "2026-07-02T12:00:00.000Z",
    },
    runtimes: [
      runtimeView({
        active: false,
        baseUrl: "http://127.0.0.1:5011",
        connectionStatus: "disconnected",
        displayName: "Local",
        isLocal: true,
        runtimeId: "local-runtime",
      }),
      runtimeView({
        active: true,
        baseUrl: "http://100.64.0.8:8080",
        connectionStatus: status,
        displayName: "Remote Runtime",
        isLocal: false,
        runtimeId: "remote-runtime",
      }),
    ],
    switching: false,
  };
}

function runtimeView(
  overrides: Pick<
    KnownRuntimeView,
    "active" | "baseUrl" | "connectionStatus" | "displayName" | "isLocal" | "runtimeId"
  >,
): KnownRuntimeView {
  return {
    connectionMessage: "",
    lastConnected: null,
    managedHosted: false,
    ...overrides,
  };
}

function developerHostedStatus(
  overrides: Partial<DeveloperHostedRuntimeStatus> = {},
): DeveloperHostedRuntimeStatus {
  return {
    operationId: "hosted-ensure",
    cursor: "6",
    runtimeRegistryId: "hosted-runtime",
    operationKind: "ensure",
    phase: "connected",
    retryable: false,
    reasonCode: null,
    occurredAt: "2026-07-27T14:00:00Z",
    lastConnectedAt: "2026-07-27T14:00:00Z",
    enforcedBudgetUsdMicros: 800_000,
    reportedUsageUsdMicros: null,
    deletionScheduledAt: "2026-07-27T14:30:00Z",
    automaticDeletionWhileOffline: true,
    terminalOutcome: "connected",
    ...overrides,
  };
}

function buttonTagByAriaLabel(html: string, label: string): string | null {
  const escapedLabel = escapeRegExp(escapeAttribute(label));
  const match = html.match(new RegExp(`<button(?=[^>]*aria-label="${escapedLabel}")[^>]*>`));
  return match?.[0] ?? null;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
