import { afterEach, describe, expect, it, vi } from "vitest";

import { appSubsystemFrontendRegistration } from "../../../plugins/setta-json-render-app-gen/frontend/src/registration";
import {
  FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID,
  FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY,
} from "../../../plugins/setta-json-render-app-gen/frontend/src/shared";
import { preparePluginFrontendHostBridge } from "./runtimeInternal";

function getFirstPartyBridgeRegistry():
  | Record<string, { apiVersion: number; register: (host: unknown) => void }>
  | undefined {
  return (globalThis as Record<string, unknown>)[
    FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY
  ] as
    | Record<string, { apiVersion: number; register: (host: unknown) => void }>
    | undefined;
}

describe("firstPartyAppSubsystemBridge", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[
      FIRST_PARTY_PLUGIN_FRONTEND_BRIDGE_REGISTRY_KEY
    ];
  });

  it("installs the host-owned app subsystem bridge for the packaged plugin", async () => {
    await preparePluginFrontendHostBridge(FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID);

    const registry = getFirstPartyBridgeRegistry();
    const bridge = registry?.[FIRST_PARTY_APP_SUBSYSTEM_PLUGIN_ID];
    const registerAppSubsystem = vi.fn();

    bridge?.register({ registerAppSubsystem });

    expect(bridge?.apiVersion).toBe(1);
    expect(registerAppSubsystem).toHaveBeenCalledWith(
      appSubsystemFrontendRegistration,
    );
  });

  it("ignores plugins without a host-owned bridge", async () => {
    await preparePluginFrontendHostBridge("acme.other-plugin");

    expect(getFirstPartyBridgeRegistry()).toBeUndefined();
  });
});
