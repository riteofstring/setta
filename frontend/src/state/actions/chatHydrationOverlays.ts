export function resolveHydratedToolCallArguments({
  backendToolCallArguments,
  localToolCallArguments,
  preserveLocalOverlay,
}: {
  backendToolCallArguments: Record<string, string>;
  localToolCallArguments: Record<string, string>;
  preserveLocalOverlay: boolean;
}): Record<string, string> {
  if (!preserveLocalOverlay) {
    return { ...backendToolCallArguments };
  }
  const nextToolCallArguments = { ...backendToolCallArguments };
  for (const [toolCallId, localValue] of Object.entries(
    localToolCallArguments,
  )) {
    if (
      Object.prototype.hasOwnProperty.call(nextToolCallArguments, toolCallId)
    ) {
      continue;
    }
    nextToolCallArguments[toolCallId] = localValue;
  }
  return nextToolCallArguments;
}
