import {
  UISettingRevealContentSchema,
  WebsocketConnectionTypeEnum,
  WebsocketMsgTypeForBackendEnum,
  createGetGitLogResponse,
  createGitCommit,
  createWebsocketConnectionInfo,
  createWebsocketMsgCurrentAddressUpdate,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated git and websocket support", () => {
  it("creates canonical git commit and log helpers", () => {
    const commit = createGitCommit({
      hash: "abc123",
      parents: ["def456"],
      authorName: "Setta",
      authorEmail: "setta@example.com",
      authorTimeMs: 123,
      subject: "Initial commit",
      decorations: ["HEAD -> main"],
    });
    const response = createGetGitLogResponse({
      repoRoot: "/repo",
      headBranch: "main",
      commits: [commit],
      offset: 0,
      pageSize: 1,
      nextOffset: null,
      hasMore: false,
      isCapped: false,
    });

    expect(response.commits[0]?.hash).toBe("abc123");
    expect(response.commits[0]?.decorations).toEqual(["HEAD -> main"]);
    expect(response.headBranch).toBe("main");
  });

  it("creates websocket connection and current-address update helpers", () => {
    const connection = createWebsocketConnectionInfo({
      id: "main",
      connectionType: WebsocketConnectionTypeEnum.SERVER,
      currentAddress: "/project",
    });
    const currentAddressUpdate = createWebsocketMsgCurrentAddressUpdate({
      content: "/project",
    });

    expect(connection.connectionType).toBe(WebsocketConnectionTypeEnum.SERVER);
    expect(connection.shareSessionId).toBeNull();
    expect(currentAddressUpdate.messageType).toBe(
      WebsocketMsgTypeForBackendEnum.CurrentAddressUpdate,
    );
    expect(currentAddressUpdate.content).toBe("/project");
  });

  it("validates UISettingReveal payloads with the canonical schema", () => {
    const validResult = UISettingRevealContentSchema.safeParse({
      projectConfigId: "project-1",
      requestId: "request-1",
      reveals: [
        {
          settingId: "setting-1",
          side: "left",
          strategy: "dom_anchor",
          revealActivationSteps: [{ type: "click", itemValue: "setting-1" }],
        },
      ],
    });
    const invalidResult = UISettingRevealContentSchema.safeParse({
      projectConfigId: "project-1",
      requestId: 42,
      reveals: "not-an-array",
    });

    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.durationMs).toBe(3000);
      expect(validResult.data.reveals[0]?.revealActivationSteps).toEqual([
        { type: "click", itemValue: "setting-1" },
      ]);
    }
    expect(invalidResult.success).toBe(false);
  });
});
