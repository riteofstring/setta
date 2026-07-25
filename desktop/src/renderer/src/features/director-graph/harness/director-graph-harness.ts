/**
 * The fixture harness that drives the graph canvas in a real WebGL2 context.
 *
 * Phase 2 has to prove the renderer at 120 Hz before any Director endpoint
 * exists, which means something has to push the committed fixtures at a real
 * canvas, at the tiers in the performance matrix, and report what came back.
 * That is this: it owns the replay clock, turns a scenario plan into pushes on
 * real frames, and returns one JSON-shaped run record per scenario.
 *
 * It owns no product state and no assertion. Thresholds live with the workflow
 * that runs it, because the pass/fail rule is a measurement decision that
 * belongs next to the matrix, not inside the renderer bundle.
 *
 * The replay clock is the only clock in the system: `DirectorGraphCanvas` maps
 * frame timestamps through it, so fixture time and frame time stay related the
 * way durable event time and frame time will in production.
 */

import {
  buildPackedGraphSnapshot,
  emptyPackedGraphSnapshot,
  type PackedGraphBatch,
  type PackedGraphSnapshot,
} from "../packed-graph-snapshot";
import { packedGraphFixtureBatches, packedGraphWorkstreamSet } from "../packed-graph-fixtures";
import { packedGraphScene, type PackedGraphFixtureName } from "../packed-graph-scenes";
import type { DirectorGraphCanvas, GraphCanvasQuality } from "../render/director-graph-canvas";
import type { GraphPerformanceSummary } from "../render/graph-instrumentation";
import type { GraphCanvasPixelCheck } from "../render/graph-pixel-check";
import {
  directorGraphScenarioPlan,
  type DirectorGraphScenarioName,
  type DirectorGraphScenarioPlan,
} from "./director-graph-scenarios";

/** Consecutive sleeping frames that end a replay. */
const idleFramesToFinish = 3;

/** Nothing runs longer than this, however the fixture behaves. */
const defaultScenarioCeilingMs = 240_000;

export interface DirectorGraphHarnessHost {
  requestFrame(callback: (timestampMs: number) => void): number;
  now(): number;
  /**
   * Used JS heap in bytes, or null where the runtime does not expose it. The
   * matrix requires every report to state memory behaviour across the sample,
   * and a soak is where a leak or a GC pattern shows up.
   */
  heapBytes(): number | null;
}

interface DirectorGraphHeapReport {
  readonly startBytes: number | null;
  readonly peakBytes: number | null;
  readonly endBytes: number | null;
}

/**
 * The part of the canvas a scenario drives. Named as a projection of the real
 * class so it cannot drift from it, and narrow so the runner can be exercised
 * without a GPU.
 */
export type DirectorGraphCanvasPort = Pick<
  DirectorGraphCanvas,
  | "setSnapshot"
  | "pushBatch"
  | "setVisible"
  | "isAwake"
  | "resetPerformanceSampling"
  | "performanceSummary"
  | "requestPixelCheck"
  | "currentSnapshot"
  | "qualityState"
>;

export interface DirectorGraphViewportReport {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

export interface DirectorGraphHarnessRun {
  readonly scenario: DirectorGraphScenarioName;
  readonly kind: DirectorGraphScenarioPlan["kind"];
  readonly durationMs: number;
  readonly deliveries: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly turnCount: number;
  readonly summary: GraphPerformanceSummary;
  readonly quality: GraphCanvasQuality;
  readonly viewport: DirectorGraphViewportReport;
  readonly heap: DirectorGraphHeapReport;
  readonly pixel: GraphCanvasPixelCheck;
  /** Scenario-specific evidence; the workflow decides what each one means. */
  readonly details: Readonly<Record<string, number | boolean | string>>;
}

/**
 * Maps frame timestamps onto fixture time. A rate above 1 replays a fixture
 * faster than it was authored; an offset starts the graph mid-history, which is
 * what a backlog arriving after the fact looks like.
 */
export class GraphReplayClock {
  private baseMs = 0;
  private offsetSeconds = 0;
  private rate = 1;

  start(baseMs: number, offsetSeconds: number, rate: number): void {
    this.baseMs = baseMs;
    this.offsetSeconds = offsetSeconds;
    this.rate = rate;
  }

