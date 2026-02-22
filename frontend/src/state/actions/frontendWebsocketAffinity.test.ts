import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
  getFrontendWebsocketAffinityId,
  setActiveFrontendWebsocketAffinityGeneration,
  setFrontendWebsocketAffinityId,
  updateFrontendWebsocketAffinity,
} from "state/actions/frontendWebsocketAffinity";
import {
  WebsocketConnectionTypeEnum,
  createWebsocketConnectionInfo,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it } from "vitest";

describe("frontendWebsocketAffinity", () => {
  beforeEach(() => {
    setActiveFrontendWebsocketAffinityGeneration(0);
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

  it("ignores stale generation updates", () => {
    const currentAddress = buildFrontendAffinityCurrentAddress("/project-a");
    setActiveFrontendWebsocketAffinityGeneration(2);
    setFrontendWebsocketAffinityId("frontend-stale", 1);
    updateFrontendWebsocketAffinity({
      connections: [
        createWebsocketConnectionInfo({
          id: "frontend-stale",
          connectionType: WebsocketConnectionTypeEnum.FRONTEND,
          currentAddress,
          shareSessionId: null,
        }),
      ],
      currentAddress,
      shareSessionId: null,
      socketGeneration: 1,
    });

    expect(getFrontendWebsocketAffinityId()).toBeNull();
  });

  it("repopulates affinity when active generation receives a valid snapshot", () => {
    const currentAddress = buildFrontendAffinityCurrentAddress("/project-a");
    setActiveFrontendWebsocketAffinityGeneration(1);
    setFrontendWebsocketAffinityId("frontend-old", 1);
    setActiveFrontendWebsocketAffinityGeneration(2);
    updateFrontendWebsocketAffinity({
      connections: [
        createWebsocketConnectionInfo({
          id: "frontend-new",
          connectionType: WebsocketConnectionTypeEnum.FRONTEND,
          currentAddress,
          shareSessionId: null,
        }),
      ],
      currentAddress,
      shareSessionId: null,
      socketGeneration: 2,
    });

    expect(getFrontendWebsocketAffinityId()).toBe("frontend-new");
  });
});
