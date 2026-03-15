import type { AgenticScopeViolationEdge } from "state/stores/aiStores";
import { AgenticEdgeKindEnum, ToolResultEvent } from "utils/generatedTypes";

const scopeViolationEdgeKinds = new Set(Object.values(AgenticEdgeKindEnum));

export function extractAgenticScopeViolation(
  toolResult: ToolResultEvent["result"],
): { edges: Array<AgenticScopeViolationEdge>; message: string } | null {
  const payload = toolResult.result;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const structured =
    "structuredContent" in payload
      ? (payload as { structuredContent?: unknown }).structuredContent
      : null;
  if (!structured || typeof structured !== "object") {
    return null;
  }
  const structuredPayload = structured as {
    error?: unknown;
    message?: unknown;
    missingEdgesCanonical?: unknown;
  };
  if (structuredPayload.error !== "ScopeViolation") {
    return null;
  }
  const message =
    typeof structuredPayload.message === "string"
      ? structuredPayload.message
      : "Tool blocked by agentic scope.";
  const edgesRaw: unknown[] = Array.isArray(
    structuredPayload.missingEdgesCanonical,
  )
    ? structuredPayload.missingEdgesCanonical
    : [];
  const edges = edgesRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const edge = entry as {
        sourceSectionId?: unknown;
        targetSectionId?: unknown;
        kind?: unknown;
      };
      if (
        typeof edge.sourceSectionId !== "string" ||
        typeof edge.targetSectionId !== "string" ||
        typeof edge.kind !== "string"
      ) {
        return null;
      }
      if (!scopeViolationEdgeKinds.has(edge.kind)) {
        return null;
      }
      return {
        sourceSectionId: edge.sourceSectionId,
        targetSectionId: edge.targetSectionId,
        kind: edge.kind as AgenticEdgeKindEnum,
      };
    })
    .filter((entry): entry is AgenticScopeViolationEdge => Boolean(entry));
  return { edges, message };
}
