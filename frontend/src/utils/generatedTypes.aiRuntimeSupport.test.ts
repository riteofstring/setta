import {
  AgentRunStatusEnum,
  EngineTypeEnum,
  createAgentRun,
  createEngineConfig,
  createRunEvent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated AI/runtime support", () => {
  it("creates isolated engine and run helper defaults", () => {
    const firstEngine = createEngineConfig();
    const secondEngine = createEngineConfig();
    const firstRun = createAgentRun();
    const secondRun = createAgentRun();

    firstEngine.defaults.thinking = true;
    firstRun.events.push(createRunEvent({ id: "event-1" }));
    firstRun.toolCalls.push({ tool: "list" });

    expect(firstEngine.engineType).toBe(EngineTypeEnum.setta_llm);
    expect(secondEngine.defaults.thinking).toBeNull();
    expect(firstRun.status).toBe(AgentRunStatusEnum.queued);
    expect(secondRun.events).toHaveLength(0);
    expect(secondRun.toolCalls).toHaveLength(0);
  });
});
