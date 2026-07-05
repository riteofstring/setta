import type {
  CloudRuntimeProvisionResourceView,
  KnownRuntimeView,
  RuntimeRegistrySnapshot,
} from "@shared/types";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { RuntimeList, RuntimePicker } from "./runtime-picker";
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
        onCreateDevicePairing={async () => ({
          pairingUrl: "https://remote.tailnet.ts.net/#pair=token",
        })}
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
        onCreateDevicePairing={async () => ({
          pairingUrl: "https://remote.tailnet.ts.net/#pair=token",
        })}
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
    expect(html).toContain('src="https://aws.amazon.com/favicon.ico"');
  });

  test("shows created cloud resources that have not paired yet", () => {
    const snapshot = runtimeSnapshot("connected");
    const html = renderToString(
      <RuntimeList
        busy={false}
        cloudResources={[cloudResourceView()]}
        onCreateDevicePairing={async () => ({
          pairingUrl: "https://remote.tailnet.ts.net/#pair=token",
        })}
        onRemove={() => {}}
        onSwitch={() => {}}
        runtimes={snapshot.runtimes}
        status="ready"
      />,
    );

    expect(html).toContain("Cloud resources");
    expect(html).toContain("setta-worker");
    expect(html).toContain("Hetzner");
    expect(html).toContain("may still be billing");
    expect(buttonTagByAriaLabel(html, "Open cleanup options for setta-worker")).not.toBeNull();
  });

  test("exposes existing-machine SSH add mode", () => {
    useRuntimeStore.setState({
      snapshot: runtimeSnapshot("connected"),
      status: "ready",
    });

    const html = renderToString(<RuntimePicker adding={true} setAdding={() => {}} />);

    expect(buttonTagByAriaLabel(html, "Add runtime from existing machine over SSH")).not.toBeNull();
    expect(buttonTagByAriaLabel(html, "Add runtime on my cloud")).not.toBeNull();
    expect(html).toContain("Existing machine over SSH");
    expect(html).toContain("On my cloud");
  });

  test("clears stale picker operations when a terminal runtime snapshot arrives", () => {
    useRuntimeStore.setState({ operation: "switching", status: "ready" });

    useRuntimeStore.getState().setSnapshot(runtimeSnapshot("unreachable"));

    expect(useRuntimeStore.getState().operation).toBeNull();
  });
});

function runtimeSnapshot(
  status: RuntimeRegistrySnapshot["connection"]["status"],
): RuntimeRegistrySnapshot {
  return {
    activeRuntimeId: "remote-runtime",
    cloudResources: [],
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
        infrastructureProvider: {
          displayName: "AWS",
          iconUrl: "https://aws.amazon.com/favicon.ico",
          id: "aws",
        },
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
  > &
    Partial<Pick<KnownRuntimeView, "infrastructureProvider">>,
): KnownRuntimeView {
  return {
    connectionMessage: "",
    infrastructureProvider: {
      displayName: "Unknown provider",
      iconUrl: "",
      id: "unknown",
    },
    lastConnected: null,
    ...overrides,
  };
}

function cloudResourceView(): CloudRuntimeProvisionResourceView {
  return {
    account: null,
    billingWarning:
      "Created via Setta on 2026-07-05; this desktop has not reached the runtime for 2 days and it may still be billing.",
    cleanupSummary: "Stored teardown is ready; review the plan before deleting this resource.",
    commands: {
      diagnose:
        "setta provision diagnose --json --app-data-dir /tmp/setta --record-id hetzner:setta-worker",
      inspect:
        "setta provision inspect --json --app-data-dir /tmp/setta --provider hetzner --runtime-name setta-worker",
      teardownApprove:
        "setta provision down --json --approve --app-data-dir /tmp/setta --record-id hetzner:setta-worker",
      teardownPlan:
        "setta provision down --json --plan-only --app-data-dir /tmp/setta --record-id hetzner:setta-worker",
    },
    createdAt: "2026-07-05T10:00:00.000Z",
    expectedResourceName: "setta-worker",
    infrastructureProvider: {
      displayName: "Hetzner",
      iconUrl: "https://www.hetzner.com/favicon.ico",
      id: "hetzner",
    },
    lastError: null,
    lastReachableAt: null,
    recordId: "hetzner:setta-worker",
    region: "fsn1",
    resourceId: "12345",
    runtimeName: "setta-worker",
    status: "succeeded",
    statusMessage: "Provider create command succeeded; pairing may still need attention.",
    teardownReady: true,
    updatedAt: "2026-07-05T10:05:00.000Z",
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
