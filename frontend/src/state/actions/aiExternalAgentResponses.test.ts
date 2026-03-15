import {
  route_respond_external_agent_approval,
  route_respond_external_agent_question,
} from "utils/generatedEndpoints";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  respondExternalAgentApproval,
  respondExternalAgentQuestion,
} from "./aiExternalAgentResponses";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_respond_external_agent_approval: vi.fn(),
    route_respond_external_agent_question: vi.fn(),
  };
});

const mockedRouteRespondExternalAgentApproval = vi.mocked(
  route_respond_external_agent_approval,
);
const mockedRouteRespondExternalAgentQuestion = vi.mocked(
  route_respond_external_agent_question,
);

describe("aiExternalAgentResponses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when approval submission succeeds", async () => {
    mockedRouteRespondExternalAgentApproval.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    await expect(
      respondExternalAgentApproval("approval-1", true),
    ).resolves.toBe(true);
    expect(mockedRouteRespondExternalAgentApproval).toHaveBeenCalledWith({
      approvalId: "approval-1",
      approved: true,
    });
  });

  it("returns false when question submission fails", async () => {
    mockedRouteRespondExternalAgentQuestion.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: { detail: "failed" },
    });

    await expect(
      respondExternalAgentQuestion("tool-1", { answer: "yes" }),
    ).resolves.toBe(false);
    expect(mockedRouteRespondExternalAgentQuestion).toHaveBeenCalledWith({
      toolCallId: "tool-1",
      answers: { answer: "yes" },
    });
  });
});