  secondsAt(timestampMs: number): number {
    return this.offsetSeconds + ((timestampMs - this.baseMs) * this.rate) / 1000;
  }
}

/** The fixture time each batch belongs to: its newest committed fact. */
export function batchSceneTimes(batches: readonly PackedGraphBatch[]): readonly number[] {
  const times: number[] = [];
  let previous = 0;
  for (const batch of batches) {
    let time = previous;
    for (const node of batch.nodes) {
      time = Math.max(time, node.bornAt);
    }
    previous = time;
    times.push(time);
  }
  return times;
}

/**
 * A stable fingerprint of the packed columns. Used to prove a cold replay from
 * a durable cursor reaches the same columns a live push stream did — the same
 * claim the unit fixtures make, asserted here against the snapshot the GPU was
 * actually drawing.
 */
export function packedGraphColumnDigest(snapshot: PackedGraphSnapshot): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash ^= Math.imul(value, 0x9e3779b1) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  const mixText = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      mix(text.charCodeAt(index));
    }
  };
  const mixColumn = (values: ArrayLike<number>, count: number): void => {
    for (let index = 0; index < count; index += 1) {
      const value = values[index] ?? 0;
      mix(Number.isFinite(value) ? Math.round(value * 1000) : 0x7fffffff);
    }
  };
  mixText(snapshot.workstreamId);
  mix(snapshot.cursorSequence);
  mix(snapshot.hasEarlier ? 1 : 0);
  for (const id of snapshot.nodes.ids.slice(0, snapshot.nodeCount)) {
    mixText(id);
  }
  for (const label of snapshot.nodes.labels.slice(0, snapshot.nodeCount)) {
    mixText(label);
  }
  for (const column of [
    snapshot.nodes.turn,
    snapshot.nodes.role,
    snapshot.nodes.mode,
    snapshot.nodes.glyph,
    snapshot.nodes.emphasis,
    snapshot.nodes.detail,
    snapshot.nodes.terminal,
    snapshot.nodes.lane,
    snapshot.nodes.row,
    snapshot.nodes.bornAt,
    snapshot.nodes.settleAt,
    snapshot.nodes.terminalAt,
    snapshot.nodes.labelPlacement,
    snapshot.nodes.labelTruncated,
  ]) {
    mixColumn(column, snapshot.nodeCount);
  }
  for (const column of [
    snapshot.edges.from,
    snapshot.edges.to,
    snapshot.edges.mode,
    snapshot.edges.channel,
    snapshot.edges.confidence,
    snapshot.edges.bornAt,
    snapshot.edges.terminated,
  ]) {
    mixColumn(column, snapshot.edgeCount);
  }
  for (const column of [
    snapshot.turns.inputNode,
    snapshot.turns.outcomeNode,
    snapshot.turns.rowSpan,
    snapshot.turns.outcome,
    snapshot.turns.answerAt,
    snapshot.turns.compactAt,
  ]) {
    mixColumn(column, snapshot.turnCount);
  }
  return `${snapshot.nodeCount}:${snapshot.edgeCount}:${snapshot.turnCount}:${hash.toString(16)}`;
}

/**
 * The one knob a run may change: how long the soak runs. The matrix asks for
 * at least ten minutes of continuous activity, which is not a length a routine
 * workflow should pay for, so the committed scenario is short and the soak
 * raises it explicitly and says so in its report.
 */
export interface DirectorGraphScenarioOverrides {
  readonly sustainedMs?: number;
}

function overriddenPlan(
  plan: DirectorGraphScenarioPlan,
  overrides: DirectorGraphScenarioOverrides,
): DirectorGraphScenarioPlan {
  if (plan.kind !== "sustained" || overrides.sustainedMs === undefined) {
    return plan;
  }
  if (!Number.isFinite(overrides.sustainedMs) || overrides.sustainedMs <= 0) {
    throw new Error(`sustainedMs must be a positive number: ${String(overrides.sustainedMs)}`);
  }
  return { ...plan, durationMs: overrides.sustainedMs };
}

export class DirectorGraphHarness {
  private peakHeapBytes: number | null = null;

  constructor(
    private readonly canvas: DirectorGraphCanvasPort,
    private readonly host: DirectorGraphHarnessHost,
    private readonly clock: GraphReplayClock,
    private readonly viewportOf: () => DirectorGraphViewportReport,
    private readonly scenarioCeilingMs: number = defaultScenarioCeilingMs,
  ) {
    if (!Number.isFinite(scenarioCeilingMs) || scenarioCeilingMs <= 0) {
      throw new Error(`scenario ceiling must be a positive number: ${String(scenarioCeilingMs)}`);
    }
  }

