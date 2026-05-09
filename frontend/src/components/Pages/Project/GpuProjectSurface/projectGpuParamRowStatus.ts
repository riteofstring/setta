import type { GpuRetainedContentRowStatus } from "gpuFlow/retainedContentScene";

export function createProjectGpuParamRowStatus(
  messages: readonly string[] | undefined,
): GpuRetainedContentRowStatus | null {
  const nonEmptyMessages = (messages ?? []).filter(
    (message) => message.trim().length > 0,
  );
  if (nonEmptyMessages.length === 0) {
    return null;
  }
  return {
    kind: "error",
    messages: nonEmptyMessages,
    summary:
      nonEmptyMessages.length === 1
        ? nonEmptyMessages[0]
        : `${nonEmptyMessages.length} errors`,
  };
}
