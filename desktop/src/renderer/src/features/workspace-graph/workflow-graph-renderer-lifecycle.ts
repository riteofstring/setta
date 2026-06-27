export function isWorkflowGraphRendererInitAbort(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { message, name } = error as { message?: unknown; name?: unknown };
  return name === "AbortError" || message === "Workflow graph renderer initialization aborted";
}
