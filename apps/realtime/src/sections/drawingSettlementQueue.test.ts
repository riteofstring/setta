import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentReference } from "../backend/generatedContract";
import {
  DrawingSettlementQueue,
  type DrawingSnapshot,
} from "./drawingSettlementQueue";

function reference(id: string): ContentReference {
  return {
    byteLength: 3,
    id,
    invocationId: `stage-${id}`,
    mediaType: "image/png",
    sha256: "a".repeat(64),
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("drawing settlement queue", () => {
  it("coalesces unsettled revisions into one persisted raster event", async () => {
    vi.useFakeTimers();
    const snapshot: DrawingSnapshot = {
      blob: new Blob(["new"], { type: "image/png" }),
      scene: { objects: [{ id: "new" }] },
    };
    const capture = vi.fn(async () => snapshot);
    const commit = vi.fn(async () => true);
    const upload = vi.fn(async () => reference("new"));
    const emit = vi.fn();
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit,
      delayMilliseconds: 180,
      emit,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    queue.settle();
    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();

    expect(capture).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(snapshot.scene);
    expect(upload).toHaveBeenCalledWith(snapshot.blob);
    expect(emit).toHaveBeenCalledWith(reference("new"));
    queue.dispose();
  });

  it("keeps one upload in flight and replaces pending work with the latest revision", async () => {
    vi.useFakeTimers();
    let finishFirstUpload: (value: ContentReference) => void = () => {};
    const firstUpload = new Promise<ContentReference>((resolve) => {
      finishFirstUpload = resolve;
    });
    const first: DrawingSnapshot = {
      blob: new Blob(["first"], { type: "image/png" }),
      scene: { objects: [{ id: "first" }] },
    };
    const latest: DrawingSnapshot = {
      blob: new Blob(["latest"], { type: "image/png" }),
      scene: { objects: [{ id: "latest" }] },
    };
    const capture = vi
      .fn<() => Promise<DrawingSnapshot>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(latest);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockImplementationOnce(() => firstUpload)
      .mockResolvedValueOnce(reference("latest"));
    const emit = vi.fn();
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit: vi.fn(async () => true),
      delayMilliseconds: 180,
      emit,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();
    expect(upload).toHaveBeenCalledTimes(1);

    queue.settle();
    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);

    finishFirstUpload(reference("first"));
    await flushMicrotasks();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(reference("latest"));
    queue.dispose();
  });

  it("persists the scene without uploading while invocation is unavailable", async () => {
    vi.useFakeTimers();
    const scene = { objects: [] };
    const commit = vi.fn(async () => true);
    const upload = vi.fn(async () => reference("unused"));
    const queue = new DrawingSettlementQueue({
      canEmit: () => false,
      capture: vi.fn(async () => ({
        blob: new Blob(["scene"], { type: "image/png" }),
        scene,
      })),
      capturePreview: vi.fn(async () => ({
        blob: new Blob(["preview"], { type: "image/png" }),
        scene,
      })),
      commit,
      delayMilliseconds: 180,
      emit: vi.fn(),
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();

    expect(commit).toHaveBeenCalledWith(scene);
    expect(upload).not.toHaveBeenCalled();
    queue.dispose();
  });

  it("emits a persisted drawing when invocation becomes available", async () => {
    vi.useFakeTimers();
    let canEmit = false;
    const snapshot: DrawingSnapshot = {
      blob: new Blob(["scene"], { type: "image/png" }),
      scene: { objects: [{ id: "waiting" }] },
    };
    const capture = vi.fn(async () => snapshot);
    const commit = vi.fn(async () => true);
    const upload = vi.fn(async () => reference("waiting"));
    const emit = vi.fn();
    const queue = new DrawingSettlementQueue({
      canEmit: () => canEmit,
      capture,
      capturePreview: capture,
      commit,
      delayMilliseconds: 180,
      emit,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();
    canEmit = true;
    queue.resume();
    await flushMicrotasks();

    expect(capture).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(snapshot.blob);
    expect(emit).toHaveBeenCalledWith(reference("waiting"));
    queue.dispose();
  });

  it("streams throttled drawing previews before a gesture settles", async () => {
    vi.useFakeTimers();
    const settled: DrawingSnapshot = {
      blob: new Blob(["settled"], { type: "image/png" }),
      scene: { objects: [{ id: "settled" }] },
    };
    const preview: DrawingSnapshot = {
      blob: new Blob(["preview"], { type: "image/png" }),
      scene: { objects: [] },
    };
    const capturePreview = vi.fn(async () => preview);
    const commit = vi.fn(async () => true);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockResolvedValueOnce(reference("preview"))
      .mockResolvedValueOnce(reference("settled"));
    const emit = vi.fn();
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture: vi.fn(async () => settled),
      capturePreview,
      commit,
      delayMilliseconds: 180,
      emit,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.preview();
    queue.preview();
    await vi.advanceTimersByTimeAsync(90);
    await flushMicrotasks();

    expect(capturePreview).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(reference("preview"));

    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();

    expect(commit).toHaveBeenCalledWith(settled.scene);
    expect(emit).toHaveBeenLastCalledWith(reference("settled"));
    queue.dispose();
  });
});
