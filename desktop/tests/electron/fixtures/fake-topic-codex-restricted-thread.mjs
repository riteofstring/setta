export function assertRestrictedThreadParams(params, starting) {
  const config = requiredObject(params, "config");
  assertRestrictedThreadPolicies(params);
  assertRestrictedThreadConfig(config);
  assertRestrictedThreadCapabilities(params);
  if (starting) {
    assertRestrictedThreadStartCapabilities(params);
  }
}

export function applyResumeParams(state, params) {
  state.approvalPolicy = params.approvalPolicy ?? state.approvalPolicy;
  state.cwd = params.cwd ?? state.cwd;
  state.developerInstructions = params.developerInstructions ?? state.developerInstructions;
  state.model = params.model ?? state.model;
  state.reasoningEffort = params.config?.model_reasoning_effort ?? state.reasoningEffort;
  state.sandbox = params.sandbox ?? state.sandbox;
  state.serviceTier = resumeServiceTier(state, params);
}

function resumeServiceTier(state, params) {
  if (!Object.hasOwn(params, "serviceTier")) return state.serviceTier;
  if (state.restricted && params.serviceTier === null) return "default";
  return params.serviceTier;
}

function assertRestrictedThreadPolicies(params) {
  assertCondition(params.approvalPolicy === "never", "approval policy");
  assertCondition(params.sandbox === "read-only", "sandbox policy");
  assertCondition(Object.hasOwn(params, "serviceTier"), "service tier override");
  assertCondition(typeof params.model === "string" && params.model !== "", "exact model");
  const baseInstructions = requiredString(params, "baseInstructions");
  assertCondition(
    baseInstructions.includes("restricted Setta reasoning component"),
    "controlled base instructions",
  );
}

function assertRestrictedThreadConfig(config) {
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
  assertRestrictedFeatures(features);
}

function assertRestrictedFeatures(features) {
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

function assertRestrictedThreadCapabilities(params) {
  assertEmptyArray(params.runtimeWorkspaceRoots, "runtime workspace roots");
}

function assertRestrictedThreadStartCapabilities(params) {
  assertCondition(params.ephemeral === true || params.ephemeral === false, "durability override");
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
  if (!condition) throw new Error(`restricted thread ${label} boundary drifted`);
}

export function sandboxPolicy(mode) {
  switch (mode) {
    case "read-only":
      return { networkAccess: false, type: "readOnly" };
    case "workspace-write":
      return {
        excludeSlashTmp: false,
        excludeTmpdirEnvVar: false,
        networkAccess: false,
        type: "workspaceWrite",
        writableRoots: [],
      };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    default:
      throw new Error(`unsupported sandbox mode ${mode}`);
  }
}

export function modelReasoningEffort(model) {
  if (model === "gpt-5.4-mini") return "low";
  if (model === "gpt-5.6-terra") return "medium";
  if (model === "gpt-5.6-luna") return "medium";
  return "high";
}
