import {
  buildFrontendAffinityCurrentAddress,
  clearFrontendWebsocketAffinity,
  getFrontendAffinityToken,
  setActiveFrontendWebsocketAffinityGeneration,
  setFrontendAffinityToken,
  waitForFrontendAffinityToken,
} from "state/actions/frontendWebsocketAffinity";
import { beforeEach, describe, expect, it } from "vitest";

describe("frontendWebsocketAffinity", () => {
  beforeEach(() => {
    setActiveFrontendWebsocketAffinityGeneration(0);
    clearFrontendWebsocketAffinity();
  });

  it("builds a normalized currentAddress without embedding affinity capability state", () => {
    const first = buildFrontendAffinityCurrentAddress("/project-a");
    const second = buildFrontendAffinityCurrentAddress("/project-a");
    const standaloneChat =
      buildFrontendAffinityCurrentAddress("/project-a/chat");
    const standaloneChatThread = buildFrontendAffinityCurrentAddress(
      "/project-a/chat/thread-123",
    );
    const standaloneSection = buildFrontendAffinityCurrentAddress(
      "/project-a/section/blue_star",
    );
    const root = buildFrontendAffinityCurrentAddress("   ");

    expect(first).toBe(second);
    expect(first).toBe("/project-a");
    expect(standaloneChat).toBe("/project-a/chat");
    expect(standaloneChatThread).toBe("/project-a/chat/thread-123");
    expect(standaloneSection).toBe("/project-a/section/blue_star");
    expect(root).toBe("/");
  });

  it("keeps affinity empty until FrontendIdentity arrives for the active generation", () => {
    setActiveFrontendWebsocketAffinityGeneration(2);
    expect(getFrontendAffinityToken()).toBeNull();
    setFrontendAffinityToken("affinity-token", 2);
    expect(getFrontendAffinityToken()).toBe("affinity-token");
  });

  it("ignores stale generation updates", () => {
    setActiveFrontendWebsocketAffinityGeneration(2);
    setFrontendAffinityToken("frontend-stale", 1);
    expect(getFrontendAffinityToken()).toBeNull();
  });

  it("waits for FrontendIdentity on the active generation", async () => {
    setActiveFrontendWebsocketAffinityGeneration(2);
    const waitPromise = waitForFrontendAffinityToken({
      timeoutMs: 120,
    });

    setTimeout(() => {
      setFrontendAffinityToken("frontend-ready", 2);
    }, 20);

    await expect(waitPromise).resolves.toBe("frontend-ready");
  });

  it("fails fast when FrontendIdentity is not ready within timeout", async () => {
    setActiveFrontendWebsocketAffinityGeneration(3);
    await expect(
      waitForFrontendAffinityToken({
        timeoutMs: 15,
      }),
    ).rejects.toThrow("Frontend identity not ready");
  });

  it("keeps waiting tied to the active generation", async () => {
    setActiveFrontendWebsocketAffinityGeneration(4);
    const waitPromise = waitForFrontendAffinityToken({
      timeoutMs: 120,
    });
    setActiveFrontendWebsocketAffinityGeneration(5);
    setFrontendAffinityToken("affinity-token", 2);
    setFrontendAffinityToken("affinity-token-new", 5);
    await expect(waitPromise).resolves.toBe("affinity-token-new");
  });
});
