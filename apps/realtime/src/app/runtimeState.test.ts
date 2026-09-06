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
});
