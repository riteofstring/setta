import type { EasyRun } from "@generated/backend";
import type { EasyRunSteerResult } from "@shared/easy-run-ipc";
import { describe, expect, test, vi } from "vitest";

import {
  performEasyButtonSubmission,
  submitCompletedSpeechTranscript,
} from "./easy-button-submission";

const workspaceId = "workspace_api";
const transcript = "  Provider final, unchanged.  ";

describe("Easy Button submission", () => {
  test("routes exact start and steering text through their existing actions", async () => {
    const run = { id: "easy_run_api" } as EasyRun;
    const start = vi.fn().mockResolvedValue(run);
    const steer = vi.fn().mockResolvedValue({ kind: "success", run });

    await expect(
      performEasyButtonSubmission({
        intent: "start",
        requestText: transcript,
        start,
        steer,
        workspaceId,
      }),
    ).resolves.toBeNull();
    await expect(
      performEasyButtonSubmission({
        intent: "steer",
        requestText: transcript,
        start,
        steer,
        workspaceId,
      }),
    ).resolves.toEqual({ kind: "success", run });

    expect(start).toHaveBeenCalledExactlyOnceWith(workspaceId, transcript);
    expect(steer).toHaveBeenCalledExactlyOnceWith(workspaceId, transcript);
  });

  test.each(["start", "steer"] as const)(
    "clears the preserved draft after successful speech %s",
    async (intent) => {
      const harness = speechSubmissionHarness();

      await submitCompletedSpeechTranscript({ ...harness.options, intent });

      expect(harness.submittedText()).toBe(transcript);
      expect(harness.inputValues).toEqual([""]);
      expect(harness.pendingValues).toEqual([true, false]);
      expect(harness.input.focus).not.toHaveBeenCalled();
      expect(harness.input.blur).not.toHaveBeenCalled();
    },
  );

  test.each(["start", "steer"] as const)(
    "restores the final transcript after ordinary speech %s rejection",
    async (intent) => {
      const rejection = new Error(`${intent} rejected`);
      const harness = speechSubmissionHarness({ reject: rejection });

      await expect(submitCompletedSpeechTranscript({ ...harness.options, intent })).rejects.toBe(
        rejection,
      );

      expect(harness.submittedText()).toBe(transcript);
      expect(harness.inputValues).toEqual([transcript]);
      expect(harness.pendingValues).toEqual([true, false]);
      expect(harness.input.focus).not.toHaveBeenCalled();
      expect(harness.input.blur).not.toHaveBeenCalled();
    },
  );

  test("keeps accepted steering cleared and unfocused when focus projection fails", async () => {
    const harness = speechSubmissionHarness({
      steerResult: {
        code: "steer_easy_run_focus_update_failed",
        kind: "failure",
        message: "steering accepted but focus update failed: narrator unavailable",
        operationApplied: true,
      },
    });

    await submitCompletedSpeechTranscript({ ...harness.options, intent: "steer" });

    expect(harness.submittedText()).toBe(transcript);
    expect(harness.inputValues).toEqual([""]);
    expect(harness.pendingValues).toEqual([true, false]);
    expect(harness.input.focus).not.toHaveBeenCalled();
    expect(harness.input.blur).toHaveBeenCalledOnce();
  });

  test("restores a completed transcript when steering reports an unapplied failure", async () => {
    const harness = speechSubmissionHarness({
      steerResult: {
        code: "steer_easy_run_failed",
        kind: "failure",
        message: "steering was rejected",
        operationApplied: false,
      },
    });

    await expect(
      submitCompletedSpeechTranscript({ ...harness.options, intent: "steer" }),
    ).rejects.toThrow("steering was rejected");

    expect(harness.submittedText()).toBe(transcript);
    expect(harness.inputValues).toEqual([transcript]);
    expect(harness.pendingValues).toEqual([true, false]);
    expect(harness.input.focus).not.toHaveBeenCalled();
    expect(harness.input.blur).not.toHaveBeenCalled();
  });
});

function speechSubmissionHarness(
  overrides: {
    reject?: Error;
    steerResult?: EasyRunSteerResult;
  } = {},
) {
  const input = { blur: vi.fn(), focus: vi.fn() };
  const inputValues: string[] = [];
  const pendingValues: boolean[] = [];
  const start = overrides.reject
    ? vi.fn().mockRejectedValue(overrides.reject)
    : vi.fn().mockResolvedValue({ id: "easy_run_api" } as EasyRun);
  const steer = overrides.reject
    ? vi.fn().mockRejectedValue(overrides.reject)
    : vi.fn().mockResolvedValue(overrides.steerResult ?? defaultSteer());
  return {
    input,
    inputValues,
    options: {
      inputRef: { current: input as unknown as HTMLInputElement },
      setInputValue: (value: string) => inputValues.push(value),
      setPendingAction: (pending: boolean) => pendingValues.push(pending),
      start,
      steer,
      transcript,
      workspaceId,
    },
    pendingValues,
    submittedText: () => (start.mock.calls[0]?.[1] ?? steer.mock.calls[0]?.[1]) as string,
  };
}

function defaultSteer() {
  return { kind: "success" as const, run: { id: "easy_run_api" } as EasyRun };
}
