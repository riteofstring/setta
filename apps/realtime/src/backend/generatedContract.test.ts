import { describe, expect, it } from "vitest";

import {
  validateApplyRequest,
  validateRuntimeCommand,
  validateRuntimeEnvelope,
} from "./generatedContract";

const binding = {
  arguments: {},
  handler: "render",
  id: "render-binding",
  outputs: {},
  scheduling: {
    concurrencyGroup: "render",
    concurrencyLimit: 1,
    debounceMilliseconds: 0,
    mode: "latest",
  },
  trigger: { event: "change", sectionId: "input" },
};

function applyBinding(candidate: Record<string, unknown>): unknown {
  return {
    expectedRevision: 0,
    operations: [{ binding: candidate, op: "setBinding" }],
    projectId: "project-1",
  };
}

function runtimeSnapshot(retainedByBinding: unknown): unknown {
  return {
    snapshot: {
      invocations: {},
      publishedByBinding: {},
      retainedByBinding,
      sessionId: "session-1",
      values: {},
      workerState: "ready",
    },
    type: "snapshot",
  };
}

describe("generated Realtime materialization contracts", () => {
  it("accepts omission and every materialization policy value", () => {
    expect(validateApplyRequest(applyBinding(binding))).toBe(true);
    for (const retention of ["session", "lastSuccessful"]) {
      for (const startup of ["always", "whenStale", "ifMissing", "manual"]) {
        expect(
          validateApplyRequest(
            applyBinding({
              ...binding,
              materialization: { retention, startup },
            }),
          ),
        ).toBe(true);
      }
    }
  });

  it("rejects incomplete, invalid, and open materialization policies", () => {
    expect(
      validateApplyRequest(
        applyBinding({
          ...binding,
          materialization: { retention: "session" },
        }),
      ),
    ).toBe(false);
    expect(
      validateApplyRequest(
        applyBinding({
          ...binding,
          materialization: { retention: "forever", startup: "manual" },
        }),
      ),
    ).toBe(false);
    expect(
      validateApplyRequest(
        applyBinding({
          ...binding,
          materialization: {
            legacy: true,
            retention: "session",
            startup: "manual",
          },
        }),
      ),
    ).toBe(false);
    expect(
      validateApplyRequest(
        applyBinding({
          ...binding,
          materialization: { retention: "lastSuccessful", startup: "always" },
          trigger: { event: "submit", sectionId: "input" },
        }),
      ),
    ).toBe(false);
    expect(
      validateApplyRequest(
        applyBinding({
          ...binding,
          materialization: { retention: "lastSuccessful", startup: "manual" },
          trigger: { event: "submit", sectionId: "input" },
        }),
      ),
    ).toBe(true);
  });

  it("requires a closed cause and limits startup to stateful events", () => {
    const event = {
      cause: "interaction",
      event: "change",
      payload: {},
      sectionId: "input",
      sessionId: "session-1",
      type: "event",
    };
    expect(validateRuntimeCommand(event)).toBe(true);
    expect(validateRuntimeCommand({ ...event, cause: "startup" })).toBe(true);
    expect(
      validateRuntimeCommand({ ...event, cause: "startup", event: "snapshot" }),
    ).toBe(true);
    expect(
      validateRuntimeCommand({ ...event, cause: "startup", event: "submit" }),
    ).toBe(false);
    expect(
      validateRuntimeCommand({ ...event, cause: "startup", event: "press" }),
    ).toBe(false);
    const { cause: _cause, ...missingCause } = event;
    expect(validateRuntimeCommand(missingCause)).toBe(false);
    expect(validateRuntimeCommand({ ...event, cause: "reload" })).toBe(false);
    expect(validateRuntimeCommand({ ...event, legacy: true })).toBe(false);
  });

  it("requires a boolean retained-output record in runtime snapshots", () => {
    expect(
      validateRuntimeEnvelope(
        runtimeSnapshot({ "render-binding": true, preview: false }),
      ),
    ).toBe(true);
    const envelope = runtimeSnapshot({});
    const snapshot = (envelope as { snapshot: Record<string, unknown> })
      .snapshot;
    delete snapshot.retainedByBinding;
    expect(validateRuntimeEnvelope(envelope)).toBe(false);
    expect(
      validateRuntimeEnvelope(runtimeSnapshot({ "render-binding": "yes" })),
    ).toBe(false);
  });
});
