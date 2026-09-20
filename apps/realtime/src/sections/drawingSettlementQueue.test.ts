import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentReference } from "../api/generatedContract";
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
      height: 240,
      scene: { objects: [{ id: "new" }] },
      width: 320,
    };
    const capture = vi.fn(async () => snapshot);
    const commit = vi.fn(async () => true);
    const upload = vi.fn(async () => reference("new"));
    const emit = vi.fn(() => true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit,
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => false,
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
    expect(commit).toHaveBeenCalledWith(snapshot);
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
      height: 240,
      scene: { objects: [{ id: "first" }] },
      width: 320,
    };
    const latest: DrawingSnapshot = {
      blob: new Blob(["latest"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "latest" }] },
      width: 320,
    };
    const capture = vi
      .fn<() => Promise<DrawingSnapshot>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(latest);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockImplementationOnce(() => firstUpload)
      .mockResolvedValueOnce(reference("latest"));
    const emit = vi.fn(() => true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit: vi.fn(async () => true),
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => false,
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
        height: 240,
        scene,
        width: 320,
      })),
      capturePreview: vi.fn(async () => ({
        blob: new Blob(["preview"], { type: "image/png" }),
        height: 240,
        scene,
        width: 320,
      })),
      commit,
      delayMilliseconds: 180,
      emit: vi.fn(() => true),
      isCompletionPaced: () => false,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await vi.advanceTimersByTimeAsync(180);
    await flushMicrotasks();

    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ scene }));
    expect(upload).not.toHaveBeenCalled();
    queue.dispose();
  });

  it("emits a persisted drawing when invocation becomes available", async () => {
    vi.useFakeTimers();
    let canEmit = false;
    const snapshot: DrawingSnapshot = {
      blob: new Blob(["scene"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "waiting" }] },
      width: 320,
    };
    const capture = vi.fn(async () => snapshot);
    const commit = vi.fn(async () => true);
    const upload = vi.fn(async () => reference("waiting"));
    const emit = vi.fn(() => true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => canEmit,
      capture,
      capturePreview: capture,
      commit,
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => false,
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
      height: 240,
      scene: { objects: [{ id: "settled" }] },
      width: 320,
    };
    const preview: DrawingSnapshot = {
      blob: new Blob(["preview"], { type: "image/png" }),
      height: 240,
      scene: { objects: [] },
      width: 320,
    };
    const capturePreview = vi.fn(async () => preview);
    const commit = vi.fn(async () => true);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockResolvedValueOnce(reference("preview"))
      .mockResolvedValueOnce(reference("settled"));
    const emit = vi.fn(() => true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture: vi.fn(async () => settled),
      capturePreview,
      commit,
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => false,
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

    expect(commit).toHaveBeenCalledWith(settled);
    expect(emit).toHaveBeenLastCalledWith(reference("settled"));
    queue.dispose();
  });

  it("paces leading previews by completed invocation capacity", async () => {
    let canEmit = true;
    const preview: DrawingSnapshot = {
      blob: new Blob(["preview"], { type: "image/png" }),
      height: 240,
      scene: { objects: [] },
      width: 320,
    };
    const capturePreview = vi.fn(async () => preview);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockResolvedValueOnce(reference("first"))
      .mockResolvedValueOnce(reference("latest"));
    const emit = vi.fn(() => true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => canEmit,
      capture: vi.fn(async () => preview),
      capturePreview,
      commit: vi.fn(async () => true),
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => true,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.preview();
    await flushMicrotasks();
    expect(capturePreview).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(reference("first"));

    canEmit = false;
    queue.preview();
    queue.preview();
    queue.preview();
    await flushMicrotasks();
    expect(capturePreview).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();

    canEmit = true;
    queue.resume();
    await flushMicrotasks();
    expect(capturePreview).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(reference("latest"));
    queue.dispose();
  });

  it("persists and prioritizes the final settled frame while busy", async () => {
    let canEmit = true;
    const preview: DrawingSnapshot = {
      blob: new Blob(["preview"], { type: "image/png" }),
      height: 240,
      scene: { objects: [] },
      width: 320,
    };
    const settled: DrawingSnapshot = {
      blob: new Blob(["settled"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "settled" }] },
      width: 320,
    };
    const capture = vi.fn(async () => settled);
    const capturePreview = vi.fn(async () => preview);
    const commit = vi.fn(async () => true);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockResolvedValueOnce(reference("preview"))
      .mockResolvedValueOnce(reference("settled"));
    const emit = vi.fn(() => true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => canEmit,
      capture,
      capturePreview,
      commit,
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => true,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.preview();
    await flushMicrotasks();
    canEmit = false;
    queue.preview();
    queue.preview();
    queue.settle();
    await flushMicrotasks();

    expect(capturePreview).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(settled);
    expect(upload).toHaveBeenCalledOnce();

    canEmit = true;
    queue.resume();
    await flushMicrotasks();
    expect(capture).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(reference("settled"));
    queue.dispose();
  });

  it("retries a final send without recapturing or reuploading", async () => {
    const snapshot: DrawingSnapshot = {
      blob: new Blob(["settled"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "settled" }] },
      width: 320,
    };
    const capture = vi.fn(async () => snapshot);
    const commit = vi.fn(async () => true);
    const upload = vi.fn(async () => reference("settled"));
    const emit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit,
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => true,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await flushMicrotasks();
    expect(emit).toHaveBeenCalledOnce();

    queue.resume();
    await flushMicrotasks();
    expect(capture).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledTimes(2);
    queue.dispose();
  });

  it("replaces a paused failed send with a newly settled frame", async () => {
    const first: DrawingSnapshot = {
      blob: new Blob(["first"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "first" }] },
      width: 320,
    };
    const latest: DrawingSnapshot = {
      blob: new Blob(["latest"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "latest" }] },
      width: 320,
    };
    const capture = vi
      .fn<() => Promise<DrawingSnapshot>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(latest);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockResolvedValueOnce(reference("first"))
      .mockResolvedValueOnce(reference("latest"));
    const emit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit: vi.fn(async () => true),
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => true,
      onError: vi.fn(),
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await flushMicrotasks();
    queue.settle();
    await flushMicrotasks();

    expect(capture).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(reference("latest"));
    queue.dispose();
  });

  it("retains a final snapshot when its upload fails", async () => {
    const snapshot: DrawingSnapshot = {
      blob: new Blob(["settled"], { type: "image/png" }),
      height: 240,
      scene: { objects: [{ id: "settled" }] },
      width: 320,
    };
    const failure = new Error("upload failed");
    const capture = vi.fn(async () => snapshot);
    const commit = vi.fn(async () => true);
    const upload = vi
      .fn<(blob: Blob) => Promise<ContentReference>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(reference("settled"));
    const emit = vi.fn(() => true);
    const onError = vi.fn();
    const queue = new DrawingSettlementQueue({
      canEmit: () => true,
      capture,
      capturePreview: capture,
      commit,
      delayMilliseconds: 180,
      emit,
      isCompletionPaced: () => true,
      onError,
      previewDelayMilliseconds: 90,
      upload,
    });

    queue.settle();
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(emit).not.toHaveBeenCalled();

    queue.resume();
    await flushMicrotasks();
    expect(capture).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith(reference("settled"));
    queue.dispose();
  });
});
