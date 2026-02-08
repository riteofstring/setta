import { describe, expect, it } from "vitest";
import { dedupeInFlightJson } from "./dedupeInFlight";

describe("dedupeInFlightJson", () => {
  it("dedupes in-flight promises by JSON key", async () => {
    const cache = new Map<string, Promise<number>>();
    let calls = 0;
    const resolvers: Array<(value: number) => void> = [];

    const fn = async (_param: { a: number }) => {
      calls += 1;
      return await new Promise<number>((resolve) => {
        resolvers.push(resolve);
      });
    };

    const param = { a: 1 };
    const p1 = dedupeInFlightJson(cache, param, fn);
    const p2 = dedupeInFlightJson(cache, param, fn);
    expect(p1).toBe(p2);
    expect(calls).toBe(1);

    resolvers[0]?.(123);
    await expect(p1).resolves.toBe(123);

    const p3 = dedupeInFlightJson(cache, param, fn);
    expect(p3).not.toBe(p1);
    expect(calls).toBe(2);
    resolvers[1]?.(456);
    await expect(p3).resolves.toBe(456);
  });

  it("falls back when JSON serialization fails", async () => {
    const cache = new Map<string, Promise<number>>();
    let calls = 0;
    const param: { self?: unknown } = {};
    param.self = param;

    const fn = async () => {
      calls += 1;
      return calls;
    };

    await expect(dedupeInFlightJson(cache, param, fn)).resolves.toBe(1);
    await expect(dedupeInFlightJson(cache, param, fn)).resolves.toBe(2);
  });

  it("dedupes in-flight promises when keyFn is provided", async () => {
    const cache = new Map<string, Promise<number>>();
    let calls = 0;
    const resolvers: Array<(value: number) => void> = [];

    const fn = async (_param: { a: number; b: number }) => {
      calls += 1;
      return await new Promise<number>((resolve) => {
        resolvers.push(resolve);
      });
    };

    const p1 = dedupeInFlightJson(
      cache,
      { a: 1, b: 2 },
      fn,
      (param) => `${param.a}:${param.b}`,
    );
    const p2 = dedupeInFlightJson(
      cache,
      { b: 2, a: 1 },
      fn,
      (param) => `${param.a}:${param.b}`,
    );
    expect(p1).toBe(p2);
    expect(calls).toBe(1);

    resolvers[0]?.(99);
    await expect(p1).resolves.toBe(99);
  });
});
