import { describe, expect, it, vi } from "vitest";

import { makeProject } from "../testProject";
import { RuntimeInitializationCoordinator } from "./runtimeInitialization";
import { initialRuntimeViewState, type RuntimeViewState } from "./runtimeState";

function startupProject() {
  const project = makeProject();
  project.bindings = [
    {
      ...project.bindings[0]!,
      arguments: { nested: { second: 2, first: 1 } },
      id: "startup-input",
      materialization: {
        retention: "lastSuccessful",
        startup: "whenStale",
      },
      trigger: { event: "change", sectionId: "input-main" },
    },
    {
      ...project.bindings[0]!,
      id: "manual-input",
      materialization: { retention: "session", startup: "manual" },
      trigger: { event: "change", sectionId: "input-main" },
    },
    {
      ...project.bindings[0]!,
      id: "ordinary-input",
      trigger: { event: "change", sectionId: "input-main" },
    },
  ];
  return project;
}

function readyRuntime(sessionId: string): RuntimeViewState {
  return {
    ...initialRuntimeViewState,
    connection: "connected",
    sessionId,
    workerState: "ready",
  };
}

describe("runtime initialization coordinator", () => {
  it("sends each eligible binding configuration once per ready session", async () => {
    let project = startupProject();
    let runtime = initialRuntimeViewState;
    const send = vi.fn(() => true);
    const createPayload = vi.fn(() => ({ value: "initial" }));
    const coordinator = new RuntimeInitializationCoordinator({
      getProject: () => project,
      getRuntime: () => runtime,
      send,
    });

    await expect(
      coordinator.initialize("input-main", "change", createPayload),
    ).resolves.toBe(false);
    expect(createPayload).not.toHaveBeenCalled();

    runtime = readyRuntime("session-one");
    await expect(
      coordinator.initialize("input-main", "change", createPayload),
    ).resolves.toBe(true);
    await expect(
      coordinator.initialize("input-main", "change", createPayload),
    ).resolves.toBe(false);
    expect(createPayload).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      cause: "startup",
      event: "change",
      payload: { value: "initial" },
      sectionId: "input-main",
      sessionId: "session-one",
      type: "event",
    });

    const reordered = structuredClone(project);
    reordered.bindings[0]!.arguments = {
      nested: { first: 1, second: 2 },
    };
    project = reordered;
    await expect(
      coordinator.initialize("input-main", "change", createPayload),
    ).resolves.toBe(false);

    runtime = readyRuntime("session-two");
    await expect(
      coordinator.initialize("input-main", "change", createPayload),
    ).resolves.toBe(true);
    expect(createPayload).toHaveBeenCalledTimes(2);
  });

  it("releases failed sends so the same configuration can retry", async () => {
    const project = startupProject();
    const runtime = readyRuntime("session-one");
    const send = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const coordinator = new RuntimeInitializationCoordinator({
      getProject: () => project,
      getRuntime: () => runtime,
      send,
    });

    await expect(
      coordinator.initialize("input-main", "change", () => ({ value: 1 })),
    ).resolves.toBe(false);
    await expect(
      coordinator.initialize("input-main", "change", () => ({ value: 1 })),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("drops an in-flight payload when its binding configuration changes", async () => {
    let project = startupProject();
    const runtime = readyRuntime("session-one");
    const send = vi.fn(() => true);
    let finishPayload: (payload: { value: string }) => void = () => {};
    const payload = new Promise<{ value: string }>((resolve) => {
      finishPayload = resolve;
    });
    const coordinator = new RuntimeInitializationCoordinator({
      getProject: () => project,
      getRuntime: () => runtime,
      send,
    });

    const pending = coordinator.initialize(
      "input-main",
      "change",
      () => payload,
    );
    const changed = structuredClone(project);
    changed.bindings[0]!.handler = "run_changed";
    project = changed;
    finishPayload({ value: "stale" });

    await expect(pending).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    await expect(
      coordinator.initialize("input-main", "change", () => ({
        value: "current",
      })),
    ).resolves.toBe(true);
  });
});