  async run(
    name: DirectorGraphScenarioName,
    overrides: DirectorGraphScenarioOverrides = {},
  ): Promise<DirectorGraphHarnessRun> {
    const plan = overriddenPlan(directorGraphScenarioPlan(name), overrides);
    const startedAt = this.host.now();
    const startBytes = this.host.heapBytes();
    this.peakHeapBytes = startBytes;
    const outcome = await this.runPlan(plan);
    const heap: DirectorGraphHeapReport = {
      startBytes,
      peakBytes: this.peakHeapBytes,
      endBytes: this.host.heapBytes(),
    };
    const pixel = await this.canvas.requestPixelCheck();
    const snapshot = this.canvas.currentSnapshot();
    return {
      scenario: name,
      kind: plan.kind,
      durationMs: this.host.now() - startedAt,
      deliveries: outcome.deliveries,
      nodeCount: snapshot.nodeCount,
      edgeCount: snapshot.edgeCount,
      turnCount: snapshot.turnCount,
      summary: outcome.summary,
      quality: this.canvas.qualityState(),
      viewport: this.viewportOf(),
      heap,
      pixel,
      details: outcome.details,
    };
  }

  private runPlan(plan: DirectorGraphScenarioPlan): Promise<ScenarioOutcome> {
    switch (plan.kind) {
      case "replay":
        return this.runReplay(plan);
      case "burst":
        return this.runBurst(plan);
      case "navigate":
        return this.runNavigate(plan);
      case "restart":
        return this.runRestart(plan);
      case "sustained":
        return this.runSustained(plan);
      case "occlusion":
        return this.runOcclusion(plan);
      default: {
        const unreachable: never = plan;
        throw new Error(`unsupported graph scenario ${JSON.stringify(unreachable)}`);
      }
    }
  }

  private async runReplay(
    plan: Extract<DirectorGraphScenarioPlan, { kind: "replay" }>,
  ): Promise<ScenarioOutcome> {
    const stream = this.loadFixture(plan.fixture, plan.rate);
    this.canvas.resetPerformanceSampling();
    const delivered = await this.playStream(
      stream,
      this.scenarioCeilingMs,
      `replay ${plan.fixture}`,
    );
    return {
      deliveries: delivered,
      summary: this.canvas.performanceSummary(),
      details: { batches: stream.batches.length },
    };
  }

  private async runBurst(
    plan: Extract<DirectorGraphScenarioPlan, { kind: "burst" }>,
  ): Promise<ScenarioOutcome> {
    const batches = packedGraphFixtureBatches(plan.fixture);
    const workstreamId = packedGraphScene(plan.fixture).workstreamId;
    const times = batchSceneTimes(batches);
    const lastTime = times[times.length - 1] ?? 0;
    this.canvas.setSnapshot(emptyPackedGraphSnapshot(workstreamId));
    // The whole backlog is already in the past: this is a subscription resuming
    // from a durable cursor, not a live turn.
    this.clock.start(this.host.now(), lastTime + 1, 1);
    let quiet = 0;
    await this.drive(
      () => {
        quiet += 1;
        return quiet >= plan.silentFrames;
      },
      this.scenarioCeilingMs,
      "burst prelude",
    );

    const expected = batches.reduce((total, batch) => total + batch.nodes.length, 0);
    this.canvas.resetPerformanceSampling();
    for (const batch of batches) {
      this.canvas.pushBatch(batch);
    }
    let framesToApply = 0;
    await this.drive(
      () => {
        if (this.canvas.currentSnapshot().nodeCount < expected) {
          return false;
        }
        framesToApply = this.canvas.performanceSummary().frames;
        return true;
      },
      this.scenarioCeilingMs,
      "burst backlog application",
    );
    await this.settle(this.scenarioCeilingMs, "burst settle");
    return {
      deliveries: batches.length,
      summary: this.canvas.performanceSummary(),
      details: { backlogBatches: batches.length, framesToApplyBacklog: framesToApply },
    };
  }

  private async runNavigate(
    plan: Extract<DirectorGraphScenarioPlan, { kind: "navigate" }>,
  ): Promise<ScenarioOutcome> {
    const workstreams = packedGraphWorkstreamSet(plan.workstreams);
    const first = workstreams[0];
    if (first === undefined) {
      throw new Error("navigation scenario needs at least one workstream");
    }
    this.clock.start(this.host.now(), 0, 1);
    this.canvas.setSnapshot(first);
    await this.settle(this.scenarioCeilingMs, "navigation initial settle");
    this.canvas.resetPerformanceSampling();
    let switched = 0;
    let frames = 0;
    await this.drive(
      () => {
        frames += 1;
        if (frames % plan.framesPerSwitch !== 0) {
          return false;
        }
        const next = workstreams[(switched + 1) % workstreams.length];
        if (next === undefined) {
          throw new Error("navigation scenario lost a workstream");
        }
        this.canvas.setSnapshot(next);
        switched += 1;
        return switched >= plan.switches;
      },
      this.scenarioCeilingMs,
      "workstream navigation",
    );
    return {
      deliveries: switched,
      summary: this.canvas.performanceSummary(),
      details: { workstreams: workstreams.length, switches: switched },
    };
  }

