import type { KnownRuntimeView, RuntimeRegistrySnapshot } from "@shared/types";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { RuntimeList } from "./runtime-picker";
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
