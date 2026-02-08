import type { Spec } from "@json-render/core";

import {
  applyPatchOp,
  createEmptySpec,
  parsePatchLine,
} from "utils/appSpecPatchStream";

type StreamState = {
  remainder: string;
  spec: Spec;
  lastUpdatedMs: number;
};

const streamByToolCallId = new Map<string, StreamState>();

const STREAM_TTL_MS = 10 * 60 * 1000;

function cleanupStaleStreams(nowMs: number): void {
  for (const [toolCallId, stream] of streamByToolCallId.entries()) {
    if (nowMs - stream.lastUpdatedMs > STREAM_TTL_MS) {
      streamByToolCallId.delete(toolCallId);
    }
  }
}

export function applyAppSpecPatchPreviewDelta({
  toolCallId,
  previewValueDelta,
}: {
  toolCallId: string;
  previewValueDelta: string;
}): Spec | null {
  if (!toolCallId || !previewValueDelta) {
    return null;
  }
  const nowMs = Date.now();
  const existing =
    streamByToolCallId.get(toolCallId) ??
    (() => {
      const created: StreamState = {
        remainder: "",
        spec: createEmptySpec(),
        lastUpdatedMs: nowMs,
      };
      streamByToolCallId.set(toolCallId, created);
      return created;
    })();

  existing.lastUpdatedMs = nowMs;
  cleanupStaleStreams(nowMs);

  existing.remainder += previewValueDelta;
  if (!existing.remainder.includes("\n")) {
    return null;
  }

  const lines = existing.remainder.split("\n");
  existing.remainder = lines.pop() ?? "";

  let appliedAny = false;
  for (const line of lines) {
    const patch = parsePatchLine(line);
    if (!patch) {
      continue;
    }
    applyPatchOp(existing.spec, patch);
    appliedAny = true;
  }
  if (!appliedAny) {
    return null;
  }

  // `existing.spec` is mutated in place. Return a new reference so selectors using
  // `Object.is` can observe changes and rerender.
  return { ...existing.spec, elements: { ...existing.spec.elements } };
}

export function clearAppSpecPatchStream(toolCallId: string): void {
  if (!toolCallId) {
    return;
  }
  streamByToolCallId.delete(toolCallId);
}

export function clearAllAppSpecPatchStreams(): void {
  streamByToolCallId.clear();
}

export function __resetAppSpecPatchStreamsForTests(): void {
  clearAllAppSpecPatchStreams();
}

export function __getAppSpecPatchStreamCountForTests(): number {
  return streamByToolCallId.size;
}
