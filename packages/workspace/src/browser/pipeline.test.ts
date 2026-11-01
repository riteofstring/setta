import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserPipeline } from "./client.js";
import { executeBrowserPipeline, validateBrowserPipeline } from "./execute.js";
import { exposeBrowserPipeline } from "./worker.js";
import type {
  BrowserPipelineWorker,
  BrowserPipelineWorkerScope,
  BrowserStageProgress,
} from "./types.js";

class TestWorker extends EventTarget implements BrowserPipelineWorker {
  sent: unknown[] = [];
  terminated = false;
  postMessage(message: unknown) {
    this.sent.push(structuredClone(message));
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

afterEach(() => vi.useRealTimers());

describe("browser pipeline execution", () => {
  it("delivers progress during work and ignores reports after settlement or abort", async () => {
    const reports = vi.fn();
    let late: ((progress: BrowserStageProgress) => void) | undefined;
    const controller = new AbortController();
    await expect(
      executeBrowserPipeline(
        [
          {
            id: "download",
            run: ({ reportProgress }) => {
              late = reportProgress;
              reportProgress({ fraction: 0.25, message: "Downloading" });
              return "model";
            },
          },
          {
            id: "infer",
            dependencies: ["download"],
            run: ({ reportProgress }) => {
              late!({ fraction: 0.75 });
              reportProgress({ message: "Inferring" });
              controller.abort();
              reportProgress({ fraction: 1 });
            },
          },
        ],
        null,
        controller.signal,
        undefined,
        reports,
      ),
    ).rejects.toThrow();
    late!({ fraction: 1 });
    expect(reports.mock.calls).toEqual([
      ["download", { fraction: 0.25, message: "Downloading" }],
      ["infer", { message: "Inferring" }],
    ]);
  });

  it("rejects invalid fractions as stage errors", async () => {
    for (const fraction of [-1, 1.1, NaN, Infinity]) {
      await expect(
        executeBrowserPipeline(
          [
            {
              id: "work",
              run: ({ reportProgress }) => reportProgress({ fraction }),
            },
          ],
          null,
          new AbortController().signal,
        ),
      ).rejects.toThrow("between zero and one");
    }
  });
  it("runs shared ancestors once and joins results from the same input", async () => {
    const prepare = vi.fn(({ input }: { input: number }) => input * 2);
    const result = await executeBrowserPipeline(
      [
        { id: "prepare", run: prepare },
        {
          id: "left",
          dependencies: ["prepare"],
          run: ({ dependencies }) => Number(dependencies.prepare) + 1,
        },
        {
          id: "right",
          dependencies: ["prepare"],
          run: ({ dependencies }) => Number(dependencies.prepare) + 2,
        },
        {
          id: "join",
          dependencies: ["left", "right"],
          run: ({ dependencies }) =>
            Number(dependencies.left) + Number(dependencies.right),
        },
      ],
      5,
      new AbortController().signal,
    );
    expect(result.join).toBe(23);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("refuses missing dependencies and cycles before running code", () => {
    const run = vi.fn();
    expect(() =>
      validateBrowserPipeline([{ id: "a", dependencies: ["missing"], run }]),
    ).toThrow("Unknown");
    expect(() =>
      validateBrowserPipeline([
        { id: "a", dependencies: ["b"], run },
        { id: "b", dependencies: ["a"], run },
      ]),
    ).toThrow("cycle");
    expect(run).not.toHaveBeenCalled();
  });

  it("does not run a dependent stage after failure or cancellation", async () => {
    const run = vi.fn();
    await expect(
      executeBrowserPipeline(
        [
          {
            id: "source",
            run: () => {
              throw new Error("bad ink");
            },
          },
          { id: "print", dependencies: ["source"], run },
        ],
        null,
        new AbortController().signal,
      ),
    ).rejects.toThrow("bad ink");
    await expect(
      executeBrowserPipeline([{ id: "print", run }], null, AbortSignal.abort()),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it("executes a worker request and reports failures through the same channel", async () => {
    const target = new EventTarget();
    const messages: unknown[] = [];
    const scope: BrowserPipelineWorkerScope = {
      postMessage: (message) => {
        messages.push(message);
      },
      addEventListener: (type, listener) =>
        target.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) =>
        target.removeEventListener(type, listener as EventListener),
    };
    const stop = exposeBrowserPipeline(scope, [
      {
        id: "double",
        run: ({ input, reportProgress }) => {
          reportProgress({ fraction: 0.5 });
          return Number(input) * 2;
        },
      },
    ]);
    target.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "run", revision: 7, input: 8 },
      }),
    );
    await vi.waitFor(() =>
      expect(messages).toContainEqual({
        type: "result",
        revision: 7,
        output: { double: 16 },
      }),
    );
    expect(messages).toContainEqual({
      type: "progress",
      revision: 7,
      id: "double",
      progress: { fraction: 0.5 },
    });
    stop();
    const count = messages.length;
    target.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "run", revision: 8, input: 3 },
      }),
    );
    await Promise.resolve();
    expect(messages).toHaveLength(count);
  });
});

