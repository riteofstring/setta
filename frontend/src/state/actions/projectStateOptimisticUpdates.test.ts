import { usePendingOperations, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";

function seedProjectConfig({
  projectConfigId = "project-1",
  name = "Base",
}: {
  projectConfigId?: string;
  name?: string;
} = {}) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectConfigId,
      name,
    });
  });
}

async function flushOptimisticMutation(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("projectStateOptimisticUpdates", () => {
  beforeEach(() => {
    resetProjectStores();
    usePendingOperations.setState({ pending: [] });
    seedProjectConfig();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("applies optimistic updates immediately and acknowledges accepted operations", async () => {
    const opId = dispatchOptimisticProjectStateUpdate({
      projectConfigId: "project-1",
      apply: (state) => {
        state.projectConfig.name = "Optimistic";
      },
      send: async () => ({
        data: undefined,
        status: 200,
        hasResponse: true,
      }),
    });

    expect(useProjectState.getState().projectConfig.name).toBe("Optimistic");
    expect(
      usePendingOperations.getState().pending.map((op) => op.opId),
    ).toEqual([opId]);
    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(
      false,
    );

    await flushOptimisticMutation();

    expect(usePendingOperations.getState().pending[0]?.acknowledged).toBe(true);
  });

  it("rolls back failed optimistic updates and reapplies later pending operations", async () => {
    let resolveFirst:
      | ((value: {
          data: undefined;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    const firstResult = new Promise<{
      data: undefined;
      status: number;
      hasResponse: boolean;
    }>((resolve) => {
      resolveFirst = resolve;
    });

    dispatchOptimisticProjectStateUpdate({
      projectConfigId: "project-1",
      apply: (state) => {
        state.projectConfig.name = "First";
      },
      rollback: (state) => {
        state.projectConfig.name = "Base";
      },
      send: () => firstResult,
    });

    const replayOpId = dispatchOptimisticProjectStateUpdate({
      projectConfigId: "project-1",
      apply: (state) => {
        state.projectConfig.name = "Second";
      },
      send: () => undefined,
    });

    if (!resolveFirst) {
      throw new Error("First optimistic update resolver was not captured.");
    }
    resolveFirst({
      data: undefined,
      status: 500,
      hasResponse: true,
    });

    await flushOptimisticMutation();

    expect(useProjectState.getState().projectConfig.name).toBe("Second");
    expect(
      usePendingOperations.getState().pending.map((op) => op.opId),
    ).toEqual([replayOpId]);
  });

  it("drops acknowledged operations when the active project changes before the response arrives", async () => {
    let resolveAccepted:
      | ((value: {
          data: undefined;
          status: number;
          hasResponse: boolean;
        }) => void)
      | null = null;
    const acceptedResult = new Promise<{
      data: undefined;
      status: number;
      hasResponse: boolean;
    }>((resolve) => {
      resolveAccepted = resolve;
    });

    const opId = dispatchOptimisticProjectStateUpdate({
      projectConfigId: "project-1",
      apply: (state) => {
        state.projectConfig.name = "Project One";
      },
      send: () => acceptedResult,
    });

    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-2",
        name: "Other Project",
      });
    });

    if (!resolveAccepted) {
      throw new Error("Accepted optimistic update resolver was not captured.");
    }
    resolveAccepted({
      data: undefined,
      status: 200,
      hasResponse: true,
    });

    await flushOptimisticMutation();

    expect(useProjectState.getState().projectConfig.id).toBe("project-2");
    expect(
      usePendingOperations.getState().pending.map((op) => op.opId),
    ).not.toContain(opId);
  });
});
