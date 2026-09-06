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
  it("replaces from complete snapshots and rejects stale invocation updates", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {},
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
    const stale = apply(state, {
      type: "update",
      update: {
        identity: identity(3, "invocation-old"),
        message: "late",
        outputs: { result: "stale" },
        progress: 0.9,
      },
    });

    expect(stale).toBe(state);
    expect(stale.values[runtimeValueKey("output-main", "value")]).toBe(
      "baseline",
    );

    const accepted = apply(state, {
      type: "update",
      update: {
        identity: identity(4, "invocation-new"),
        message: "complete",
        outputs: { result: "fresh", status: "Complete" },
        progress: 1,
      },
    });
    expect(accepted.values[runtimeValueKey("output-main", "value")]).toBe(
      "fresh",
    );
    expect(accepted.values[runtimeValueKey("status-main", "message")]).toBe(
      "Complete",
    );
  });

  it("rejects updates from replaced sessions and same-sequence impostors", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {
          current: {
            error: null,
            identity: identity(8, "invocation-current"),
            state: "streaming",
          },
        },
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
        sessionId: "session-main",
        values: { [runtimeValueKey("output-main", "value")]: "visible" },
        workerState: "ready",
      },
      type: "snapshot",
    });

    const replacing = beginRuntimeReplacement(state);
    expect(replacing.sessionId).toBeNull();
    expect(replacing.latestByBinding).toEqual({});
    expect(replacing.connection).toBe("connecting");
    expect(replacing.values).toEqual(state.values);
  });

  it("clears diagnostics only when a snapshot changes the session", () => {
    let state = apply(initialRuntimeViewState, {
      snapshot: {
        invocations: {},
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
