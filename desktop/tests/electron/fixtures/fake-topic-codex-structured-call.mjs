export function assertStructuredCallParams(params) {
  const config = requiredObject(params, "config");
  assertStructuredCallPolicies(params);
  assertStructuredCallConfig(config);
  assertStructuredCallCapabilities(params);
}

function assertStructuredCallPolicies(params) {
  assertCondition(params.approvalPolicy === "never", "approval policy");
  assertCondition(params.sandbox === "read-only", "sandbox policy");
  assertCondition(Object.hasOwn(params, "serviceTier"), "service tier override");
  assertCondition(params.ephemeral === true, "ephemeral lifecycle");
  assertCondition(typeof params.model === "string" && params.model !== "", "exact model");
  const baseInstructions = requiredString(params, "baseInstructions");
  assertCondition(
    baseInstructions.includes("restricted Setta reasoning component"),
    "controlled base instructions",
  );
}

function assertStructuredCallConfig(config) {
  const features = requiredObject(config, "features");
  const orchestrator = requiredObject(config, "orchestrator");
  const orchestratorMcp = requiredObject(orchestrator, "mcp");
  const orchestratorSkills = requiredObject(orchestrator, "skills");
  const mcpServers = requiredObject(config, "mcp_servers");
  const configuredServer = requiredObject(mcpServers, "configured-topic-server");
  assertCondition(typeof config.model_reasoning_effort === "string", "reasoning effort");
  assertCondition(config.project_doc_max_bytes === 0, "project instructions");
  assertCondition(config.web_search === "disabled", "web search");
  assertCondition(orchestratorMcp.enabled === false, "orchestrator MCP");
  assertCondition(orchestratorSkills.enabled === false, "orchestrator skills");
  assertCondition(configuredServer.enabled === false, "configured MCP server");
  assertStructuredCallFeatures(features);
}

function assertStructuredCallFeatures(features) {
  assertCondition(features.apps === false, "apps feature");
  assertCondition(features.auth_elicitation === false, "auth elicitation feature");
  assertCondition(features.browser_use === false, "browser feature");
  assertCondition(features.hooks === false, "hooks feature");
  assertCondition(features.multi_agent === false, "multi-agent feature");
  assertCondition(features.plugins === false, "plugins feature");
  assertCondition(features.secret_auth_storage === false, "secret auth storage feature");
  assertCondition(features.shell_snapshot === false, "shell snapshot feature");
  assertCondition(features.shell_tool === false, "shell feature");
  assertCondition(features.tool_call_mcp_elicitation === false, "MCP elicitation feature");
  assertCondition(features.unified_exec === false, "unified exec feature");
}

function assertStructuredCallCapabilities(params) {
  assertEmptyArray(params.runtimeWorkspaceRoots, "runtime workspace roots");
  assertEmptyArray(params.dynamicTools, "dynamic tools");
  assertEmptyArray(params.environments, "turn environments");
  assertEmptyArray(params.selectedCapabilityRoots, "capability roots");
}

function requiredObject(value, field) {
  const result = value?.[field];
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error(`${field} must be an object`);
  }
  return result;
}

function requiredString(value, field) {
  const result = value?.[field];
  if (typeof result !== "string" || result === "") {
    throw new Error(`${field} is required`);
  }
  return result;
}

function assertEmptyArray(value, label) {
  assertCondition(Array.isArray(value) && value.length === 0, label);
}

function assertCondition(condition, label) {
  if (!condition) throw new Error(`structured-call thread ${label} boundary drifted`);
}
