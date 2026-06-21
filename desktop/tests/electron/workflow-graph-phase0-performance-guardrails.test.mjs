import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPhase0PerformanceGuardrails,
  phase0CheckBlocksGate,
  phase0PerformanceScenarioGate,
} from "./workflow-graph-phase0-performance-guardrails.mjs";

// Phase 1 camera fast-path contract: node labels must NOT be hidden because the
// camera is moving — they ride the camera transform tier instead. Phase 0
// recorded this as an expected-fail gate entry; Phase 1 removed the label hiding
// in the renderer, so it is now a hard gate check. The renderer additionally
// self-audits each moving frame and surfaces `cameraFastPathViolationCount`,
// which the gate enforces as zero. These tests exercise the pure gate logic
// directly, without launching Electron.

const LABEL_VISIBILITY_CHECK_ID = "no-labels-hidden-during-camera-motion";
const FAST_PATH_VIOLATION_CHECK_ID = "no-camera-fast-path-violations";

test("passes the label contract when labels ride the camera transform tier", () => {
  const gate = phase0PerformanceScenarioGate(
    gateInputs({ cameraMovingLabelHiddenFrameCount: 0, cameraMovingLabelTransformFrameCount: 4 }),
  );
  const check = checkById(gate, LABEL_VISIBILITY_CHECK_ID);

  assert.equal(check.severity, "hard");
  assert.equal(check.status, "pass");
  assert.equal(check.actual, 0);
  assert.equal(phase0CheckBlocksGate(check), false);
  assert.doesNotThrow(() =>
    assertPhase0PerformanceGuardrails(
      assertInputs({
        cameraMovingLabelHiddenFrameCount: 0,
        cameraMovingLabelTransformFrameCount: 4,
      }),
    ),
  );
});

test("fails the gate as a hard violation when labels are hidden during camera motion", () => {
  const gate = phase0PerformanceScenarioGate(gateInputs({ cameraMovingLabelHiddenFrameCount: 5 }));
  const check = checkById(gate, LABEL_VISIBILITY_CHECK_ID);

  assert.equal(check.severity, "hard");
  assert.equal(check.status, "fail");
  assert.equal(check.actual, 5);
  assert.equal(phase0CheckBlocksGate(check), true);
  // Hiding labels during pan/zoom is now a hard gate failure, not an expected red.
  assert.throws(
    () => assertPhase0PerformanceGuardrails(assertInputs({ cameraMovingLabelHiddenFrameCount: 5 })),
    /no-labels-hidden-during-camera-motion \[hard\/fail\]/,
  );
});

test("fails the gate when the renderer records a camera fast-path violation", () => {
  const gate = phase0PerformanceScenarioGate(gateInputs({ cameraFastPathViolationCount: 2 }));
  const check = checkById(gate, FAST_PATH_VIOLATION_CHECK_ID);

  assert.equal(check.severity, "hard");
  assert.equal(check.status, "fail");
  assert.equal(check.actual, 2);
  assert.equal(phase0CheckBlocksGate(check), true);
  assert.throws(
    () => assertPhase0PerformanceGuardrails(assertInputs({ cameraFastPathViolationCount: 2 })),
    /no-camera-fast-path-violations \[hard\/fail\]/,
  );
});

test("passes the structural and fast-path checks cleanly on a healthy interaction", () => {
  const gate = phase0PerformanceScenarioGate(gateInputs({}));
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

function gateInputs({
  cameraFastPathViolationCount = 0,
  cameraMovingLabelHiddenFrameCount = 0,
  cameraMovingLabelTransformFrameCount = cameraMovingLabelHiddenFrameCount === 0 ? 4 : 0,
} = {}) {
  const renderDeltas = {
    cameraDependentSyncFrameCount: 4,
    cameraFastPathViolationCount,
    cameraMovingLabelDeferredFrameCount: cameraMovingLabelHiddenFrameCount * 3,
    cameraMovingLabelHiddenFrameCount,
    cameraMovingLabelSyncedFrameCount: 0,
    cameraMovingLabelTransformCount: cameraMovingLabelTransformFrameCount * 3,
    cameraMovingLabelTransformFrameCount,
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
        cameraFastPathViolationCount,
        cameraFastPathViolations: [],
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
