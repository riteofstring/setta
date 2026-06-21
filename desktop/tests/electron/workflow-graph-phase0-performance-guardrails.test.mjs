import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPhase0PerformanceGuardrails,
  phase0CheckBlocksGate,
  phase0PerformanceScenarioGate,
} from "./workflow-graph-phase0-performance-guardrails.mjs";

// Phase 0 evidence reset: the camera fast-path contract "labels must not be
// hidden during camera motion" is enforced as an expected-fail check that flips
// to a gate-blocking failure once the renderer stops hiding labels. These tests
// exercise the pure gate logic directly, without launching Electron.

const LABEL_VISIBILITY_CHECK_ID = "no-labels-hidden-during-camera-motion";

test("records label hiding during camera motion as an expected (non-blocking) failure", () => {
  const gate = phase0PerformanceScenarioGate(gateInputs({ cameraMovingLabelHiddenFrameCount: 5 }));
  const check = checkById(gate, LABEL_VISIBILITY_CHECK_ID);

  assert.equal(check.severity, "expected-fail");
  assert.equal(check.status, "expected-fail");
  assert.equal(check.actual, 5);
  assert.equal(phase0CheckBlocksGate(check), false);
  // The whole gate must still pass while the contract is unmet (expected-red).
  assert.doesNotThrow(() =>
    assertPhase0PerformanceGuardrails(assertInputs({ cameraMovingLabelHiddenFrameCount: 5 })),
  );
});

test("flips to a gate-blocking failure when labels are no longer hidden during motion", () => {
  const gate = phase0PerformanceScenarioGate(gateInputs({ cameraMovingLabelHiddenFrameCount: 0 }));
  const check = checkById(gate, LABEL_VISIBILITY_CHECK_ID);

  assert.equal(check.severity, "expected-fail");
  assert.equal(check.status, "unexpected-pass");
  assert.equal(phase0CheckBlocksGate(check), true);
  assert.match(check.summary, /promote .* from expected-fail to a hard check/i);
  // Once the contract holds, the gate must demand promotion to a hard check.
  assert.throws(
    () => assertPhase0PerformanceGuardrails(assertInputs({ cameraMovingLabelHiddenFrameCount: 0 })),
    /no-labels-hidden-during-camera-motion \[expected-fail\/unexpected-pass\]/,
  );
});

test("label hiding does not mask the structural hard gates", () => {
  // With label hiding present, every hard structural/scaling check still passes,
  // so the only non-pass signal is the expected-fail contract check.
  const gate = phase0PerformanceScenarioGate(gateInputs({ cameraMovingLabelHiddenFrameCount: 3 }));
  const blocking = gate.checks.filter(phase0CheckBlocksGate);
  assert.deepEqual(blocking, []);
  const hardFailures = gate.checks.filter(
    (check) => check.severity === "hard" && check.status !== "pass",
  );
  assert.deepEqual(hardFailures, []);
});

function assertInputs(opts) {
  const inputs = gateInputs(opts);
  return {
    artifacts: { metrics: inputs.diagnostics },
    final: inputs.final,
    initial: inputs.initial,
    scenario: inputs.scenario,
    semanticTraffic: inputs.semanticTraffic,
    syntheticScene: inputs.syntheticScene,
  };
}

function checkById(gate, id) {
  const check = gate.checks.find((candidate) => candidate.id === id);
  if (!check) {
    throw new Error(`gate is missing check ${id}: ${gate.checks.map((c) => c.id).join(", ")}`);
  }
  return check;
}

function gateInputs({ cameraMovingLabelHiddenFrameCount }) {
  const renderDeltas = {
    cameraDependentSyncFrameCount: 4,
    cameraMovingLabelDeferredFrameCount: cameraMovingLabelHiddenFrameCount * 3,
    cameraMovingLabelHiddenFrameCount,
    cameraMovingLabelSyncedFrameCount: 0,
    labelSyncCount: 0,
    nodeDragUpdateCount: 2,
  };
  return {
    diagnostics: {
      graphSceneReplacementCount: 0,
      inputCountsByKind: { "node-drag": 2, wheel: 3 },
      inputEventCount: 5,
      interactionRenderDeltas: renderDeltas,
      maxLongTaskMs: 0,
      paneMutations: { cameraCausedCount: 0 },
      reactCommits: { cameraCausedCount: 0, totalCount: 0 },
      rendererLifecycle: {
        canvasCreationDelta: 0,
        duplicateRendererSamples: [],
        rendererDestroyDelta: 0,
        rendererInstanceChanged: false,
      },
      timingBucketDeltas: { "static-glow-redraw": { count: 1 } },
      wheelLatency: { sampleCount: 0 },
    },
    final: {
      graph: { nodeCount: 3 },
      render: {
        lastVisibleMaterializedNodeCount: 3,
        materializedLabelCount: 3,
        materializedNodeCount: 3,
        p95FrameMs: 10,
        totalDisplayObjectCount: 100,
      },
    },
    initial: { render: {} },
    scenario: "baseline",
    semanticTraffic: { workingSetHttpRequests: 0, workingSetIpcStarts: 0 },
    syntheticScene: "baseline",
  };
}
