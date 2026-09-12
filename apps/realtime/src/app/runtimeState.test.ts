import { describe, expect, it } from "vitest";

import type {
  InvocationIdentity,
  RuntimeEnvelope,
} from "../backend/generatedContract";
import { makeProject } from "../testProject";
import {
  applyRuntimeEnvelope,
  beginRuntimeReplacement,
  initialRuntimeViewState,
  resolveRuntimeValue,
  runtimeCanInvoke,
  runtimeValueKey,
} from "./runtimeState";

function identity(sequence: number, invocationId: string): InvocationIdentity {
  return {
    bindingId: "binding-main",
    invocationId,
    sequence,
    sessionId: "session-main",
  };
}

function apply(
  state: typeof initialRuntimeViewState,
  envelope: RuntimeEnvelope,
) {
  return applyRuntimeEnvelope(state, envelope, makeProject());
}

describe("runtime state", () => {
  it("publishes a completed output ahead of a newer queued invocation", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {},
        publishedByBinding: {
          "binding-main": identity(2, "invocation-baseline"),
        },
        retainedByBinding: { "binding-main": true },
        sessionId: "session-main",
        values: { [runtimeValueKey("output-main", "value")]: "baseline" },
        workerState: "ready",
      },
      type: "snapshot",
    });
    state = apply(state, {
      invocation: {
        error: null,
        identity: identity(4, "invocation-new"),
        state: "running",
      },
      type: "invocation",
    });
    const completed = apply(state, {
      type: "update",
      update: {
        identity: identity(3, "invocation-old"),
        message: "complete",
        outputs: { result: "useful" },
        progress: 1,
      },
    });

    expect(completed.values[runtimeValueKey("output-main", "value")]).toBe(
      "useful",
    );
    expect(completed.latestByBinding["binding-main"]).toEqual(
      identity(4, "invocation-new"),
    );
    expect(completed.publishedByBinding["binding-main"]).toEqual(
      identity(3, "invocation-old"),
    );
    expect(completed.retainedByBinding["binding-main"]).toBe(false);

    const newer = apply(completed, {
      type: "update",
      update: {
        identity: identity(4, "invocation-new"),
        message: "complete",
        outputs: { result: "fresh", status: "Complete" },
        progress: 1,
      },
    });
    expect(newer.values[runtimeValueKey("output-main", "value")]).toBe("fresh");
    expect(newer.values[runtimeValueKey("status-main", "message")]).toBe(
      "Complete",
    );

    const late = apply(newer, {
      type: "update",
      update: {
        identity: identity(3, "invocation-old"),
        message: "late",
        outputs: { result: "stale" },
        progress: 1,
      },
    });
    expect(late).toBe(newer);
  });

  it("does not advance the published output watermark for progress alone", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {},
        publishedByBinding: {
          "binding-main": identity(2, "invocation-baseline"),
        },
        retainedByBinding: {},
        sessionId: "session-main",
        values: { [runtimeValueKey("output-main", "value")]: "baseline" },
        workerState: "ready",
      },
      type: "snapshot",
    });
    state = apply(state, {
      type: "update",
      update: {
        identity: identity(4, "invocation-progress"),
        message: "working",
        outputs: {},
        progress: 0.5,
      },
    });

    expect(state.publishedByBinding["binding-main"]).toEqual(
      identity(2, "invocation-baseline"),
    );
    expect(state.updates["binding-main"]?.message).toBe("working");

    state = apply(state, {
      type: "update",
      update: {
        identity: identity(3, "invocation-complete"),
        message: "complete",
        outputs: { result: "useful" },
        progress: 1,
      },
    });
    expect(state.values[runtimeValueKey("output-main", "value")]).toBe(
      "useful",
    );
    expect(state.publishedByBinding["binding-main"]).toEqual(
      identity(3, "invocation-complete"),
    );
    expect(state.updates["binding-main"]?.message).toBe("working");
  });

  it("rejects updates from replaced sessions and same-sequence impostors", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        handlers: [],
        invocations: {
          current: {
            error: null,
            identity: identity(8, "invocation-current"),
            state: "streaming",
          },
        },
        publishedByBinding: {
          "binding-main": identity(8, "invocation-current"),
        },
        retainedByBinding: {},
        sessionId: "session-main",
        values: {},
        workerState: "ready",
      },
      type: "snapshot",
    });
    state = apply(state, {
      invocation: {
        error: null,
        identity: identity(8, "invocation-impostor"),
        state: "completed",
      },
      type: "invocation",
    });
    expect(state.latestByBinding["binding-main"]?.invocationId).toBe(
      "invocation-current",
    );

    const impostor = apply(state, {
      type: "update",
      update: {
        identity: identity(8, "invocation-impostor"),
        message: "impostor",
        outputs: { result: "wrong" },
        progress: 1,
      },
    });
    expect(impostor).toBe(state);

    const otherSession = {
      ...identity(8, "invocation-current"),
      sessionId: "session-replaced",
    };
    const rejected = apply(state, {
      type: "update",
      update: {
        identity: otherSession,
        message: "late session",
        outputs: { result: "wrong" },
        progress: null,
      },
    });
    expect(rejected).toBe(state);
  });

  it("revokes the previous session before a replacement socket is authorized", () => {
    const state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {},
        publishedByBinding: {},
        retainedByBinding: { "binding-main": true },
        sessionId: "session-main",
        values: { [runtimeValueKey("output-main", "value")]: "visible" },
        workerState: "ready",
      },
      type: "snapshot",
    });

    const replacing = beginRuntimeReplacement(state);
    expect(replacing.sessionId).toBeNull();
    expect(replacing.latestByBinding).toEqual({});
    expect(replacing.publishedByBinding).toEqual({});
    expect(replacing.retainedByBinding).toEqual({ "binding-main": true });
    expect(replacing.connection).toBe("connecting");
    expect(replacing.values).toEqual(state.values);
  });

  it("clears diagnostics only when a snapshot changes the session", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {},
        publishedByBinding: {},
        retainedByBinding: {},
        sessionId: "session-main",
        values: {},
        workerState: "ready",
      },
      type: "snapshot",
    });
    state = apply(state, {
      log: { stream: "stdout", text: "previous worker" },
      type: "log",
    });
    state = apply(state, {
      error: { code: "runtime_failed", message: "previous failure" },
      type: "error",
    });

    const sameSession = apply(state, {
      snapshot: {
        invocations: {},
        publishedByBinding: {},
        retainedByBinding: {},
        sessionId: "session-main",
        values: {},
        workerState: "ready",
      },
      type: "snapshot",
    });
    expect(sameSession.logs).toEqual(state.logs);
    expect(sameSession.error).toEqual(state.error);

    const replacement = apply(sameSession, {
      snapshot: {
        invocations: {},
        publishedByBinding: {},
        retainedByBinding: {},
        sessionId: "session-replaced",
        values: {},
        workerState: "ready",
      },
      type: "snapshot",
    });
    expect(replacement.logs).toEqual([]);
    expect(replacement.error).toBeNull();
  });

  it("preserves explicit null values and authorizes invocation only when ready", () => {
    const key = runtimeValueKey("output-main", "value");
    expect(resolveRuntimeValue({ [key]: null }, key, "authored")).toBeNull();
    expect(resolveRuntimeValue({}, key, "authored")).toBe("authored");
    expect(
      runtimeCanInvoke({
        ...initialRuntimeViewState,
        connection: "connected",
        sessionId: "session-main",
        workerState: "ready",
      }),
    ).toBe(true);
    expect(
      runtimeCanInvoke({
        ...initialRuntimeViewState,
        connection: "connected",
        sessionId: "session-main",
        workerState: "failed",
      }),
    ).toBe(false);
  });
});
