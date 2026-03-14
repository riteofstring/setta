import {
  ChatRoleEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitChatSendAction,
  emitChatStopAction,
} from "./chatAreaRealtimeActions";

const { sendRealtimeDependencyEvent } = vi.hoisted(() => ({
  sendRealtimeDependencyEvent: vi.fn(),
}));

vi.mock("state/actions/websocketReceive", () => ({
  sendRealtimeDependencyEvent,
}));

describe("chatAreaRealtimeActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits section send actions through realtime dependencies", () => {
    emitChatSendAction({
      sectionId: "section-1",
      messageId: "msg-1",
      text: "Ship it",
      attachments: [],
      role: ChatRoleEnum.user,
      managed: true,
      timestampMs: 123,
    });

    expect(sendRealtimeDependencyEvent).toHaveBeenCalledTimes(1);
    const [payload] = sendRealtimeDependencyEvent.mock.calls[0] as [
      {
        dependencyKey: { sectionId: string; type: string };
        payload: { payload: string; type: string };
        timestampMs: number;
      },
    ];
    expect(payload).toMatchObject({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-1",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
      },
      timestampMs: 123,
    });
    expect(JSON.parse(payload.payload.payload)).toEqual({
      action: "send",
      sectionId: "section-1",
      messageId: "msg-1",
      text: "Ship it",
      attachments: [],
      role: ChatRoleEnum.user,
      managed: true,
      timestampMs: 123,
    });
  });

  it("emits section stop actions through realtime dependencies", () => {
    emitChatStopAction({
      sectionId: "section-2",
      managed: false,
      timestampMs: 456,
    });

    expect(sendRealtimeDependencyEvent).toHaveBeenCalledTimes(1);
    const [payload] = sendRealtimeDependencyEvent.mock.calls[0] as [
      {
        dependencyKey: { sectionId: string; type: string };
        payload: { payload: string; type: string };
        timestampMs: number;
      },
    ];
    expect(payload).toMatchObject({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-2",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
      },
      timestampMs: 456,
    });
    expect(JSON.parse(payload.payload.payload)).toEqual({
      action: "stop",
      sectionId: "section-2",
      managed: false,
      timestampMs: 456,
    });
  });
});
