package mcpx

import (
	"context"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

func defaultBaseToolDefinitions(
	server *Server,
	workspaceRoot string,
	registry *tools.Registry,
	projectState projectStateProvider,
	codegenTargetValidator projectstate.CodegenTargetValidator,
	pythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler,
	codeUpdates codeUpdateProvider,
	settingsState settingsStateProvider,
	sectionNames sectionNameProvider,
	callableSignatures projectstate.CallableSignatureResolver,
	lspDiagnostics lspDiagnosticsProvider,
	stateMachineRuns stateMachineRunProvider,
) []toolDefinition {
	return []toolDefinition{
		{
			Spec: tools.Spec{
				Name:        "set_agentic_context",
				Description: "Persist agentic context for the current MCP session.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: server.newSetAgenticContextHandler(),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id for the scoped tool session.",
					},
					"chatId": map[string]any{
						"type":        "string",
						"description": "Optional chat id associated with the scoped tool session.",
					},
					"shareSessionId": map[string]any{
						"type":        "string",
						"description": "Optional active share-session id for deployment-scoped tool routing.",
					},
					"runId": map[string]any{
						"type":        "string",
						"description": "Optional active child run id associated with the scoped tool session.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Chat section id for scoped tool access.",
					},
					"frontendAffinityToken": map[string]any{
						"type":        "string",
						"description": "Optional frontend-affinity token for reveal-capable tools.",
					},
					"allowUnscoped": map[string]any{
						"type":        "boolean",
						"description": "Allow project-level unscoped access when true.",
					},
				},
				"required": []string{"projectConfigId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "list_mcp_tools",
				Description: "Return every registered MCP tool name without schemas or descriptions.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: func(context.Context, map[string]any) (any, error) {
					registered := registry.List()
					names := make([]string, 0, len(registered))
					for _, tool := range registered {
						names = append(names, tool.Name)
					}
					return listMCPToolsResult{Tools: names}, nil
				},
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"tools": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"tools"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "search_mcp_tools",
				Description: "Return the MCP tools that best match a natural-language query.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newSearchMCPToolsHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Search query describing the MCP capability to find.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Maximum number of matches to return; values less than 1 use the default size.",
					},
					"serverIds": map[string]any{
						"type":        "array",
						"description": "Optional MCP server ids used to scope results.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"query"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"results": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"name":        map[string]any{"type": "string"},
								"description": map[string]any{"type": "string"},
								"category":    map[string]any{"type": "string"},
							},
							"required": []string{"name", "description"},
						},
					},
				},
				"required": []string{"results"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_mcp_server_runtime_status",
				Description: "Return runtime MCP connection status for every configured MCP server.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetMCPServerRuntimeStatusHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"servers": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"serverId":      map[string]any{"type": "string"},
								"state":         map[string]any{"type": "string"},
								"toolCount":     map[string]any{"type": "integer"},
								"lastError":     map[string]any{"type": "string"},
								"missingEnvVar": map[string]any{"type": "string"},
							},
							"required": []string{"serverId", "state", "toolCount"},
						},
					},
				},
				"required": []string{"servers"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "getProjectConfigNamesAndIds",
				Description: "Return metadata for every known project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetProjectConfigNamesAndIDsHandler(projectState),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"name": map[string]any{"type": "string"},
								"id":   map[string]any{"type": "string"},
							},
							"required": []string{"name", "id"},
						},
					},
				},
				"required": []string{"projectConfigs"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "getInstalledPythonPackages",
				Description: "Return installed packages for the IDE Python interpreter as name=version strings.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetInstalledPythonPackagesHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"packages": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"packages"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "getTerminalOutput",
				Description: "Returns the history of outputs of a terminal.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeRead,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "terminal",
					SearchTags:     []string{"terminal", "history", "output", "shell"},
				},
				Handler: newGetTerminalOutputHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Top-level terminal section id whose buffered output should be returned.",
					},
				},
				"required": []string{"sectionId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_setta_docs",
				Description: "Return docs from the Setta docs directory.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetSettaDocsHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"docIds": map[string]any{
						"type":        "array",
						"description": "Optional doc ids or doc-relative paths to include; omit for the default listener-focused set.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"docs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"doc_id":  map[string]any{"type": "string"},
								"path":    map[string]any{"type": "string"},
								"content": map[string]any{"type": "string"},
							},
							"required": []string{"doc_id", "path", "content"},
						},
					},
					"available_docs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"docs", "available_docs"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "report_completion_status",
				Description: "Report structured completion intent and verification evidence for the active task.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "agentic",
					SearchTags:     []string{"completion", "verification", "status", "checks", "task"},
				},
				Handler: newReportCompletionStatusHandler(),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"taskId": map[string]any{
						"type":        "string",
						"description": "Optional task identifier for the completion report.",
					},
					"completionIntent": map[string]any{
						"type":        "boolean",
						"description": "Whether the active task is intended to be complete.",
					},
					"requiresVerification": map[string]any{
						"type":        "boolean",
						"description": "Whether the task requires verification evidence before completion.",
					},
					"checkResults": map[string]any{
						"type":        "array",
						"description": "Optional verification checks to include in the report.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"checkName": map[string]any{"type": "string"},
								"required":  map[string]any{"type": "boolean"},
								"status":    map[string]any{"type": "string"},
								"details":   map[string]any{"type": "string"},
								"source":    map[string]any{"type": "string"},
							},
							"required": []string{"checkName", "status"},
						},
					},
				},
				"required": []string{"completionIntent", "requiresVerification"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"taskId": map[string]any{
						"type": "string",
					},
					"completionIntent": map[string]any{
						"type": "boolean",
					},
					"requiresVerification": map[string]any{
						"type": "boolean",
					},
					"checkResults": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"checkName": map[string]any{"type": "string"},
								"required":  map[string]any{"type": "boolean"},
								"status":    map[string]any{"type": "string"},
								"details":   map[string]any{"type": "string"},
								"source":    map[string]any{"type": "string"},
							},
							"required": []string{"checkName", "required", "status"},
						},
					},
					"verificationStatus": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"completionIntent", "requiresVerification", "checkResults", "verificationStatus"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "report_state_machine_signal",
				Description: "Report a structured signal from the active child workflow chat into its parent state machine.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "agentic",
					SearchTags:     []string{"workflow", "state", "machine", "signal", "chat"},
				},
				Handler: newReportStateMachineSignalHandler(stateMachineRuns),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"signalName": map[string]any{
						"type":        "string",
						"description": "Structured signal name reported from the active workflow child chat.",
					},
					"payload": map[string]any{
						"type":        "object",
						"description": "Optional structured signal payload used by workflow edge filters.",
					},
					"machineRunId": map[string]any{
						"type":        "string",
						"description": "Optional workflow parent run id to assert while reporting the signal.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Optional workflow chat section id when no active chat section is available in the agentic context.",
					},
				},
				"required": []string{"signalName"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
					"signalEventId": map[string]any{
						"type": "string",
					},
					"machineRunId": map[string]any{
						"type": "string",
					},
					"childRunId": map[string]any{
						"type": "string",
					},
					"sourceSectionId": map[string]any{
						"type": "string",
					},
					"signalName": map[string]any{
						"type": "string",
					},
					"sourceActivationCount": map[string]any{
						"type": "integer",
					},
				},
				"required": []string{"status", "signalEventId", "machineRunId", "childRunId", "sourceSectionId", "signalName", "sourceActivationCount"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "list_agent_profiles",
				Description: "List the stored agent profiles available in the workspace.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeRead,
					RequiresLLM:    true,
					SearchCategory: "agentic",
					SearchTags:     []string{"agent", "profile", "profiles", "workspace"},
				},
				Handler: newListAgentProfilesHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profiles": map[string]any{
						"type":  "array",
						"items": agentProfileSchema(),
					},
				},
				"required": []string{"profiles"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_agent_profile",
				Description: "Return a stored agent profile by id.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeRead,
					RequiresLLM:    true,
					SearchCategory: "agentic",
					SearchTags:     []string{"agent", "profile", "lookup", "workspace"},
				},
				Handler: newGetAgentProfileHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profileId": map[string]any{
						"type":        "string",
						"description": "Stored agent profile id to fetch.",
					},
				},
				"required": []string{"profileId"},
			},
			OutputSchema: agentProfileSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "run_agent_profile",
				Description: "Start a managed agent run using the specified stored profile and return the final persisted run.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					RequiresLLM:    true,
					StartsRun:      true,
					SearchCategory: "agentic",
					SearchTags:     []string{"agent", "profile", "run", "managed", "execute"},
				},
				Handler: newRunAgentProfileHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profileId": map[string]any{
						"type":        "string",
						"description": "Stored agent profile id to execute.",
					},
					"inputs": map[string]any{
						"type":        "object",
						"description": "Optional managed-run input payload passed through to the agent run service.",
					},
				},
				"required": []string{"profileId"},
			},
			OutputSchema: agentRunSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "install_plugin",
				Description: "Install a plugin from a GitHub or PyPI source spec.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "install", "github", "pypi", "structural"},
				},
				Handler: newInstallPluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sourceSpec": map[string]any{
						"type":        "string",
						"description": "Plugin source spec such as github:owner/repo#ref or pypi:package==version.",
					},
					"scope":     pluginScopeSchema(),
					"installer": pluginInstallerSchema(),
					"enable": map[string]any{
						"type":        "boolean",
						"description": "Whether the plugin should be enabled immediately after install. Defaults to true.",
					},
					"force": map[string]any{
						"type":        "boolean",
						"description": "Whether an existing managed install target may be overwritten. Defaults to false.",
					},
				},
				"required": []string{"sourceSpec"},
			},
			OutputSchema: pluginInstallResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "uninstall_plugin",
				Description: "Uninstall a managed plugin by id.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "uninstall", "remove", "structural"},
				},
				Handler: newUninstallPluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"pluginId": map[string]any{
						"type":        "string",
						"description": "Installed plugin id to remove.",
					},
					"scope": pluginScopeSchema(),
				},
				"required": []string{"pluginId"},
			},
			OutputSchema: pluginUninstallResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "rescan_plugins",
				Description: "Rescan the managed plugin directories and return aggregate installed and active counts.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "rescan", "refresh", "structural"},
				},
				Handler: newRescanPluginsHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: pluginsRescanResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "update_plugin",
				Description: "Update a managed plugin to the latest source target or to an explicit requested version/ref.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "update", "upgrade", "structural"},
				},
				Handler: newUpdatePluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"pluginId": map[string]any{
						"type":        "string",
						"description": "Installed plugin id to update.",
					},
					"scope": pluginScopeSchema(),
					"to": map[string]any{
						"type":        "string",
						"description": "Optional explicit version, ref, or fully qualified source target.",
					},
				},
				"required": []string{"pluginId"},
			},
			OutputSchema: pluginUpdateResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "rollback_plugin",
				Description: "Restore a managed plugin from its most recent saved rollback snapshot.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "rollback", "restore", "structural"},
				},
				Handler: newRollbackPluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"pluginId": map[string]any{
						"type":        "string",
						"description": "Installed plugin id to restore.",
					},
					"scope": pluginScopeSchema(),
				},
				"required": []string{"pluginId"},
			},
			OutputSchema: pluginRollbackResponseSchema(),
		},
	}
}
