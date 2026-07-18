import { describe, expect, test } from "vitest";

import { BufferedMicrophoneWorkletEngine } from "./buffered-microphone-worklet-engine";

describe("buffered microphone worklet engine", () => {
  test("retains input and emits silence before release", () => {
    const engine = engineWithCapacity(8);
    const output = new Float32Array(2);

    const events = engine.process(samples(1, 2), output);

    expect([...output]).toEqual([0, 0]);
    expect(events.map((event) => event.type)).toEqual(["ready"]);
    expect(engine.metrics()).toMatchObject({
      capturedFrames: 2,
      emittedSilenceFrames: 2,
      queuedFrames: 2,
    });
  });

  test("reports readiness when the connected processor starts before input arrives", () => {
    const engine = engineWithCapacity(8);
    const firstOutput = new Float32Array(2);

    const readyEvents = engine.process(null, firstOutput);

    expect([...firstOutput]).toEqual([0, 0]);
    expect(readyEvents).toMatchObject([{ sequence: 0, type: "ready" }]);
    expect(engine.metrics()).toMatchObject({
      capturedFrames: 0,
      emittedSilenceFrames: 2,
      queuedFrames: 0,
    });

    const secondOutput = new Float32Array(2);
    const inputEvents = engine.process(samples(1, 2), secondOutput);

    expect(inputEvents).toEqual([]);
    expect(engine.metrics()).toMatchObject({
      capturedFrames: 2,
      queuedFrames: 2,
    });
  });

  test("does not report readiness when the first input overflows", () => {
    const engine = engineWithCapacity(1);
    const output = new Float32Array(2);

    const events = engine.process(samples(1, 2), output);

    expect([...output]).toEqual([0, 0]);
    expect(events.map((event) => event.type)).toEqual(["overflow"]);
    expect(engine.active).toBe(false);
    expect(engine.metrics().queuedFrames).toBe(0);
  });

  test("releases retained frames once and keeps a fixed backlog while input continues", () => {
    const engine = engineWithCapacity(8);
    engine.process(samples(1, 2), new Float32Array(2));
    engine.process(samples(3, 4), new Float32Array(2));

    expect(engine.command({ sequence: 1, type: "release" })).toMatchObject([
      { queuedFrames: 4, sequence: 1, type: "released" },
    ]);

    const firstOutput = new Float32Array(2);
    engine.process(samples(5, 6), firstOutput);
    expect([...firstOutput]).toEqual([1, 2]);
    expect(engine.metrics().queuedFrames).toBe(4);

    const secondOutput = new Float32Array(2);
    engine.process(samples(7, 8), secondOutput);
    expect([...secondOutput]).toEqual([3, 4]);
    expect(engine.metrics().queuedFrames).toBe(4);
  });

  test("holds a finish-before-release request until release, then drains tail and post-roll", () => {
    const engine = engineWithCapacity(12, 2);
    engine.process(samples(1, 2), new Float32Array(2));
    engine.process(samples(3, 4), new Float32Array(2));

    expect(engine.command({ postRollFrames: 2, sequence: 1, type: "finish" })).toMatchObject([
      { postRollFrames: 2, queuedFrames: 4, sequence: 1, type: "finish_started" },
    ]);

    const heldOutput = new Float32Array(2);
    engine.process(samples(5, 6), heldOutput);
    expect([...heldOutput]).toEqual([0, 0]);
    expect(engine.metrics()).toMatchObject({
      capturedFrames: 4,
      queuedFrames: 4,
    });

    expect(engine.command({ sequence: 2, type: "release" })).toMatchObject([
      { queuedFrames: 4, sequence: 2, type: "released" },
    ]);

    const firstDrain = new Float32Array(2);
    expect(engine.process(null, firstDrain)).toEqual([]);
    expect([...firstDrain]).toEqual([1, 2]);

    const secondDrain = new Float32Array(2);
    expect(engine.process(null, secondDrain)).toEqual([]);
    expect([...secondDrain]).toEqual([3, 4]);

    const postRoll = new Float32Array(2);
    const drainEvents = engine.process(null, postRoll);
    expect([...postRoll]).toEqual([0, 0]);
    expect(drainEvents).toMatchObject([{ sequence: 1, type: "drained" }]);
    expect(engine.active).toBe(false);
    expect(engine.metrics()).toMatchObject({
      emittedQueuedFrames: 4,
      postRollFrames: 2,
      queuedFrames: 0,
    });
  });

  test("reports capacity overflow without overwriting retained frames", () => {
    const engine = engineWithCapacity(3);
    engine.process(samples(1, 2), new Float32Array(2));

    const output = new Float32Array(2);
    const events = engine.process(samples(3, 4), output);

    expect([...output]).toEqual([0, 0]);
    expect(events).toMatchObject([
      {
        capacityFrames: 3,
        incomingFrames: 2,
        queuedFrames: 2,
        type: "overflow",
      },
    ]);
    expect(engine.active).toBe(false);
    expect(engine.metrics().queuedFrames).toBe(0);
  });

  test("close discards queued samples and rejects later processing", () => {
    const engine = engineWithCapacity(8);
    engine.process(samples(1, 2), new Float32Array(2));

    expect(engine.command({ sequence: 1, type: "close" })).toMatchObject([
      { sequence: 1, type: "closed" },
    ]);

    const output = new Float32Array(2);
    expect(engine.process(samples(3, 4), output)).toEqual([]);
    expect([...output]).toEqual([0, 0]);
    expect(engine.metrics().queuedFrames).toBe(0);
  });
});

function engineWithCapacity(
  capacityFrames: number,
  defaultPostRollFrames = 0,
): BufferedMicrophoneWorkletEngine {
  return new BufferedMicrophoneWorkletEngine({
    capacityFrames,
    defaultPostRollFrames,
    sampleRate: 48_000,
  });
}

function samples(...values: number[]): Float32Array {
  return Float32Array.from(values);
}
