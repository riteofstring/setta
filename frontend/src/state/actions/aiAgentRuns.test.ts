import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgentRunStatusEnum,
  createAgentRun,
  type AgentRun,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { receiveAgentRunUpdate } from "./aiAgentRuns";

function getAgentRunIds(runs: AgentRun[]): string[] {
  return runs.map((run) => run.id);
}

describe("aiAgentRuns", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("prepends new agent runs when no prior run exists", () => {
    // Websocket-delivered runs should become visible immediately.
    receiveAgentRunUpdate(
      createAgentRun({
        id: "run-1",
        status: AgentRunStatusEnum.running,
      }),
    );

    expect(getAgentRunIds(useAIStore.getState().agentRuns)).toEqual(["run-1"]);
  });

  it("replaces existing agent runs in place by id", () => {
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "run-1",
          status: AgentRunStatusEnum.running,
        }),
        createAgentRun({
          id: "run-2",
          status: AgentRunStatusEnum.completed,
        }),
      ],
    });

    // Incremental updates should refresh the existing run without reordering the list.
    receiveAgentRunUpdate(
      createAgentRun({
        id: "run-1",
        status: AgentRunStatusEnum.completed,
      }),
    );

    const state = useAIStore.getState();
    expect(getAgentRunIds(state.agentRuns)).toEqual(["run-1", "run-2"]);
    expect(state.agentRuns[0]?.status).toBe(AgentRunStatusEnum.completed);
  });
});