describe("browser pipeline lifecycle", () => {
  it("isolates progress by revision without completing work or extending its deadline", () => {
    vi.useFakeTimers();
    const worker = new TestWorker();
    const pipeline = createBrowserPipeline<number>({
      createWorker: () => worker,
      timeoutMs: 50,
    });
    pipeline.run(1);
    worker.reply({
      type: "progress",
      revision: 1,
      id: "load",
      progress: { fraction: 0.2 },
    });
    expect(pipeline.getSnapshot()).toMatchObject({
      status: "running",
      progress: { load: { fraction: 0.2 } },
    });
    pipeline.run(2);
    worker.reply({
      type: "progress",
      revision: 1,
      id: "load",
      progress: { fraction: 0.5 },
    });
    expect(pipeline.getSnapshot().progress).toEqual({});
    worker.reply({ type: "result", revision: 1, output: {} });
    vi.advanceTimersByTime(30);
    worker.reply({
      type: "progress",
      revision: 2,
      id: "load",
      progress: { fraction: 0.6 },
    });
    expect(pipeline.getSnapshot().progress.load).toEqual({ fraction: 0.6 });
    vi.advanceTimersByTime(20);
    expect(pipeline.getSnapshot().status).toBe("error");
    pipeline.cancel();
    expect(pipeline.getSnapshot().progress).toEqual({});
    pipeline.dispose();
  });
  it("coalesces changing inputs and rejects an older result", () => {
    const worker = new TestWorker();
    const pipeline = createBrowserPipeline<number>({
      createWorker: () => worker,
    });
    pipeline.run(1);
    pipeline.run(2);
    pipeline.run(3);
    expect(worker.sent).toHaveLength(1);
    worker.reply({ type: "result", revision: 1, output: { result: 1 } });
    expect(pipeline.getSnapshot().output).toBeNull();
    expect(worker.sent.at(-1)).toEqual({ type: "run", revision: 3, input: 3 });
    worker.reply({ type: "result", revision: 3, output: { result: 9 } });
    expect(pipeline.getSnapshot()).toMatchObject({
      status: "ready",
      output: { result: 9 },
      outputRevision: 3,
    });
    pipeline.dispose();
  });

  it("retains valid output on errors and can recover using a fresh worker", () => {
    const workers = [new TestWorker(), new TestWorker()];
    const createWorker = vi
      .fn()
      .mockReturnValueOnce(workers[0])
      .mockReturnValueOnce(workers[1]);
    const pipeline = createBrowserPipeline<number>({ createWorker });
    pipeline.run(2);
    workers[0]!.reply({ type: "result", revision: 1, output: { result: 4 } });
    pipeline.run(3);
    workers[0]!.reply({ type: "error", revision: 2, error: "broken recipe" });
    expect(pipeline.getSnapshot()).toMatchObject({
      status: "error",
      error: "broken recipe",
      output: { result: 4 },
    });
    pipeline.run(5);
    workers[1]!.reply({ type: "result", revision: 3, output: { result: 10 } });
    expect(pipeline.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      output: { result: 10 },
    });
    pipeline.dispose();
  });

  it("terminates hung work, cancels queued work, and rejects use after disposal", () => {
    vi.useFakeTimers();
    const worker = new TestWorker();
    const pipeline = createBrowserPipeline<number>({
      createWorker: () => worker,
      timeoutMs: 50,
    });
    pipeline.run(1);
    vi.advanceTimersByTime(50);
    expect(worker.terminated).toBe(true);
    expect(pipeline.getSnapshot().status).toBe("error");
    pipeline.cancel();
    expect(pipeline.getSnapshot().status).toBe("cancelled");
    pipeline.dispose();
    expect(() => pipeline.run(4)).toThrow("disposed");
  });

  it("captures submitted input before it can be mutated", () => {
    const worker = new TestWorker();
    const pipeline = createBrowserPipeline<{ value: number }>({
      createWorker: () => worker,
    });
    pipeline.run({ value: 1 });
    const input = { value: 2 };
    pipeline.run(input);
    input.value = 99;
    worker.reply({ type: "result", revision: 1, output: {} });
    expect(worker.sent.at(-1)).toEqual({
      type: "run",
      revision: 2,
      input: { value: 2 },
    });
    pipeline.dispose();
  });
});
