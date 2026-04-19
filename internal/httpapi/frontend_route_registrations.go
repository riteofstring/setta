package httpapi

import (
	"fmt"

	"github.com/go-chi/chi/v5"
)

type FrontendAPIRouteContribution struct {
	Family   string
	Register func(chi.Router) error
}

type FrontendAPIRouteRegistrations struct {
	Project    []FrontendAPIRouteContribution
	Deployment []FrontendAPIRouteContribution
}

type FrontendRootRouteDependencies struct {
	AttachmentRoot *AttachmentRootRouteDependencies
}

type FrontendAPIRouteDependencies struct {
	Status               StatusRouteDependencies
	Docstring            DocstringRouteDependencies
	Settings             SettingsRouteDependencies
	Plugin               *PluginRouteDependencies
	Listener             ListenerRouteDependencies
	DeploymentIDE        DeploymentIDERouteDependencies
	ShareDeployment      DeploymentRouteDependencies
	AppDeployment        DeploymentRouteDependencies
	LauncherHome         LauncherHomeRouteDependencies
	LauncherManagement   LauncherManagementRouteDependencies
	WorkspaceLaunch      WorkspaceLaunchRouteDependencies
	Binary               BinaryRouteDependencies
	Attachment           AttachmentRouteDependencies
	FileBrowser          FileBrowserRouteDependencies
	Artifact             ArtifactRouteDependencies
	Terminal             TerminalRouteDependencies
	DetachedRun          DetachedRunRouteDependencies
	ProjectShell         ProjectShellRouteDependencies
	Git                  GitRouteDependencies
	Project              ProjectRouteDependencies
	AppDefinition        AppDefinitionRouteDependencies
	AI                   AIRouteDependencies
	AgentProfile         AgentProfileRouteDependencies
	PromptTemplate       PromptTemplateRouteDependencies
	AppGenSkill          AppGenSkillRouteDependencies
	ExternalAgentConfig  ExternalAgentConfigRouteDependencies
	EngineConfig         EngineConfigRouteDependencies
	TranscriptionProfile TranscriptionProfileRouteDependencies
	LLM                  LLMRouteDependencies
	AgenticSummaryCache  AgenticSummaryCacheRouteDependencies
	AgentRun             AgentRunRouteDependencies
	StateMachine         StateMachineRunRouteDependencies
	MCP                  MCPRouteDependencies
	LSP                  LSPRouteDependencies
}

func registerFrontendHTTPOpenAPIRouteFamily(family string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("register %s routes: %w", family, err)
}

func RegisterFrontendRootRoutes(router chi.Router, deps FrontendRootRouteDependencies) error {
	if deps.AttachmentRoot == nil {
		return nil
	}
	return registerFrontendHTTPOpenAPIRouteFamily(
		"attachment root",
		RegisterAttachmentRootRoutes(router, *deps.AttachmentRoot),
	)
}

func BuildAppSubsystemFrontendAPIRouteRegistrations(
	deps FrontendAPIRouteDependencies,
) FrontendAPIRouteRegistrations {
	return FrontendAPIRouteRegistrations{
		Project: []FrontendAPIRouteContribution{
			{
				Family: "app definition",
				Register: func(router chi.Router) error {
					return RegisterAppDefinitionRoutes(router, deps.AppDefinition)
				},
			},
		},
		Deployment: []FrontendAPIRouteContribution{
			{
				Family: "app deployment",
				Register: func(router chi.Router) error {
					return RegisterDeploymentRoutes(router, deps.AppDeployment)
				},
			},
			{
				Family: "deployment ide",
				Register: func(router chi.Router) error {
					return RegisterDeploymentIDERoutes(router, deps.DeploymentIDE)
				},
			},
		},
	}
}

func RegisterFrontendAPIRoutes(
	router chi.Router,
	deps FrontendAPIRouteDependencies,
	registrations FrontendAPIRouteRegistrations,
) error {
	if err := registerFrontendStatusRoutes(router, deps); err != nil {
		return err
	}
	if err := registerFrontendDeploymentRoutes(
		router,
		deps,
		registrations.Deployment,
	); err != nil {
		return err
	}
	if err := registerFrontendWorkspaceDataRoutes(router, deps); err != nil {
		return err
	}
	if err := registerFrontendWorkspaceExecutionRoutes(router, deps); err != nil {
		return err
	}
	if err := registerFrontendProjectRoutes(
		router,
		deps,
		registrations.Project,
	); err != nil {
		return err
	}
	if err := registerFrontendToolingSupportRoutes(router, deps); err != nil {
		return err
	}
	return registerFrontendToolingRunRoutes(router, deps)
}

