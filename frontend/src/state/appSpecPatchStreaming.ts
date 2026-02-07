import type { Spec } from "@json-render/core";

import {
  applyPatchOp,
  createEmptySpec,
  parsePatchLine,
} from "utils/appSpecPatchStream";

type StreamState = {
  remainder: string;
  spec: Spec;
};

const streamByToolCallId = new Map<string, StreamState>();

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
  const existing =
    streamByToolCallId.get(toolCallId) ??
    (() => {
      const created: StreamState = { remainder: "", spec: createEmptySpec() };
      streamByToolCallId.set(toolCallId, created);
      return created;
    })();

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

export function __resetAppSpecPatchStreamsForTests(): void {
  streamByToolCallId.clear();
}