  private async runRestart(
    plan: Extract<DirectorGraphScenarioPlan, { kind: "restart" }>,
  ): Promise<ScenarioOutcome> {
    const stream = this.loadFixture(plan.fixture, plan.rate);
    // Run to a durable cursor mid-stream, which is where a restart happens: the
    // app comes back, loads the snapshot at that cursor, and live work resumes.
    const cursor = Math.max(1, Math.floor(stream.batches.length / 2));
    const delivered = await this.playStream(
      { ...stream, limit: cursor },
      this.scenarioCeilingMs,
      "restart live prefix",
    );
    const livePixel = await this.canvas.requestPixelCheck();
    const liveDigest = packedGraphColumnDigest(this.canvas.currentSnapshot());

    const restored = buildPackedGraphSnapshot(stream.workstreamId, stream.batches.slice(0, cursor));
    this.canvas.setSnapshot(restored);
    await this.settle(this.scenarioCeilingMs, "restart restored snapshot settle");
    const replayPixel = await this.canvas.requestPixelCheck();
    const replayDigest = packedGraphColumnDigest(this.canvas.currentSnapshot());

    // The rest of the stream arrives after the restart, from that cursor.
    this.canvas.resetPerformanceSampling();
    const resumed = await this.playStream(
      { ...stream, from: cursor },
      this.scenarioCeilingMs,
      "restart resumed stream",
    );
    return {
      deliveries: delivered + resumed,
      summary: this.canvas.performanceSummary(),
      details: {
        cursorBatches: cursor,
        resumedBatches: resumed,
        liveDigest,
        replayDigest,
        digestsMatch: liveDigest === replayDigest,
        liveCentroidX: livePixel.contentCentroidX,
        liveCentroidY: livePixel.contentCentroidY,
        replayCentroidX: replayPixel.contentCentroidX,
        replayCentroidY: replayPixel.contentCentroidY,
        livePixelOk: livePixel.ok,
        replayPixelOk: replayPixel.ok,
      },
    };
  }

  private async runSustained(
    plan: Extract<DirectorGraphScenarioPlan, { kind: "sustained" }>,
  ): Promise<ScenarioOutcome> {
    const startedAt = this.host.now();
    let cycles = 0;
    let delivered = 0;
    this.canvas.resetPerformanceSampling();
    while (this.host.now() - startedAt < plan.durationMs) {
      const stream = this.loadFixture(plan.fixture, plan.rate);
      delivered += await this.playStream(
        stream,
        Math.max(0, plan.durationMs - (this.host.now() - startedAt)),
        "sustained stream",
        true,
      );
      cycles += 1;
    }
    return {
      deliveries: delivered,
      summary: this.canvas.performanceSummary(),
      details: { cycles, sustainedMs: Math.round(this.host.now() - startedAt) },
    };
  }

  private async runOcclusion(
    plan: Extract<DirectorGraphScenarioPlan, { kind: "occlusion" }>,
  ): Promise<ScenarioOutcome> {
    const stream = this.loadFixture(plan.fixture, plan.rate);
    const half = Math.max(1, Math.floor(stream.batches.length / 2));
    this.canvas.resetPerformanceSampling();
    const beforeHidden = await this.playStream(
      { ...stream, limit: half },
      this.scenarioCeilingMs,
      "occlusion visible prefix",
    );
    const framesBeforeHidden = this.canvas.performanceSummary().frames;

    this.canvas.setVisible(false);
    this.canvas.resetPerformanceSampling();
    const hiddenStart = this.host.now();
    // The rest of the stream arrives while nothing is on screen.
    for (let index = half; index < stream.batches.length; index += 1) {
      const batch = stream.batches[index];
      if (batch !== undefined) {
        this.canvas.pushBatch(batch);
      }
    }
    await this.drive(
      () => this.host.now() - hiddenStart >= plan.hiddenMs,
      this.scenarioCeilingMs,
      "occlusion hidden interval",
    );
    const framesWhileHidden = this.canvas.performanceSummary().frames;
    const awakeWhileHidden = this.canvas.isAwake();

    this.canvas.resetPerformanceSampling();
    const resumeStart = this.host.now();
    this.canvas.setVisible(true);
    await this.drive(
      () => this.host.now() - resumeStart >= plan.resumeMs,
      this.scenarioCeilingMs,
      "occlusion resume interval",
    );
    const resumeSummary = this.canvas.performanceSummary();
    const resumeMs = this.host.now() - resumeStart;
    await this.settle(this.scenarioCeilingMs, "occlusion settle");
    return {
      deliveries: stream.batches.length,
      summary: resumeSummary,
      details: {
        deliveredBeforeHidden: beforeHidden,
        framesBeforeHidden,
        framesWhileHidden,
        awakeWhileHidden,
        hiddenMs: Math.round(this.host.now() - hiddenStart),
        resumeFrames: resumeSummary.frames,
        resumeMs: Math.round(resumeMs),
      },
    };
  }

