export async function assertRendererQueueMatchesBackend(client, queuedPrompt) {
  const body = await client.evaluate("document.body.innerText");
  if (!body.includes(queuedPrompt) || !body.includes("Queued")) {
    throw new Error(`renderer did not show queued state for ${queuedPrompt}: ${body}`);
  }
}

export async function assertNoCriticalDiagnostics(backend, workspaceId, conversationId) {
  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId: "",
    workspaceId,
  });
  const critical = diagnostics.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "critical",
  );
  if (critical.length > 0) {
    throw new Error(`critical diagnostics recorded: ${JSON.stringify(critical)}`);
  }
}
