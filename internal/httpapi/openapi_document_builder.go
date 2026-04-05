package httpapi

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/plugins"
)

func registerFrontendHTTPOpenAPIDocumentRoutes(router chi.Router) error {
	ideMode, shareMode, appMode, launcherMode := modes.NewPolicy(config.ModeIDE), modes.NewPolicy(config.ModeShare), modes.NewPolicy(config.ModeApp), modes.NewPolicy(config.ModeLauncher)

	registerCoreRuntimeOpenAPIRoutes(router, NewConfigInfoService(config.Config{
		Server: config.Server{Mode: config.ModeIDE},
	}, ""))
	if err := RegisterFrontendRootRoutes(router, FrontendRootRouteDependencies{
		AttachmentRoot: &AttachmentRootRouteDependencies{
			ModePolicy: ideMode,
		},
	}); err != nil {
		return err
	}
	return RegisterFrontendAPIRoutes(router, FrontendAPIRouteDependencies{
		Status: StatusRouteDependencies{
			ModePolicy: ideMode,
		},
		Docstring: DocstringRouteDependencies{
			ModePolicy: ideMode,
		},
		Settings: SettingsRouteDependencies{
			ModePolicy: ideMode,
		},
		Plugin: &PluginRouteDependencies{
			ModePolicy: ideMode,
			Service:    (*plugins.Service)(nil),
		},
		Listener: ListenerRouteDependencies{
			ModePolicy: ideMode,
		},
		DeploymentIDE: DeploymentIDERouteDependencies{
			ModePolicy: ideMode,
		},
		ShareDeployment: DeploymentRouteDependencies{
			ModePolicy: shareMode,
		},
		AppDeployment: DeploymentRouteDependencies{
			ModePolicy: appMode,
		},
		LauncherHome: LauncherHomeRouteDependencies{
			ModePolicy: launcherMode,
		},
		LauncherManagement: LauncherManagementRouteDependencies{
			ModePolicy: ideMode,
		},
		WorkspaceLaunch: WorkspaceLaunchRouteDependencies{
			ModePolicy: ideMode,
		},
		Binary: BinaryRouteDependencies{
			ModePolicy: ideMode,
		},
		Attachment: AttachmentRouteDependencies{
			ModePolicy: ideMode,
		},
		FileBrowser: FileBrowserRouteDependencies{
			ModePolicy: ideMode,
		},
		Artifact: ArtifactRouteDependencies{
			ModePolicy: ideMode,
		},
		Terminal: TerminalRouteDependencies{
			ModePolicy: ideMode,
		},
		DetachedRun: DetachedRunRouteDependencies{
			ModePolicy: ideMode,
		},
		ProjectShell: ProjectShellRouteDependencies{
			ModePolicy: ideMode,
		},
		Git: GitRouteDependencies{
			ModePolicy: ideMode,
		},
		Project: ProjectRouteDependencies{
			ModePolicy: ideMode,
		},
		AppDefinition: AppDefinitionRouteDependencies{
			ModePolicy: ideMode,
		},
		AI: AIRouteDependencies{
			ModePolicy: shareMode,
		},
		AgentProfile: AgentProfileRouteDependencies{
			ModePolicy: ideMode,
		},
		PromptTemplate: PromptTemplateRouteDependencies{
			ModePolicy: ideMode,
		},
		AppGenSkill: AppGenSkillRouteDependencies{
			ModePolicy: ideMode,
		},
		ExternalAgentConfig: ExternalAgentConfigRouteDependencies{
			ModePolicy: ideMode,
		},
		EngineConfig: EngineConfigRouteDependencies{
			ModePolicy: ideMode,
		},
		TranscriptionProfile: TranscriptionProfileRouteDependencies{
			ModePolicy: ideMode,
		},
		LLM: LLMRouteDependencies{
			ModePolicy: ideMode,
		},
		AgenticSummaryCache: AgenticSummaryCacheRouteDependencies{
			ModePolicy: ideMode,
		},
		AgentRun: AgentRunRouteDependencies{
			ModePolicy: ideMode,
		},
		StateMachine: StateMachineRunRouteDependencies{
			ModePolicy: ideMode,
		},
		MCP: MCPRouteDependencies{
			ModePolicy: ideMode,
		},
		LSP: LSPRouteDependencies{
			ModePolicy: ideMode,
		},
	})
}

func BuildFrontendHTTPOpenAPIDocument() (*huma.OpenAPI, error) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
	if err := registerFrontendHTTPOpenAPIDocumentRoutes(router); err != nil {
		return nil, err
	}
	return document, nil
}
