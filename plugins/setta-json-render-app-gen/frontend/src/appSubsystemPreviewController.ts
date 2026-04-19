import type { Spec } from "@json-render/core";

import type { AppDefinition } from "utils/generatedTypes";

import { useAppDefinition } from "./appSubsystemDefinitionState";
import {
  applyPatchOp,
  createEmptySpec,
  parsePatchLine,
} from "./appSpecPatchStream";
import { useAppPreview } from "./appSubsystemProjectState";

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

  const buffer = existing.remainder + previewValueDelta;
  let cursor = 0;
  let appliedAny = false;
  while (true) {
    const newlineIndex = buffer.indexOf("\n", cursor);
    if (newlineIndex === -1) {
      break;
    }
    const line = buffer.slice(cursor, newlineIndex);
    cursor = newlineIndex + 1;
    const patch = parsePatchLine(line);
    if (!patch) {
      continue;
    }
    applyPatchOp(existing.spec, patch);
    appliedAny = true;
  }
  existing.remainder = buffer.slice(cursor);
  if (!appliedAny) {
    return null;
  }

  // `existing.spec` is mutated in place. Return a new reference so selectors using
  // `Object.is` can observe changes and rerender.
  return { ...existing.spec, elements: { ...existing.spec.elements } };
}

function clearAppPreviewOverrides(): void {
  useAppPreview.setState({
    previewSpecOverride: undefined,
    aiPreviewSpecOverride: undefined,
    previewThemeOverride: undefined,
    previewAssetsOverride: undefined,
  });
}

export function applyAppSpecPatchPreviewDeltaToStore(args: {
  toolCallId: string;
  previewValueDelta: string;
}): void {
  const nextSpec = applyAppSpecPatchPreviewDelta(args);
  if (!nextSpec) {
    return;
  }
  useAppPreview.setState({ aiPreviewSpecOverride: nextSpec });
}

export function applyAppDefinitionStructuredContentToStore(
  structured: Record<string, unknown>,
): boolean {
  const hasSpec = Object.prototype.hasOwnProperty.call(structured, "appSpec");
  const hasDefinition = Object.prototype.hasOwnProperty.call(
    structured,
    "appDefinition",
  );
  if (!hasSpec && !hasDefinition) {
    return false;
  }
  const nextSpec = hasSpec ? (structured.appSpec as unknown) : undefined;
  const nextDefinition = hasDefinition
    ? (structured.appDefinition as unknown)
    : undefined;
  useAppDefinition.setState((state) => ({
    appSpec: nextSpec === undefined ? state.appSpec : nextSpec ?? null,
    appDefinition:
      nextDefinition === undefined
        ? state.appDefinition
        : ((nextDefinition ?? null) as AppDefinition | null),
  }));
  clearAppPreviewOverrides();
  return true;
}

function clearAppSpecPatchStream(toolCallId: string): void {
  if (!toolCallId) {
    return;
  }
  streamByToolCallId.delete(toolCallId);
}

export function clearAllAppSpecPatchStreams(): void {
  streamByToolCallId.clear();
}

export const clearAppSpecPatchPreviewStream = clearAppSpecPatchStream;
export const clearAllAppSpecPatchPreviewStreams = clearAllAppSpecPatchStreams;
