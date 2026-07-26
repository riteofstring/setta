import {
  validateArtifactToolFailureResult,
  validateArtifactToolResult,
} from "./fake-topic-artifact-tool.mjs";

export function artifactToolResponseAction(requestId, pending, message) {
  if (message.error) {
    throw new Error(`artifact tool ${requestId} failed: ${message.error.message}`);
  }
  if (pending.scenario.unresolvedFailure) {
    validateArtifactToolFailureResult(
      requestId,
      message.result,
      pending.scenario.expectedFailureCode,
      pending.scenario.expectedFailureFields,
    );
    return { kind: "complete" };
  }
  validateArtifactToolResult(requestId, message.result, pending.arguments);
  const nextIndex = pending.index + 1;
  if (nextIndex < pending.scenario.artifacts.length) {
    return { kind: "next", nextIndex };
  }
  return { kind: "complete" };
}