func registerFrontendStatusRoutes(router chi.Router, deps FrontendAPIRouteDependencies) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("status", RegisterStatusRoutes(router, deps.Status)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("docstring", RegisterDocstringRoutes(router, deps.Docstring)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("settings", RegisterSettingsRoutes(router, deps.Settings)); err != nil {
		return err
	}
	if deps.Plugin != nil {
		if err := registerFrontendHTTPOpenAPIRouteFamily("plugin", RegisterPluginRoutes(router, *deps.Plugin)); err != nil {
			return err
		}
	}
	return registerFrontendHTTPOpenAPIRouteFamily("listener", RegisterListenerRoutes(router, deps.Listener))
}

func registerFrontendRouteContributions(
	router chi.Router,
	contributions []FrontendAPIRouteContribution,
) error {
	for _, contribution := range contributions {
		if err := registerFrontendHTTPOpenAPIRouteFamily(
			contribution.Family,
			contribution.Register(router),
		); err != nil {
			return err
		}
	}
	return nil
}

func registerFrontendDeploymentRoutes(
	router chi.Router,
	deps FrontendAPIRouteDependencies,
	contributions []FrontendAPIRouteContribution,
) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("share deployment", RegisterDeploymentRoutes(router, deps.ShareDeployment)); err != nil {
		return err
	}
	if err := registerFrontendRouteContributions(router, contributions); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("launcher home", RegisterLauncherHomeRoutes(router, deps.LauncherHome)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("launcher management", RegisterLauncherManagementRoutes(router, deps.LauncherManagement)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("workspace launch", RegisterWorkspaceLaunchRoutes(router, deps.WorkspaceLaunch)); err != nil {
		return err
	}
	return nil
}

func registerFrontendWorkspaceDataRoutes(router chi.Router, deps FrontendAPIRouteDependencies) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("binary", RegisterBinaryRoutes(router, deps.Binary)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("attachment", RegisterAttachmentRoutes(router, deps.Attachment)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("file browser", RegisterFileBrowserRoutes(router, deps.FileBrowser)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("artifact", RegisterArtifactRoutes(router, deps.Artifact)); err != nil {
		return err
	}
	return nil
}

func registerFrontendWorkspaceExecutionRoutes(router chi.Router, deps FrontendAPIRouteDependencies) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("terminal", RegisterTerminalRoutes(router, deps.Terminal)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("detached run", RegisterDetachedRunRoutes(router, deps.DetachedRun)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("project shell", RegisterProjectShellRoutes(router, deps.ProjectShell)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("git", RegisterGitRoutes(router, deps.Git)); err != nil {
		return err
	}
	return nil
}

func registerFrontendProjectRoutes(
	router chi.Router,
	deps FrontendAPIRouteDependencies,
	contributions []FrontendAPIRouteContribution,
) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("project", RegisterProjectRoutes(router, deps.Project)); err != nil {
		return err
	}
	if err := registerFrontendRouteContributions(router, contributions); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("ai", RegisterAIRoutes(router, deps.AI)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("agent profile", RegisterAgentProfileRoutes(router, deps.AgentProfile)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("prompt template", RegisterPromptTemplateRoutes(router, deps.PromptTemplate)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("app gen skill", RegisterAppGenSkillRoutes(router, deps.AppGenSkill)); err != nil {
		return err
	}
	return nil
}

func registerFrontendToolingSupportRoutes(router chi.Router, deps FrontendAPIRouteDependencies) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("external agent config", RegisterExternalAgentConfigRoutes(router, deps.ExternalAgentConfig)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("engine config", RegisterEngineConfigRoutes(router, deps.EngineConfig)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("transcription profile", RegisterTranscriptionProfileRoutes(router, deps.TranscriptionProfile)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("llm", RegisterLLMRoutes(router, deps.LLM)); err != nil {
		return err
	}
	return nil
}

func registerFrontendToolingRunRoutes(router chi.Router, deps FrontendAPIRouteDependencies) error {
	if err := registerFrontendHTTPOpenAPIRouteFamily("agentic summary cache", RegisterAgenticSummaryCacheRoutes(router, deps.AgenticSummaryCache)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("agent run", RegisterAgentRunRoutes(router, deps.AgentRun)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("state machine", RegisterStateMachineRunRoutes(router, deps.StateMachine)); err != nil {
		return err
	}
	if err := registerFrontendHTTPOpenAPIRouteFamily("mcp", RegisterMCPRoutes(router, deps.MCP)); err != nil {
		return err
	}
	return registerFrontendHTTPOpenAPIRouteFamily("lsp", RegisterLSPRoutes(router, deps.LSP))
}
