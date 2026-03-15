import type { ListenerCoverageRecord } from "state/definitions";
import {
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendBinaryMessageMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const dependencyKeyCoveredMock = vi.hoisted(() => vi.fn());
const getCurrProjectConfigIdMock = vi.hoisted(() => vi.fn());
const getListenerCoverageRecordMock = vi.hoisted(() => vi.fn());

vi.mock("./websocketRuntime", () => ({
  sendBinaryMessage: sendBinaryMessageMock,
  sendMessage: sendMessageMock,
}));

vi.mock("./listenerCoverage", () => ({
  dependencyKeyCovered: dependencyKeyCoveredMock,
  getListenerCoverageRecord: getListenerCoverageRecordMock,
}));

vi.mock("./sectionEffectiveImplSelectors", () => ({
  getCurrProjectConfigId: getCurrProjectConfigIdMock,
}));

import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionLiteral,
} from "./websocketRealtimeDispatch";

describe("websocketRealtimeDispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrProjectConfigIdMock.mockReturnValue("project-current");
    dependencyKeyCoveredMock.mockReturnValue(true);
    getListenerCoverageRecordMock.mockReturnValue(undefined);
  });

  it("sends realtime dependency events when listener coverage is unknown", () => {
    sendRealtimeDependencyEvent(
      {
        dependencyKey: {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-unknown",
        },
        payload: {
          type: DependencyValueTypeEnum.Literal,
          payload: "hello",
        },
        timestampMs: 1234,
      },
      "project-1",
    );

    expect(sendMessageMock).toHaveBeenCalledWith({
      id: null,
      messageType: "RealtimeDependencyEvent",
      content: {
        projectConfigId: "project-1",
        dependencyEvent: {
          dependencyKey: {
            type: DependencyKeyTypeEnum.Section,
            sectionId: "section-unknown",
          },
          payload: {
            type: DependencyValueTypeEnum.Literal,
            payload: "hello",
          },
          timestampMs: 1234,
        },
      },
    });
  });

  it("does not send dependency events excluded by known coverage", () => {
    getListenerCoverageRecordMock.mockReturnValue({
      hasRealtimeWildcard: false,
      dependenciesByKey: {},
    } satisfies ListenerCoverageRecord);
    dependencyKeyCoveredMock.mockReturnValue(false);

    sendRealtimeDependencyEvent(
      {
        dependencyKey: {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-excluded",
        },
        payload: {
          type: DependencyValueTypeEnum.Literal,
          payload: "hidden",
        },
      },
      "project-1",
    );

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendBinaryMessageMock).not.toHaveBeenCalled();
  });

  it("sends section literal updates only when coverage is known and included", () => {
    getListenerCoverageRecordMock.mockReturnValue({
      hasRealtimeWildcard: false,
      dependenciesByKey: {
        "section-covered::": {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-covered",
        },
      },
    } satisfies ListenerCoverageRecord);
    dependencyKeyCoveredMock.mockReturnValue(true);

    sendRealtimeSectionLiteral("section-covered", "value", "project-1");

    expect(sendMessageMock).toHaveBeenCalledWith({
      id: null,
      messageType: "RealtimeUIChange",
      content: {
        projectConfigId: "project-1",
        dependencyKey: {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-covered",
        },
        value: {
          type: DependencyValueTypeEnum.Literal,
          payload: "value",
        },
      },
    });
  });

  it("uses binary websocket frames for binary dependency events", () => {
    sendRealtimeDependencyEvent(
      {
        dependencyKey: {
          type: DependencyKeyTypeEnum.Section,
          sectionId: "section-binary",
        },
        payload: {
          type: DependencyValueTypeEnum.Binary,
          payload: {
            contentId: "content-1",
            byteLength: 4,
            mimeType: "image/png",
          },
        },
        binaryPayload: new ArrayBuffer(4),
      },
      "project-1",
    );

    expect(sendBinaryMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
