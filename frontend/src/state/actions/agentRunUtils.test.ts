import {
  AgentRunStatusEnum,
  type AgentRun,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getRunInputNumber,
  getRunInputString,
  getRunLastUpdatedMs,
} from "./agentRunUtils";

function buildRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    profileId: null,
    status: AgentRunStatusEnum.completed,
    startedAt: "2024-01-01T00:00:00Z",
    finishedAt: "2024-01-01T00:00:10Z",
    inputs: {},
    outputs: null,
    toolCalls: [],
    cost: null,
    events: [],
    ...overrides,
  };
}

describe("agentRunUtils", () => {
  it("prefers latest event timestamp when available", () => {
    const run = buildRun({
      events: [
        { timestamp: "2024-01-01T00:00:02Z" },
        { timestamp: "2024-01-01T00:00:20Z" },
      ],
      finishedAt: "2024-01-01T00:00:05Z",
    });

    expect(getRunLastUpdatedMs(run)).toBe(
      Date.parse("2024-01-01T00:00:20Z"),
    );
  });

  it("falls back to finishedAt then startedAt when no valid events exist", () => {
    const run = buildRun({
      events: [{ timestamp: "not-a-date" }],
      finishedAt: "2024-01-01T00:00:15Z",
      startedAt: "2024-01-01T00:00:01Z",
    });

    expect(getRunLastUpdatedMs(run)).toBe(
      Date.parse("2024-01-01T00:00:15Z"),
    );
  });

  it("returns 0 when no timestamps parse", () => {
    const run = buildRun({
      events: [{ timestamp: "" }],
      finishedAt: "not-a-date",
      startedAt: "not-a-date",
    });

    expect(getRunLastUpdatedMs(run)).toBe(0);
  });

  it("reads run input string values when present", () => {
    const run = buildRun({
      inputs: { chatId: "  chat-1  " },
    });
    expect(getRunInputString(run, "chatId")).toBe("chat-1");
    expect(getRunInputString(run, "missing")).toBeNull();
  });

  it("reads run input numbers when finite", () => {
    const run = buildRun({
      inputs: { branchCreatedAt: 1234, nanValue: Number.NaN },
    });
    expect(getRunInputNumber(run, "branchCreatedAt")).toBe(1234);
    expect(getRunInputNumber(run, "nanValue")).toBeNull();
  });
});
