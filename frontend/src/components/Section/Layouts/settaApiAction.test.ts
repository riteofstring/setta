import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  post: vi.fn(),
  buildSettaApiPayload: vi.fn(),
}));

vi.mock("utils/requestTransport", () => ({
  post: mocked.post,
}));

vi.mock("utils/settaApiPresets", () => ({
  buildSettaApiPayload: mocked.buildSettaApiPayload,
}));

import { sendButtonSettaRequest } from "./settaApiAction";

describe("settaApiAction", () => {
  beforeEach(() => {
    mocked.post.mockReset();
    mocked.buildSettaApiPayload.mockReset();
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
});
