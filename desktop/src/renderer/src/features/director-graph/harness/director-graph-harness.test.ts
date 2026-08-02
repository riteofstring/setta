import { describe, expect, it } from "vitest";

import {
  DirectorGraphHarness,
  GraphReplayClock,
  batchSceneTimes,
  packedGraphColumnDigest,
  type DirectorGraphCanvasPort,
  type DirectorGraphHarnessHost,
  type DirectorGraphHarnessRun,
} from "./director-graph-harness";
import { directorGraphScenarioNames, directorGraphScenarioPlan } from "./director-graph-scenarios";
import { packedGraphFixtureBatches } from "../packed-graph-fixtures";
import { packedGraphScene } from "../packed-graph-scenes";
import {
  buildPackedGraphSnapshot,
  emptyPackedGraphSnapshot,
  extendPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphSnapshot,
} from "../packed-graph-snapshot";
import { graphPixelPreviewSize } from "../render/graph-pixel-check";
import type { GraphCanvasPixelCheck } from "../render/graph-pixel-check";
import type { GraphPerformanceSummary } from "../render/graph-instrumentation";

const frameMs = 1000 / 120;

class FakeHost implements DirectorGraphHarnessHost {
  private timestampMs = 0;
  private queue: ((timestampMs: number) => void)[] = [];

  now(): number {
    return this.timestampMs;
  }

  heapBytes(): number | null {
    return null;
  }

  requestFrame(callback: (timestampMs: number) => void): number {
    this.queue.push(callback);
    return this.queue.length;
  }

  /** Advances one frame and lets the harness's promise chain settle. */
  async step(): Promise<void> {
    const callbacks = this.queue;
    this.queue = [];
    this.timestampMs += frameMs;
    for (const callback of callbacks) {
      callback(this.timestampMs);
    }
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  pending(): number {
    return this.queue.length;
  }
}

/**
 * A canvas that applies batches exactly as the real one does — one coalesced
 * application per frame — and reports itself awake while a batch is queued or a
 * frame has been requested. Everything else is a stub, because a scenario's job
 * is to decide what arrives when, not to draw.
 */
class FakeCanvas implements DirectorGraphCanvasPort {
  snapshot: PackedGraphSnapshot = emptyPackedGraphSnapshot("");
  applications = 0;
  resets = 0;
  visible = true;
  pixelChecks = 0;
  private queued: PackedGraphBatch[] = [];
  private awakeFrames = 0;

  setSnapshot(snapshot: PackedGraphSnapshot): void {
    this.snapshot = snapshot;
    this.queued = [];
    this.awakeFrames = 2;
    this.resets += 1;
  }

