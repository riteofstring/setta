export function assertThreadStartDynamicTools(params) {
  assertAllowedDynamicTools(params);
  const workspaceContext = workspaceContextTool(params);
  assertWorkspaceContextVisibility(workspaceContext);
  assertWorkspaceContextDescription(workspaceContext);
  assertWorkspaceContextInputSchema(workspaceContext);
}

function assertAllowedDynamicTools(params) {
  const tools = params?.dynamicTools;
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("thread/start missing dynamicTools");
  }
  const names = tools.map((tool) => `${tool?.namespace ?? ""}.${tool?.name ?? ""}`).sort();
  const expected = ["setta.workflow_result", "setta.workspace_context"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `thread/start dynamic tools = ${JSON.stringify(names)}, want ${JSON.stringify(expected)}`,
    );
  }
}

function workspaceContextTool(params) {
  const tools = params?.dynamicTools;
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error("thread/start missing dynamicTools");
  }
  const workspaceContext = tools.find(
    (tool) => tool?.namespace === "setta" && tool?.name === "workspace_context",
  );
  if (!workspaceContext) {
    throw new Error("thread/start missing setta.workspace_context dynamic tool");
  }
  return workspaceContext;
}

function assertWorkspaceContextVisibility(workspaceContext) {
  if (workspaceContext.deferLoading !== undefined) {
    throw new Error("workspace_context should be visible");
  }
}

function assertWorkspaceContextDescription(workspaceContext) {
  if (
    typeof workspaceContext.description !== "string" ||
    !workspaceContext.description.includes("workspace")
  ) {
    throw new Error("workspace_context description missing workspace terms");
  }
}

function assertWorkspaceContextInputSchema(workspaceContext) {
  if (
    workspaceContext.inputSchema?.type !== "object" ||
    workspaceContext.inputSchema?.additionalProperties !== false
  ) {
    throw new Error("workspace_context input schema mismatch");
  }
}
