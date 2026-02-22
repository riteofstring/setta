import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
  getFrontendWebsocketAffinityId,
  updateFrontendWebsocketAffinity,
} from "state/actions/frontendWebsocketAffinity";
import {
  WebsocketConnectionTypeEnum,
  createWebsocketConnectionInfo,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";

describe("frontendWebsocketAffinity", () => {
  beforeEach(() => {
    clearFrontendWebsocketAffinity();
  });

  it("builds a stable per-tab currentAddress token", () => {
    const first = buildFrontendAffinityCurrentAddress("/project-a");
    const second = buildFrontendAffinityCurrentAddress("/project-a");
    const other = buildFrontendAffinityCurrentAddress("/project-b");

    expect(first).toBe(second);
    expect(first).toContain("#setta-ws-affinity=");
    expect(other).not.toBe(first);
  });

  it("stores websocket id when exactly one matching frontend connection exists", () => {
    const currentAddress = buildFrontendAffinityCurrentAddress("/project-a");
    updateFrontendWebsocketAffinity({
      connections: [
        createWebsocketConnectionInfo({
          id: "frontend-1",
          connectionType: WebsocketConnectionTypeEnum.FRONTEND,
          currentAddress,
          shareSessionId: null,
        }),
      ],
      currentAddress,
      shareSessionId: null,
    });

    expect(getFrontendWebsocketAffinityId()).toBe("frontend-1");
  });

  it("clears websocket affinity when no unique matching connection exists", () => {
    const currentAddress = buildFrontendAffinityCurrentAddress("/project-a");
    updateFrontendWebsocketAffinity({
      connections: [
        createWebsocketConnectionInfo({
          id: "frontend-1",
          connectionType: WebsocketConnectionTypeEnum.FRONTEND,
          currentAddress,
          shareSessionId: null,
        }),
        createWebsocketConnectionInfo({
          id: "frontend-2",
          connectionType: WebsocketConnectionTypeEnum.FRONTEND,
          currentAddress,
          shareSessionId: null,
        }),
      ],
      currentAddress,
      shareSessionId: null,
    });

    expect(getFrontendWebsocketAffinityId()).toBeNull();
  });
});