  pushBatch(batch: PackedGraphBatch): void {
    this.queued.push(batch);
    this.awakeFrames = 2;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  isAwake(): boolean {
    return this.visible && (this.queued.length > 0 || this.awakeFrames > 0);
  }

  resetPerformanceSampling(): void {
    this.applications = 0;
  }

  performanceSummary(): GraphPerformanceSummary {
    return {
      frames: this.applications,
      frameDeltasMs: [],
      cpuFrameMs: { p50: 0, p95: 0, p99: 0, maximum: 0 },
      frameDeltaMs: { p50: 0, p95: 0, p99: 0, maximum: 0 },
      gpuFrameMs: null,
      marks: {
        projection: { p50: 0, p95: 0, p99: 0, maximum: 0 },
        packing: { p50: 0, p95: 0, p99: 0, maximum: 0 },
        upload: { p50: 0, p95: 0, p99: 0, maximum: 0 },
        draw: { p50: 0, p95: 0, p99: 0, maximum: 0 },
      },
      longTasks: 0,
      longTaskTotalMs: 0,
      framesOverDroppedThreshold: 0,
      slowFrameRatio: 0,
    };
  }

  requestPixelCheck(): Promise<GraphCanvasPixelCheck> {
    this.pixelChecks += 1;
    return Promise.resolve(fakePixelCheck);
  }

  currentSnapshot(): PackedGraphSnapshot {
    return this.snapshot;
  }

  qualityState() {
    return {
      tier: "full" as const,
      viewport: { width: 1512, height: 982 },
      devicePixelRatio: 2,
      postWidth: 2000,
      postHeight: 1299,
      sceneWidth: 1569,
      sceneHeight: 1019,
    };
  }

  /**
   * Called by the test's frame pump, standing in for the real frame loop. A
   * hidden graph draws nothing, which is the behaviour the occlusion scenario
   * is asserting about.
   */
  drawFrame(): void {
    if (!this.visible) {
      return;
    }
    if (this.queued.length > 0) {
      for (const batch of this.queued) {
        this.snapshot = extendPackedGraphSnapshot(this.snapshot, batch);
      }
      this.queued = [];
      this.awakeFrames = 2;
    } else if (this.awakeFrames > 0) {
      this.awakeFrames -= 1;
    }
    this.applications += 1;
  }
}

class NeverIdleCanvas extends FakeCanvas {
  override isAwake(): boolean {
    return true;
  }
}

class ThrowingCanvas extends FakeCanvas {
  override isAwake(): boolean {
    throw new Error("canvas wake check failed");
  }
}

const fakePixelCheck: GraphCanvasPixelCheck = {
  ok: true,
  failures: [],
  width: 2000,
  height: 1299,
  gridColumns: 63,
  gridRows: 32,
  peakPixelLuminance: 1,
  peakLuminance: 0.3,
  meanLuminance: 0.01,
  contentThreshold: 0.1,
  litCellRatio: 0.02,
  contentCells: 7,
  contentCentroidX: 0.5,
  contentCentroidY: 0.6,
  contentSpanX: 0.05,
  contentSpanY: 0.13,
  frameSpanX: 0.5,
  frameSpanY: 1,
  liveEdgeY: 0.675,
  preview: new Array(graphPixelPreviewSize * graphPixelPreviewSize).fill(0),
};

async function runScenario(
  canvas: FakeCanvas,
  host: FakeHost,
  name: (typeof directorGraphScenarioNames)[number],
  maximumFrames = 20_000,
  scenarioCeilingMs?: number,
): Promise<DirectorGraphHarnessRun> {
  const harness = new DirectorGraphHarness(
    canvas,
    host,
    new GraphReplayClock(),
    () => ({
      width: 1512,
      height: 982,
      devicePixelRatio: 2,
    }),
    scenarioCeilingMs,
  );
  let result: DirectorGraphHarnessRun | null = null;
  let failure: unknown = null;
  harness.run(name).then(
    (run) => {
      result = run;
    },
    (error: unknown) => {
      failure = error;
    },
  );
  for (let frame = 0; frame < maximumFrames && result === null && failure === null; frame += 1) {
    canvas.drawFrame();
    await host.step();
  }
  if (failure !== null) {
    throw failure;
  }
  if (result === null) {
    throw new Error(`${name} did not finish within ${maximumFrames} frames`);
  }
  return result;
}

describe("director graph scenarios", () => {
  it("covers every name with a plan", () => {
    for (const name of directorGraphScenarioNames) {
      expect(directorGraphScenarioPlan(name).kind).toBeTruthy();
    }
  });
});

describe("batch scene times", () => {
  it("rises with the committed facts and never goes backwards", () => {
    const times = batchSceneTimes(packedGraphFixtureBatches("director-and-worker-interleaved"));
    expect(times.length).toBeGreaterThan(4);
    expect(times).toStrictEqual([...times].sort((left, right) => left - right));
    expect(times.at(-1)).toBeGreaterThan(0);
  });
});

describe("director graph harness", () => {
  it("replays a fixture at its committed times and lands on the cold columns", async () => {
    const canvas = new FakeCanvas();
    const host = new FakeHost();
    const run = await runScenario(canvas, host, "one-active-workstream");
    const batches = packedGraphFixtureBatches("single-active-turn");
    expect(run.deliveries).toBe(batches.length);
    expect(canvas.snapshot.workstreamId).toBe(packedGraphScene("single-active-turn").workstreamId);
    expect(packedGraphColumnDigest(canvas.snapshot)).toBe(
      packedGraphColumnDigest(buildPackedGraphSnapshot(canvas.snapshot.workstreamId, batches)),
    );
    expect(run.pixel.ok).toBe(true);
    expect(canvas.pixelChecks).toBe(1);
  });

  it("restarts from a durable cursor and resumes the rest of the stream", async () => {
    const canvas = new FakeCanvas();
    const host = new FakeHost();
    const run = await runScenario(canvas, host, "restart-durable-replay");
    const batches = packedGraphFixtureBatches("branch-merge-and-dead-end");
    expect(run.details.digestsMatch).toBe(true);
    expect(run.details.cursorBatches).toBe(Math.floor(batches.length / 2));
    expect(run.deliveries).toBe(batches.length);
    expect(packedGraphColumnDigest(canvas.snapshot)).toBe(
      packedGraphColumnDigest(buildPackedGraphSnapshot(canvas.snapshot.workstreamId, batches)),
    );
  });

  it("stops delivering frames while the graph is occluded", async () => {
    const canvas = new FakeCanvas();
    const host = new FakeHost();
    const run = await runScenario(canvas, host, "occlusion-transitions");
    expect(run.details.framesWhileHidden).toBe(0);
    expect(run.details.awakeWhileHidden).toBe(false);
    expect(canvas.visible).toBe(true);
  });

  it("fails a scenario that reaches its deadline before the canvas settles", async () => {
    await expect(
      runScenario(new NeverIdleCanvas(), new FakeHost(), "one-active-workstream", 100, frameMs * 4),
    ).rejects.toThrow("timed out");
  });

  it("rejects an exception thrown by a frame step", async () => {
    await expect(
      runScenario(new ThrowingCanvas(), new FakeHost(), "burst-cursor-replay", 100),
    ).rejects.toThrow("canvas wake check failed");
  });
});
