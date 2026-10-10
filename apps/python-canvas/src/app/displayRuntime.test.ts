import fixture from "@setta/python-canvas/project-snapshot-v2.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runGeneratedProgram } from "../api/client";
import { parseProjectSnapshotV2 } from "../api/runtimeContract";
import { createDisplayRuntime, initialDisplayState } from "./displayRuntime";

vi.mock("../api/client", () => ({ runGeneratedProgram: vi.fn() }));

const snapshot = parseProjectSnapshotV2(fixture);
const note = {
  id: "notes",
  kind: "markdown",
  title: "Notes",
  caption: "",
  text: "Last good result",
};
const success = {
  projectId: snapshot.project.id,
  revision: snapshot.project.revision,
  stdout: `SETTA_DISPLAY ${JSON.stringify({ version: 1, panels: [note] })}`,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
  terminationReason: "exited" as const,
  exitCode: 0,
  elapsedMilliseconds: 20,
};

describe("visual experiment execution", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retains good results on failure and recovers on a later run", async () => {
    let state = initialDisplayState;
    const runtime = createDisplayRuntime({
      runAfterTargetFlush: async (operation) => operation(snapshot),
      updateState: (next) => {
        state = next;
      },
    });
    vi.mocked(runGeneratedProgram).mockResolvedValueOnce(success);
    runtime.setRevision(snapshot.project.revision);
    runtime.run();
    runtime.run();
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(runGeneratedProgram).toHaveBeenCalledTimes(1);
    expect(state.panels.notes?.panel).toEqual(note);
    runtime.setRevision(snapshot.project.revision + 1);
    vi.mocked(runGeneratedProgram).mockResolvedValueOnce({
      ...success,
      exitCode: 1,
      stdout: "",
      stderr: "ValueError: choose a color",
    });
    runtime.run();
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(state.error).toContain("needs a tweak");
    expect(state.log).toContain("choose a color");
    expect(state.panels.notes?.panel).toEqual(note);
    expect(state.panels.notes?.revision).not.toBe(state.currentRevision);
    vi.mocked(runGeneratedProgram).mockResolvedValueOnce(success);
    runtime.run();
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(state.error).toBeNull();
    runtime.dispose();
  });

  it("waits for pending edits and aborts when its project is disposed", async () => {
    let finishFlush = () => {};
    const flush = new Promise<void>((resolve) => {
      finishFlush = resolve;
    });
    const states = vi.fn();
    const runtime = createDisplayRuntime({
      runAfterTargetFlush: async (operation) => {
        await flush;
        await operation(snapshot);
      },
      updateState: states,
    });
    vi.mocked(runGeneratedProgram).mockImplementation(
      (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    runtime.run();
    expect(runGeneratedProgram).not.toHaveBeenCalled();
    finishFlush();
    await vi.waitFor(() =>
      expect(runGeneratedProgram).toHaveBeenCalledTimes(1),
    );
    const signal = vi.mocked(runGeneratedProgram).mock.calls[0]?.[1];
    const before = states.mock.calls.length;
    runtime.dispose();
    expect(signal?.aborted).toBe(true);
    await flush;
    expect(states).toHaveBeenCalledTimes(before);
  });
});