  /** Resets the canvas to an empty workstream and starts its fixture clock. */
  private loadFixture(fixture: PackedGraphFixtureName, rate: number): FixtureStream {
    const batches = packedGraphFixtureBatches(fixture);
    const workstreamId = packedGraphScene(fixture).workstreamId;
    this.canvas.setSnapshot(emptyPackedGraphSnapshot(workstreamId));
    this.clock.start(this.host.now(), 0, rate);
    return { batches, times: batchSceneTimes(batches), workstreamId, limit: batches.length };
  }

  /** Pushes each batch when the replay clock reaches its committed time. */
  private async playStream(
    stream: FixtureStream,
    budgetMs: number,
    label: string,
    allowDeadline: boolean = false,
  ): Promise<number> {
    const limit = Math.min(stream.limit, stream.batches.length);
    const from = stream.from ?? 0;
    let index = from;
    let idle = 0;
    await this.drive(
      (timestampMs) => {
        const sceneSeconds = this.clock.secondsAt(timestampMs);
        while (index < limit) {
          const due = stream.times[index] ?? 0;
          const batch = stream.batches[index];
          if (batch === undefined || due > sceneSeconds) {
            break;
          }
          this.canvas.pushBatch(batch);
          index += 1;
        }
        if (index < limit) {
          return false;
        }
        idle = this.canvas.isAwake() ? 0 : idle + 1;
        return idle >= idleFramesToFinish;
      },
      budgetMs,
      label,
      allowDeadline,
    );
    return index - from;
  }

  private sampleHeap(): void {
    const bytes = this.host.heapBytes();
    if (bytes === null) {
      return;
    }
    this.peakHeapBytes = Math.max(this.peakHeapBytes ?? 0, bytes);
  }

  /** Waits for the graph to stop moving. */
  private async settle(budgetMs: number, label: string): Promise<void> {
    let idle = 0;
    await this.drive(
      () => {
        idle = this.canvas.isAwake() ? 0 : idle + 1;
        return idle >= idleFramesToFinish;
      },
      budgetMs,
      label,
    );
  }

  /** Runs `step` on every animation frame until it succeeds or its deadline fails. */
  private drive(
    step: (timestampMs: number) => boolean,
    budgetMs: number,
    label: string,
    allowDeadline: boolean = false,
  ): Promise<void> {
    const boundedBudgetMs = Math.min(budgetMs, this.scenarioCeilingMs);
    const deadline = this.host.now() + boundedBudgetMs;
    return new Promise((resolve, reject) => {
      const tick = (timestampMs: number): void => {
        try {
          this.sampleHeap();
          if (step(timestampMs)) {
            resolve();
            return;
          }
          if (this.host.now() >= deadline) {
            if (allowDeadline) {
              resolve();
            } else {
              reject(new Error(`${label} timed out after ${Math.round(boundedBudgetMs)} ms`));
            }
            return;
          }
          this.host.requestFrame(tick);
        } catch (error) {
          reject(error);
        }
      };
      this.host.requestFrame(tick);
    });
  }
}

interface FixtureStream {
  readonly batches: readonly PackedGraphBatch[];
  readonly times: readonly number[];
  readonly workstreamId: string;
  /** First batch this pass delivers; a resume starts at a durable cursor. */
  readonly from?: number;
  /** How many of the batches this pass delivers. */
  readonly limit: number;
}

interface ScenarioOutcome {
  readonly deliveries: number;
  readonly summary: GraphPerformanceSummary;
  readonly details: Readonly<Record<string, number | boolean | string>>;
}
