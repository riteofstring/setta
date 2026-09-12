import { describe, expect, it, vi } from "vitest";

import { makeProject } from "../testProject";
import { RuntimeInitializationCoordinator } from "./runtimeInitialization";
import { initialRuntimeViewState, type RuntimeViewState } from "./runtimeState";

function startupProject() {
  const project = makeProject();
  const section = project.sections["handler-main"]!;
  const layout = project.layout.topLevelSections["handler-main"]!;
  project.bindings = [
    {
      ...project.bindings[0]!,
      arguments: { nested: { second: 2, first: 1 } },
      id: "startup-input",
      materialization: {
        retention: "lastSuccessful",
        startup: "whenStale",
      },
      outputs: { result: {} },
      trigger: { event: "change", kind: "event", sectionId: "input-main" },
    },
    {
      ...project.bindings[0]!,
      id: "manual-input",
      materialization: { retention: "session", startup: "manual" },
      outputs: { result: {} },
      trigger: { event: "change", kind: "event", sectionId: "input-main" },
    },
    {
      ...project.bindings[0]!,
      id: "ordinary-input",
      outputs: { result: {} },
      trigger: { event: "change", kind: "event", sectionId: "input-main" },
    },
  ];
  project.sections = {
    ...project.sections,
    "handler-main": {
      ...section,
      data: { bindingId: "startup-input" },
    },
    "handler-manual": {
      ...section,
      data: { bindingId: "manual-input" },
      id: "handler-manual",
    },
    "handler-ordinary": {
      ...section,
      data: { bindingId: "ordinary-input" },
      id: "handler-ordinary",
    },
  };
  project.layout.topLevelSections = {
    ...project.layout.topLevelSections,
    "handler-manual": { ...layout, x: layout.x + 320 },
    "handler-ordinary": { ...layout, x: layout.x + 640 },
  };
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

  it("initializes an automatic join again when its ancestor graph changes", async () => {
    let project = makeProject();
    const root = {
      ...project.bindings[0]!,
      id: "pipeline-root",
      outputs: { result: {} },
      trigger: {
        event: "change" as const,
        kind: "event" as const,
        sectionId: "input-main",
      },
    };
    const target = {
      ...project.bindings[0]!,
      id: "binding-main",
      materialization: {
        retention: "lastSuccessful" as const,
        startup: "whenStale" as const,
      },
      trigger: {
        inputs: {
          input: { bindingId: root.id, output: "result" },
        },
        kind: "join" as const,
        mode: "all" as const,
      },
    };
    project = {
      ...project,
      bindings: [root, target],
      layout: {
        ...project.layout,
        topLevelSections: {
          ...project.layout.topLevelSections,
          "handler-root": {
            ...project.layout.topLevelSections["handler-main"]!,
            x: 920,
          },
        },
      },
      sections: {
        ...project.sections,
        "handler-root": {
          ...project.sections["handler-main"]!,
          data: { bindingId: root.id },
          id: "handler-root",
        },
      },
    };
    const runtime = readyRuntime("session-one");
    const send = vi.fn(() => true);
    const coordinator = new RuntimeInitializationCoordinator({
      getProject: () => project,
      getRuntime: () => runtime,
      send,
    });

    await expect(
      coordinator.initialize("input-main", "change", () => ({ value: 1 })),
    ).resolves.toBe(true);
    await expect(
      coordinator.initialize("input-main", "change", () => ({ value: 1 })),
    ).resolves.toBe(false);

    project = {
      ...project,
      bindings: [{ ...root, handler: "revised_root" }, target],
    };
    await expect(
      coordinator.initialize("input-main", "change", () => ({ value: 1 })),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
