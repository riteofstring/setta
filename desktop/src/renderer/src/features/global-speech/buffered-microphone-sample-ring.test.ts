import { describe, expect, test } from "vitest";

import {
  BoundedSampleRing,
  BoundedSampleRingOverflowError,
} from "./buffered-microphone-sample-ring";

describe("bounded sample ring", () => {
  test("preserves sample order across wraparound reads and writes", () => {
    const ring = new BoundedSampleRing(5);
    ring.push(samples(1, 2, 3));

    const firstRead = new Float32Array(2);
    expect(ring.read(firstRead)).toBe(2);
    expect([...firstRead]).toEqual([1, 2]);

    ring.push(samples(4, 5, 6, 7));
    expect(ring.queuedFrames).toBe(5);

    const secondRead = new Float32Array(5);
    expect(ring.read(secondRead)).toBe(5);
    expect([...secondRead]).toEqual([3, 4, 5, 6, 7]);
    expect(ring.queuedFrames).toBe(0);
  });

  test("fails before overwriting unread samples", () => {
    const ring = new BoundedSampleRing(3);
    ring.push(samples(1, 2));

    expect(() => ring.push(samples(3, 4))).toThrow(BoundedSampleRingOverflowError);

    const output = new Float32Array(2);
    expect(ring.read(output)).toBe(2);
    expect([...output]).toEqual([1, 2]);
  });

  test("clears queued samples and capacity accounting", () => {
    const ring = new BoundedSampleRing(4);
    ring.push(samples(1, 2, 3));
    ring.clear();
    ring.push(samples(4, 5, 6, 7));

    const output = new Float32Array(4);
    expect(ring.read(output)).toBe(4);
    expect([...output]).toEqual([4, 5, 6, 7]);
  });
});

function samples(...values: number[]): Float32Array {
  return Float32Array.from(values);
}
