import {
  ButtonActionModeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  HTTPRequestMethodEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  fetch: vi.fn(),
  post: vi.fn(),
  buildSettaApiPayload: vi.fn(),
  sendRealtimeDependencyEvent: vi.fn(),
}));

vi.mock("utils/requestTransport", () => ({
  post: mocked.post,
}));

vi.mock("utils/settaApiPresets", () => ({
  buildSettaApiPayload: mocked.buildSettaApiPayload,
}));

vi.mock("state/actions/websocketReceive", () => ({
  sendRealtimeDependencyEvent: mocked.sendRealtimeDependencyEvent,
}));

import {
  dispatchButtonParamAction,
  sendButtonSettaRequest,
  type ButtonParamActionConfig,
} from "./buttonParamActions";

describe("buttonParamActions", () => {
  beforeEach(() => {
    mocked.fetch.mockReset();
    mocked.post.mockReset();
    mocked.buildSettaApiPayload.mockReset();
    mocked.sendRealtimeDependencyEvent.mockReset();
    vi.stubGlobal("fetch", mocked.fetch);
  });

  it("does not post blank Setta API routes", () => {
    sendButtonSettaRequest({
      requestUrl: "   ",
      requestBody: '{"alpha":1}',
    });

    expect(mocked.buildSettaApiPayload).not.toHaveBeenCalled();
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it("trims the route before building and posting the request payload", () => {
    mocked.buildSettaApiPayload.mockReturnValue({
      alpha: 1,
      beta: "two",
    });

    sendButtonSettaRequest({
      requestUrl: "  /customRoute  ",
      requestBody: '{"alpha":1,"beta":"two"}',
    });

    expect(mocked.buildSettaApiPayload).toHaveBeenCalledWith(
      "/customRoute",
      '{"alpha":1,"beta":"two"}',
    );
    expect(mocked.post).toHaveBeenCalledWith("/customRoute", {
      alpha: 1,
      beta: "two",
    });
  });

  it("dispatches HTTP requests without bodies for GET and HEAD", () => {
    dispatchButtonParamAction({
      config: createButtonConfig({
        actionMode: ButtonActionModeEnum.HTTP_REQUEST,
        requestMethod: HTTPRequestMethodEnum.GET,
        requestUrl: " https://example.test/run ",
        requestHeaderKey: "X-Setta",
        requestHeaderValue: "yes",
        requestBody: '{"ignored":true}',
      }),
      sectionId: "section-a",
      controlParamId: "button-a",
    });

    expect(mocked.fetch).toHaveBeenCalledWith("https://example.test/run", {
      method: HTTPRequestMethodEnum.GET,
      headers: { "X-Setta": "yes" },
    });
  });

  it("dispatches websocket listener actions for non-HTTP and non-Setta modes", () => {
    dispatchButtonParamAction({
      config: createButtonConfig({
        actionMode: ButtonActionModeEnum.WEBSOCKET_LISTENER,
      }),
      sectionId: "section-a",
      controlParamId: "button-a",
    });

    expect(mocked.sendRealtimeDependencyEvent).toHaveBeenCalledWith({
      dependencyKey: {
        type: DependencyKeyTypeEnum.Section,
        sectionId: "section-a",
      },
      payload: {
        type: DependencyValueTypeEnum.Literal,
        payload: JSON.stringify({
          actionMode: ButtonActionModeEnum.WEBSOCKET_LISTENER,
          controlParamId: "button-a",
        }),
      },
    });
  });
});

function createButtonConfig(
  overrides: Partial<ButtonParamActionConfig> = {},
): ButtonParamActionConfig {
  return {
    actionMode: ButtonActionModeEnum.SETTA_API,
    requestMethod: HTTPRequestMethodEnum.POST,
    requestUrl: "",
    requestHeaderKey: "",
    requestHeaderValue: "",
    requestBody: "",
    ...overrides,
  };
}
