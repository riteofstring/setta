package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/appgenskills"
	"setta/internal/artifacts"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/boundcode"
	"setta/internal/chatattachments"
	"setta/internal/chatsections"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/detachedruns"
	"setta/internal/devworktree"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/filebrowser"
	"setta/internal/frontendorigins"
	"setta/internal/gitread"
	"setta/internal/httpapi"
	"setta/internal/launcher"
	"setta/internal/llmconfig"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/lspsignature"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/observability"
	"setta/internal/pathreveal"
	"setta/internal/plugins"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/pythonenv"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/runs"
	"setta/internal/runtime"
	"setta/internal/scriptablechat"
	"setta/internal/settingsstate"
	"setta/internal/shareartifacts"
	"setta/internal/sshx"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
	"setta/internal/uisettings"
	"setta/internal/watchcode"
	"setta/internal/workspacelaunch"
	"setta/internal/wsapi"
)

type App struct {
	config        config.Config
	logger        *slog.Logger
	authService   *auth.Service
	runtime       *runtime.Manager
	projectStates *projectstate.Registry
	deployment    *deployments.Runtime
	shareSessions modes.ShareSessionStore
	terminals     *terminals.Service
	binaryStore   *binarypayload.Store
	runCode       *runs.Service
	agentRuns     *agentruns.Service
	agentRuntime  *agentruns.Runtime
	runChains     *runchains.Runtime
	settingsState *settingsstate.Runtime
	websocketHub  *realtime.WebsocketHub
	listeners     *realtime.ListenerBroadcaster
	lspSync       *lsp.ProjectSynchronizer
	watchCode     *watchcode.Service
	boundCode     *boundcode.Service
	mcpServer     *mcpx.Server
	mcpClient     *mcpx.Client
	pluginRoutes  *plugins.BackendRuntimeHolder
	handler       http.Handler
}

func New(cfg config.Config, logger *slog.Logger) (*App, error) {
	if logger == nil {
		logger = observability.NewLogger(cfg.Server.LogLevel, os.Stderr)
	}

	modePolicy := modes.NewPolicy(cfg.Server.Mode)
	manager := runtime.New(context.Background(), logger)
	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	authService, err := auth.NewService(auth.Options{
		Mode:              cfg.Server.Mode,
		RuntimeRoot:       cfg.Paths.RuntimeRoot,
		ProfileCookieName: cfg.Paths.AuthCookieName,
		EnvLookup:         os.LookupEnv,
	})
	if err != nil {
		return nil, err
	}
	var mcpServer *mcpx.Server
	var mcpClient *mcpx.Client
	if modePolicy.IsIDE() {
		mcpClient, err = newInternalMCPClient(cfg, logger, authService)
		if err != nil {
			return nil, err
		}
	}

	var (
		projectStates         *projectstate.Registry
		deploymentRuntime     *deployments.Runtime
		projectRuntime        *projectstate.Runtime
		settingsStateRuntime  *settingsstate.Runtime
		codegenValidator      projectstate.CodegenTargetValidator
		lspDiagnostics        *projectstate.LSPDiagnosticsRegistry
		lspRouter             *lsp.Router
		projectLSPSyncer      *lsp.ProjectSynchronizer
		lspCompletion         *lspcompletion.Service
		lspSignature          *lspsignature.Service
		pythonMaterializer    *codegen.PythonMaterializer
		pluginMaterializer    *codegen.PluginMaterializer
		watchCodeService      *watchcode.Service
		boundCodeService      *boundcode.Service
		externalAgentChats    *externalagents.Service
		externalAgentFollow   *externalagents.FollowService
		externalAgentRuntime  *externalagents.Runtime
		externalAgentSend     *externalagents.SendService
		externalAgentExecutor externalagents.Executor
		attachmentService     *chatattachments.Service
		watchCodeWarnings     *watchCodeWarningTracker
		codeUpdates           *codeUpdateService
		renameRefactors       *renameRefactorService
		plannerFilesRoot      string
		artifactsRoot         string
		deploymentCatalog     *deployments.Catalog
		sharePublisher        *deployments.SharePublisher
		appPublisher          *deployments.AppPublisher
		shareSessions         modes.ShareSessionStore
		trustedOrigins        *frontendorigins.Service
		launcherHome          *launcher.HomeService
		launcherManagement    *launcher.ManagementService
		launcherOpenWorkspace *launcher.OpenWorkspaceService
		launchIntentService   *workspacelaunch.IntentService
		localLaunchService    *workspacelaunch.LocalLaunchService
		localSessionLauncher  *launcher.LocalIDESessionLauncher
		sshRuntime            *sshx.Service
		llmRuntime            *llmconfig.Runtime
		llmService            *llmconfig.Service
		engineStore           *agentruns.EngineStore
		agentRunStore         *agentruns.RunStore
		agentRunRuntime       *agentruns.Runtime
		managedLiveRuntime    *managedchat.LiveRuntime
		managedChatService    *managedchat.Service
		stateMachineRuntime   *statemachineruns.Runtime
		scriptableChatService *scriptablechat.Service
		chatSectionChatIDs    *chatsections.Service
		gitReadService        *gitread.Service
		fileBrowserService    *filebrowser.Service
		artifactService       *artifacts.Service
		shareArtifactService  *shareartifacts.Service
		projectShellService   *projectshell.Service
		notificationStore     *notifications.Store
		notificationService   *notifications.Service
		appGenSkillService    *appgenskills.Service
		pathRevealService     *pathreveal.Service
		runChainRuntime       *runchains.Runtime
		detachedRunManager    *detachedruns.Manager
		externalConfigStore   *externalagentconfigs.Store
		externalConfigService *externalagentconfigs.Service
		externalPreflight     externalagentconfigs.Checker
		transcriptionStore    *transcriptionprofiles.Store
		transcriptionProfiles *transcriptionprofiles.Service
		transcriptionSessions *transcriptionsessions.Service
		agenticSummaryStatus  *agenticsummarycache.Service
		promptTemplateStore   *prompttemplates.Store
		pluginWorkerRuntime   plugins.WorkerRuntimeProvider
		pluginStore           *plugins.Store
		pluginDiscovery       *plugins.DiscoveryService
		pluginBackendRegs     plugins.BackendRegistrationSource
		pluginBackendRoutes   *plugins.BackendRuntimeHolder
		pluginRuntimeRefresh  *pluginBackendRuntimeRefresher
		pluginRouteService    httpapi.PluginRouteService
		pythonPackages        *pythonenv.Runtime
	)
	if authService.SupportsSessionAuth() {
		trustedOrigins, err = frontendorigins.NewService(frontendorigins.Options{
			RuntimeRoot: cfg.Paths.RuntimeRoot,
		})
		if err != nil {
			return nil, err
		}
		launchIntentService, err = workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			TrustedOrigins: trustedOrigins,
		})
		if err != nil {
			return nil, err
		}
		executablePath, err := os.Executable()
		if err != nil {
			return nil, err
		}
		localSessionLauncher, err = launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
			ExecutablePath: executablePath,
		})
		if err != nil {
			return nil, err
		}
		sshRuntime, err = sshx.NewService(sshx.ServiceOptions{
			RuntimeRoot: cfg.Paths.RuntimeRoot,
		})
		if err != nil {
			return nil, err
		}
		localLaunchService, err = workspacelaunch.NewLocalLaunchService(workspacelaunch.LocalLaunchServiceOptions{
			DefaultSettaHome:         cfg.Paths.SettaHome,
			DefaultProfileLookupHome: cfg.Paths.ProfileLookupHome,
			Intents:                  launchIntentService,
			TrustedOrigins:           trustedOrigins,
			Sessions:                 localSessionLauncher,
			SSH:                      sshRuntime,
			ResolveLauncherSessionAuthExpiry: func(now time.Time) (int64, error) {
				_, payload, err := authService.MintAuthCookie(now)
				if err != nil {
					return 0, err
				}
				return payload.Exp, nil
			},
		})
		if err != nil {
			return nil, err
		}
	}
	launcherHome = launcher.NewHomeService(launcher.HomeServiceOptions{
		EnvLookup: os.LookupEnv,
	})
	if modePolicy.IsIDE() {
		executablePath, err := os.Executable()
		if err != nil {
			return nil, err
		}
		launcherManagement, err = launcher.NewManagementService(launcher.ManagementServiceOptions{
			ExecutablePath: executablePath,
		})
		if err != nil {
			return nil, err
		}
	}
	if modePolicy.IsLauncher() {
		launcherOpenWorkspace, err = launcher.NewOpenWorkspaceService(launcher.OpenWorkspaceServiceOptions{
			DefaultSettaHome: cfg.Paths.SettaHome,
			Home:             launcherHome,
			Sessions:         localSessionLauncher,
		})
		if err != nil {
			return nil, err
		}
	}
	if modePolicy.IsDeployment() {
		deploymentRuntime, err = deployments.Open(context.Background(), deployments.RuntimeOptions{
			DeploymentRoot: cfg.Paths.DeploymentRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
		})
		if err != nil {
			return nil, err
		}
		projectRuntime = deploymentRuntime.Base()
		plannerFilesRoot = deploymentRuntime.Paths().DeploymentRoot
		artifactsRoot = deploymentRuntime.Paths().ArtifactsRoot
		shareSessions = deploymentRuntime
	} else {
		workerRuntimeProvider, err := plugins.NewCurrentProcessWorkerRuntimeProvider(plugins.CurrentProcessWorkerRuntimeProviderOptions{})
		if err != nil {
			return nil, err
		}
		pluginWorkerRuntime = workerRuntimeProvider
		workerSpecs, err := plugins.NewFilesystemWorkerSpecResolver(plugins.FilesystemWorkerSpecResolverOptions{
			WorkspaceRoot:   cfg.Paths.WorkspaceRoot,
			SettaFilesRoot:  cfg.Paths.SettaFilesRoot,
			SettaHome:       cfg.Paths.SettaHome,
			RuntimeProvider: workerRuntimeProvider,
			ServerMode:      cfg.Server.Mode,
		})
		if err != nil {
			return nil, err
		}
		codegenValidator, err = plugins.NewProjectCodegenTargetValidator(workerSpecs)
		if err != nil {
			return nil, err
		}
		pluginMaterializer, err = codegen.NewPluginMaterializer(codegen.PluginMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			WorkerSpecs:    workerSpecs,
		})
		if err != nil {
			return nil, err
		}
		pythonMaterializer, err = codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
		})
		if err != nil {
			return nil, err
		}
		pythonPackages, err = pythonenv.NewRuntime(pythonenv.RuntimeOptions{})
		if err != nil {
			logger.Warn("python package inspection runtime unavailable", "error", err)
		}
		pluginStore, err = plugins.NewStore(plugins.StoreOptions{
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			SettaHome:      cfg.Paths.SettaHome,
		})
		if err != nil {
			return nil, err
		}
		pluginDiscovery, err = plugins.NewDiscoveryService(plugins.DiscoveryServiceOptions{
			Store:                 pluginStore,
			ServerMode:            cfg.Server.Mode,
			PackageManagerRuntime: pythonPackages,
		})
		if err != nil {
			return nil, err
		}
		if pluginWorkerRuntime != nil {
			pluginBackendRegs, err = plugins.NewBackendRegistrationLoader(plugins.BackendRegistrationLoaderOptions{
				RuntimeProvider: pluginWorkerRuntime,
				ServerMode:      cfg.Server.Mode,
			})
			if err != nil {
				return nil, err
			}
		}
		lspDiagnostics = projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{
			OnChange: func(payload projectstate.LSPDiagnosticsPayload) {
				_, _ = websocketHub.BroadcastJSON(
					context.Background(),
					realtime.NewLSPDiagnosticsMessage(payload),
					realtime.Selection{Type: realtime.ConnectionTypeFrontend},
				)
			},
		})
		languageServerSpecs, err := snapshotAppLanguageServerSpecs(pluginDiscovery, pluginBackendRegs)
		if err != nil {
			return nil, err
		}
		lspRouter, err = lsp.NewRouter(lsp.RouterOptions{
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
			LookupEnv:     os.LookupEnv,
			Environ:       os.Environ,
			Settings: func() map[string]any {
				if settingsStateRuntime == nil {
					return nil
				}
				document := settingsStateRuntime.Snapshot().Document.Clone()
				return map[string]any(document)
			},
			AdditionalSpecs: languageServerSpecs,
		})
		if err != nil {
			return nil, err
		}
		projectLSPSyncer, err = lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			Service:        lspRouter,
			Diagnostics:    lspDiagnostics,
		})
		if err != nil {
			return nil, err
		}
		lspCompletion, err = lspcompletion.NewService(lspcompletion.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			LSPService:     lspRouter,
		})
		if err != nil {
			return nil, err
		}
		lspSignature, err = lspsignature.NewService(lspsignature.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			LSPService:     lspRouter,
		})
		if err != nil {
			return nil, err
		}
		passwordSecrets, err := projectstate.NewFilePasswordSecretStore(cfg.Paths.RuntimeRoot)
		if err != nil {
			return nil, err
		}
		projectStates, err = projectstate.OpenRegistryWithOptions(context.Background(), cfg.Paths.SettaFilesRoot, projectstate.StoreOptions{}, projectstate.RegistryOptions{
			MainRuntime: projectstate.RuntimeOptions{
				PasswordSecrets: passwordSecrets,
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					if watchCodeService != nil {
						if err := watchCodeService.SyncConfigs(projectstate.WatchCodeConfigInputs(snapshot.Document)); err != nil {
							return err
						}
					}
					if watchCodeWarnings != nil {
						watchCodeWarnings.ReconcileDocument(snapshot.Document)
					}
					if boundCodeService != nil {
						inputs, err := projectstate.PythonBoundCodeFileInputs(snapshot.Document, cfg.Paths.WorkspaceRoot)
						if err != nil {
							return err
						}
						if err := boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
							return err
						}
					}
					if err := pythonMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
						return err
					}
					if err := projectLSPSyncer.MaterializeDocument(ctx, snapshot.Document); err != nil {
						return err
					}
					if err := lspDiagnostics.PruneDocument(snapshot.Document); err != nil {
						return err
					}
					return pluginMaterializer.MaterializeDocument(ctx, snapshot.Document)
				},
			},
			SettingsRuntime: projectstate.RuntimeOptions{
				PasswordSecrets: passwordSecrets,
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					if settingsStateRuntime == nil {
						return errors.New("settings state runtime is not configured")
					}

					currentSettings := settingsStateRuntime.Snapshot().Document
					nextSettings, err := settingsstate.ApplySettingsProjectDocument(currentSettings, snapshot.Document)
					if err != nil {
						return err
					}
					if reflect.DeepEqual(currentSettings, nextSettings) {
						return nil
					}

					settingsSnapshot, err := settingsStateRuntime.ReplaceAndSave(ctx, nextSettings)
					if err != nil {
						return err
					}
					if _, err := websocketHub.BroadcastJSON(
						ctx,
						realtime.NewSettingsUpdateMessage(settingsSnapshot.Document),
						realtime.Selection{Type: realtime.ConnectionTypeFrontend},
					); err != nil {
						return err
					}
					return nil
				},
			},
		})
		if err != nil {
			return nil, err
		}
		projectRuntime = projectStates.Main()
		settingsStateStore, err := settingsstate.NewStore(
			filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
			settingsstate.StoreOptions{},
		)
		if err != nil {
			_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
			return nil, err
		}
		settingsStateRuntime, err = settingsstate.OpenRuntime(context.Background(), settingsStateStore)
		if err != nil {
			_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
			return nil, err
		}
		plannerFilesRoot = cfg.Paths.SettaFilesRoot
		artifactsRoot = filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts")
		projectLSPSyncer.SetCallableAutoRefetchHandlers(
			func(ctx context.Context, projectID string, sectionIDs []string) {
				if _, _, err := projectStates.Main().RefetchCallableParams(ctx, projectID, sectionIDs, lspSignature); err != nil {
					logger.Error("lsp callable auto-refetch after symbol resolution failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
				}
			},
			func(ctx context.Context, projectID string, sectionIDs []string) {
				enabled, err := settingsstate.AutoRefetchCallableParamsOnLSPMismatchEnabled(settingsStateRuntime.Snapshot().Document)
				if err != nil {
					logger.Error("lsp callable mismatch refetch policy lookup failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
					return
				}
				if !enabled {
					return
				}
				if _, _, err := projectStates.Main().RefetchCallableParams(ctx, projectID, sectionIDs, lspSignature); err != nil {
					logger.Error("lsp callable auto-refetch after mismatch failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
				}
			},
		)
		if modePolicy.IsIDE() {
			watchCodeWarnings = newWatchCodeWarningTracker()
			watchCodeService, err = watchcode.NewService(watchcode.ServiceOptions{
				WorkspaceRoot: cfg.Paths.WorkspaceRoot,
				OnFileUpdate: func(ctx context.Context, update watchcode.FileUpdate) error {
					signatureObserver := newWatchCodeSignatureObserver(lspSignature)
					snapshot, _, err := projectStates.Main().ApplyWatchCodeFileUpdate(
						ctx,
						update.ConfigID,
						update.Path,
						update.Raw,
						update.BaselineOnly,
						update.MovedFrom,
						cfg.Paths.WorkspaceRoot,
						signatureObserver,
					)
					if err != nil {
						return err
					}
					for _, message := range watchCodeWarnings.ConsumeNotifications(snapshot.Document, update.ConfigID, signatureObserver.Attempts()) {
						if _, err := websocketHub.BroadcastJSON(ctx, message, realtime.Selection{Type: realtime.ConnectionTypeFrontend}); err != nil {
							return err
						}
					}
					return nil
				},
				OnFileDelete: func(ctx context.Context, request watchcode.DeleteRequest) error {
					snapshot, _, err := projectStates.Main().ApplyWatchCodeFileDelete(
						ctx,
						request.ConfigID,
						request.Path,
						cfg.Paths.WorkspaceRoot,
					)
					if err != nil {
						return err
					}
					watchCodeWarnings.ReconcileDocument(snapshot.Document)
					return nil
				},
				OnError: func(err error) {
					logger.Error("watch code runtime failed", "error", err)
				},
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			if err := watchCodeService.SyncConfigs(projectstate.WatchCodeConfigInputs(projectStates.Main().Snapshot().Document)); err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			codeUpdates, err = newCodeUpdateService(codeUpdateServiceOptions{
				ProjectState:       projectRuntime,
				LSPSync:            projectLSPSyncer,
				CallableSignatures: lspSignature,
				WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
				WatchCodeWarnings:  watchCodeWarnings,
				WebsocketHub:       websocketHub,
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			renameRefactors, err = newRenameRefactorService(renameRefactorServiceOptions{
				ProjectState: projectRuntime,
				Settings:     settingsStateRuntime,
				WebsocketHub: websocketHub,
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			boundCodeService, err = boundcode.NewService(boundcode.ServiceOptions{
				OnFileUpdate: func(ctx context.Context, update boundcode.FileUpdate) error {
					return codeUpdates.ReloadBoundCodeFile(ctx, update.Raw, update.Bindings)
				},
				OnError: func(err error) {
					logger.Error("bound code file runtime failed", "error", err)
				},
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			inputs, err := projectstate.PythonBoundCodeFileInputs(projectStates.Main().Snapshot().Document, cfg.Paths.WorkspaceRoot)
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			if err := boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
		}
	}

	terminalService, err := terminals.New(terminals.Options{
		Logger: logger,
	})
	if err != nil {
		_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
		return nil, err
	}
	binaryStore, err := binarypayload.NewStoreForRuntimeRoot(cfg.Paths.RuntimeRoot)
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	if modePolicy.IsIDE() {
		fileBrowserService, err = filebrowser.NewService(filebrowser.ServiceOptions{
			WorkspaceRoot:        cfg.Paths.WorkspaceRoot,
			SettaFilesRoot:       cfg.Paths.SettaFilesRoot,
			RuntimeRoot:          cfg.Paths.RuntimeRoot,
			GlobalSettaFilesBase: cfg.User.GlobalSettaFilesBase,
			BinaryStore:          binaryStore,
			Sessions:             authService,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		artifactService, err = artifacts.NewService(artifacts.ServiceOptions{
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			ArtifactsRoot:  artifactsRoot,
			BinaryStore:    binaryStore,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
	}
	if deploymentRuntime != nil {
		shareArtifactService, err = shareartifacts.NewService(shareartifacts.ServiceOptions{
			Deployment:   deploymentRuntime,
			BinaryStore:  binaryStore,
			WebsocketHub: websocketHub,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
	}
	agentProfileStore, err := agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	promptTemplateStore, err = prompttemplates.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	agenticSummaryStatus, err = agenticsummarycache.NewService(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	if modePolicy.IsIDE() {
		appGenSkillService, err = appgenskills.NewService(appgenskills.ServiceOptions{
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
			LookupEnv:     os.LookupEnv,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		pathRevealService, err = pathreveal.NewService(pathreveal.ServiceOptions{
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			Skills:         appGenSkillService,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
	}
	var agentRunService *agentruns.Service
	var pluginMutationService *plugins.Service
	pluginMutationService, err = plugins.NewService(plugins.ServiceOptions{
		Store:                       pluginStore,
		DiscoveryService:            pluginDiscovery,
		BackendRuntimeRegistrations: pluginBackendRegs,
		WorkspaceRoot:               cfg.Paths.WorkspaceRoot,
		SettaFilesRoot:              cfg.Paths.SettaFilesRoot,
		SettaHome:                   cfg.Paths.SettaHome,
		ServerMode:                  cfg.Server.Mode,
		CandidateProvider: plugins.NewProductionCandidateProvider(plugins.ProductionCandidateProviderOptions{
			PackageManagerRuntime: pythonPackages,
			SettaFilesRoot:        cfg.Paths.SettaFilesRoot,
		}),
		PackageManagerRuntime: pythonPackages,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	pluginRouteService = pluginMutationService
	if modePolicy.IsIDE() && projectRuntime != nil {
		engineStore, err = agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		transcriptionStore, err = transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		agentRunStore, err = agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		agentRunStore.AddAfterSaveListener(func(run agentruns.Run) {
			_, _ = websocketHub.BroadcastJSON(
				context.Background(),
				realtime.NewAgentRunUpdatedMessage(run),
				realtime.Selection{Type: realtime.ConnectionTypeFrontend},
			)
		})
		externalConfigStore, err = externalagentconfigs.NewStore(cfg.Paths.SettaFilesRoot)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalConfigService, err = externalagentconfigs.NewService(externalagentconfigs.ServiceOptions{
			Configs:        externalConfigStore,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			SettaServerURL: mcpx.BuildSettaServerURL(cfg.Server.Host, cfg.Server.Port),
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalPreflightChecker, err := externalagentconfigs.NewSystemChecker(externalagentconfigs.SystemCheckerOptions{
			WorkspaceRoot:         cfg.Paths.WorkspaceRoot,
			ProcessEnv:            llmconfig.CurrentProcessEnv(),
			PluginAdapterProvider: externalAgentPluginAdapterProvider{plugins: pluginMutationService},
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalPreflight = externalPreflightChecker
		llmConfigs, err := llmconfig.Load(
			llmconfig.Path(cfg.Paths.SettaFilesRoot),
			llmconfig.LoadOptions{
				SettaServerURL: mcpx.BuildSettaServerURL(cfg.Server.Host, cfg.Server.Port),
			},
		)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		llmRuntime, err = llmconfig.NewRuntime(llmConfigs)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		workspaceEnv, err := llmconfig.ReadEnvFile(filepath.Join(cfg.Paths.WorkspaceRoot, ".env"))
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		llmRuntime.UpdateAPIKeys(llmconfig.ResolveRuntimeAPIKeys(
			llmConfigs,
			workspaceEnv,
			llmconfig.CurrentProcessEnv(),
		))
		llmService, err = llmconfig.NewService(llmconfig.ServiceOptions{
			ConfigPath:         llmconfig.Path(cfg.Paths.SettaFilesRoot),
			ManagedAPIKeysPath: llmconfig.ManagedAPIKeysPath(cfg.Paths.WorkspaceRoot),
			Runtime:            llmRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		transcriptionProfiles, err = transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
			Profiles: transcriptionStore,
			LLM:      llmRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		transcriptionSessions, err = transcriptionsessions.NewService(transcriptionsessions.ServiceOptions{
			LLM: llmRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(cfg.Paths.RuntimeRoot))
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		attachmentService, err = chatattachments.NewService(chatattachments.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			Host:           cfg.Server.Host,
			Port:           cfg.Server.Port,
			ProjectState:   projectRuntime,
			Deployment:     deploymentRuntime,
			Sessions:       authService,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		managedLiveRuntime = managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{
			Broadcaster: websocketHub,
		})
		agentRunService, err = agentruns.NewService(agentruns.ServiceOptions{
			ProjectState: projectRuntime,
			Engines:      engineStore,
			Runs:         agentRunStore,
			LLM:          llmRuntime,
			Executor: managedllm.NewExecutor(managedllm.ExecutorOptions{
				Live:        managedLiveRuntime,
				Tools:       mcpClient,
				Attachments: attachmentService,
				ResultFollow: managedllm.NewToolResultFollowEmitter(managedllm.ToolResultFollowEmitterOptions{
					Broadcaster:  websocketHub,
					TemporaryIDs: temporaryIDs,
				}),
			}),
			TemporaryIDs:           temporaryIDs,
			CompletionGuardEnabled: true,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		agentRunRuntime, err = agentruns.NewRuntime(agentruns.RuntimeOptions{
			Service:        agentRunService,
			LiveRunTracker: managedLiveRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		managedChatService, err = managedchat.NewService(managedchat.ServiceOptions{
			ProjectState: projectRuntime,
			Runs:         agentRunStore,
			Engines:      engineStore,
			LLM:          llmRuntime,
			Profiles:     agentProfileStore,
			Starter:      agentRunRuntime,
			Live:         managedLiveRuntime,
			Stopper:      agentRunRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		chatSectionChatIDs, err = chatsections.NewService(chatsections.ServiceOptions{
			ProjectState: projectRuntime,
			Runs:         agentRunStore,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		scriptableChatService, err = scriptablechat.NewService(scriptablechat.ServiceOptions{
			Runs:        agentRunStore,
			Engines:     engineStore,
			LLM:         llmRuntime,
			Tools:       mcpClient,
			Broadcaster: websocketHub,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		gitReadService, err = gitread.NewService(gitread.ServiceOptions{
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		broadcastAllProjectMetadata := func(ctx context.Context, snapshot projectstate.Snapshot) error {
			var defaultProjectID *string
			if trimmedDefaultProjectID := strings.TrimSpace(snapshot.Document.DefaultProjectID); trimmedDefaultProjectID != "" {
				defaultProjectID = &trimmedDefaultProjectID
			}
			_, err = websocketHub.BroadcastJSON(
				ctx,
				realtime.NewAllProjectMetadataMessage(realtime.AllProjectMetadataContent{
					DefaultProjectConfigID: defaultProjectID,
					ProjectMetadata:        snapshot.Document.ProjectConfigMetadata(),
				}),
				realtime.Selection{Type: realtime.ConnectionTypeFrontend},
			)
			return err
		}
		broadcastSavedProjectNotification := func(ctx context.Context, _ projectstate.Snapshot, projectID string) error {
			notificationID, err := newAppNotificationID()
			if err != nil {
				return err
			}
			_, err = websocketHub.BroadcastJSON(
				ctx,
				realtime.NewNotificationMessage(realtime.NotificationContent{
					ID:              notificationID,
					ProjectConfigID: projectID,
					Type:            realtime.NotificationTypeSave,
					Message:         "Saved!",
					Temporary:       false,
					Timestamp:       time.Now().UTC().Format(time.RFC3339Nano),
					Metadata:        map[string]any{},
					ReadStatus:      false,
				}),
				realtime.Selection{Type: realtime.ConnectionTypeFrontend},
			)
			return err
		}
		deleteProjectTerminals := func(ctx context.Context, _ projectstate.Snapshot, deletedIDs []string) error {
			var joined error
			for _, projectID := range deletedIDs {
				for _, session := range terminalService.List(projectID, "") {
					joined = errors.Join(joined, terminalService.Delete(ctx, session.ID))
				}
			}
			return joined
		}
		projectShellService, err = projectshell.NewService(projectshell.ServiceOptions{
			ProjectState:     projectRuntime,
			AfterProjectSave: broadcastSavedProjectNotification,
			AfterProjectMetadataMutation: func(ctx context.Context, snapshot projectstate.Snapshot) error {
				return broadcastAllProjectMetadata(ctx, snapshot)
			},
			AfterProjectsDelete: deleteProjectTerminals,
			AfterProjectRename: func(ctx context.Context, snapshot projectstate.Snapshot, projectID string) error {
				projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
				if err != nil {
					return err
				}
				status := projectRuntime.FrontendOpStatus()
				if _, err := websocketHub.BroadcastJSON(
					ctx,
					realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
						ProjectState:   projectStateView,
						CompletedOpIDs: status.Completed,
						PendingOpIDs:   status.Pending,
					}),
					realtime.Selection{Type: realtime.ConnectionTypeFrontend},
				); err != nil {
					return err
				}
				return broadcastAllProjectMetadata(ctx, snapshot)
			},
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		notificationStore, err = notifications.NewStore(cfg.Paths.SettaFilesRoot)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		notificationService, err = notifications.NewService(notifications.ServiceOptions{
			Store: notificationStore,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalAgentFollow, err = externalagents.NewFollowService(externalagents.FollowServiceOptions{
			Tools:        mcpClient,
			TemporaryIDs: temporaryIDs,
			Broadcaster:  websocketHub,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalAgentRuntime, err = externalagents.NewRuntime(externalagents.RuntimeOptions{
			Runs:   agentRunStore,
			Follow: externalAgentFollow,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalAgentChats, err = externalagents.NewService(externalagents.ServiceOptions{
			Runs: agentRunStore,
			Live: externalAgentRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		codexExecutor, err := externalagents.NewCodexExecutor(externalagents.CodexExecutorOptions{
			Runs:           agentRunStore,
			Runtime:        externalAgentRuntime,
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			ProcessEnv:     llmconfig.CurrentProcessEnv(),
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		claudeExecutor, err := externalagents.NewClaudeExecutor(externalagents.ClaudeExecutorOptions{
			Runs:          agentRunStore,
			Runtime:       externalAgentRuntime,
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
			ProcessEnv:    llmconfig.CurrentProcessEnv(),
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		openCodeExecutor, err := externalagents.NewOpenCodeExecutor(externalagents.OpenCodeExecutorOptions{
			Runs:           agentRunStore,
			Runtime:        externalAgentRuntime,
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			ProcessEnv:     llmconfig.CurrentProcessEnv(),
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		pluginExecutor, err := externalagents.NewPluginExecutor(externalagents.PluginExecutorOptions{
			Runs:                  agentRunStore,
			Runtime:               externalAgentRuntime,
			WorkspaceRoot:         cfg.Paths.WorkspaceRoot,
			ProcessEnv:            llmconfig.CurrentProcessEnv(),
			PluginAdapterProvider: externalAgentPluginAdapterProvider{plugins: pluginMutationService},
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		externalAgentExecutor = externalagents.NewMultiExecutor(externalagents.MultiExecutorOptions{
			Claude:   claudeExecutor,
			Codex:    codexExecutor,
			OpenCode: openCodeExecutor,
			Plugin:   pluginExecutor,
		})
		externalAgentSend, err = externalagents.NewSendService(externalagents.SendServiceOptions{
			ProjectState: projectRuntime,
			Engines:      engineStore,
			Runs:         agentRunStore,
			Profiles:     agentProfileStore,
			Configs:      externalConfigStore,
			Runtime:      externalAgentRuntime,
			Preflight:    externalPreflightChecker,
			Attachments:  attachmentService,
			Executor:     externalAgentExecutor,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		stateMachineRuntime, err = statemachineruns.NewRuntime(statemachineruns.RuntimeOptions{
			Runs:      agentRunStore,
			Engines:   engineStore,
			Templates: promptTemplateStore,
			ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
				if shareSessionID != nil && strings.TrimSpace(*shareSessionID) != "" {
					if deploymentRuntime == nil {
						return nil, fmt.Errorf("deployment runtime is required for workflow share session %s", strings.TrimSpace(*shareSessionID))
					}
					return deploymentRuntime.Overlay(strings.TrimSpace(*shareSessionID))
				}
				if projectRuntime == nil {
					return nil, fmt.Errorf("project runtime is required")
				}
				return projectRuntime, nil
			},
			ManagedChats:  managedChatService,
			ManagedRuns:   agentRunRuntime,
			ExternalChats: externalAgentSend,
			ExternalRuns:  externalAgentRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		agentRunStore.AddAfterSaveListener(func(run agentruns.Run) {
			if stateMachineRuntime == nil {
				return
			}
			if _, err := stateMachineRuntime.HandleTerminalChildRunUpdate(run); err != nil {
				logger.Error("state machine runtime failed to process child run update", "runId", run.ID, "error", err)
			}
		})
		externalAgentRunService, err := externalagents.NewRunService(externalagents.RunServiceOptions{
			ProjectState: projectRuntime,
			Engines:      engineStore,
			Runs:         agentRunStore,
			Configs:      externalConfigStore,
			Runtime:      externalAgentRuntime,
			Preflight:    externalPreflightChecker,
			Attachments:  attachmentService,
			Executor:     externalAgentExecutor,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		runChainRuntime, err = runchains.NewRuntime(runchains.RuntimeOptions{
			Runs:         agentRunStore,
			Engines:      engineStore,
			Profiles:     agentProfileStore,
			ProjectState: projectRuntime,
			Managed:      agentRunRuntime,
			External:     externalAgentRunService,
			TemporaryIDs: temporaryIDs,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
	}
	runPlanner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectRuntime,
		SettaFilesRoot: plannerFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	listenerBroadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: websocketHub,
	})
	uiSettingRevealResults := realtime.NewUISettingRevealResultHub()
	listenerProducer := realtime.NewListenerProducer(realtime.ListenerProducerOptions{
		Broadcaster:  listenerBroadcaster,
		ProjectState: projectRuntime,
		Deployment:   deploymentRuntime,
	})
	backendLogService, err := backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       logger,
		WebsocketHub: websocketHub,
		EnvLookup:    os.LookupEnv,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	uiSettingRevealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: websocketHub,
		Results:   uiSettingRevealResults,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	runCodeService, err := runs.NewService(runs.ServiceOptions{
		Planner:           runPlanner,
		ProjectState:      projectRuntime,
		DeploymentRuntime: deploymentRuntime,
		Terminals:         terminalService,
		BackendLogs:       backendLogService,
		BinaryStore:       binaryStore,
		ListenerProducer:  listenerProducer,
		ArtifactsRoot:     artifactsRoot,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	detachedRunManager, err = detachedruns.NewManager(detachedruns.ManagerOptions{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	if deploymentRuntime != nil {
		manager.Go("deployment-session-cleanup", func(ctx context.Context) error {
			return runDeploymentSessionCleanupLoop(ctx, deploymentRuntime, terminalService, listenerBroadcaster, shareArtifactService, 0)
		})
	}
	if modePolicy.IsIDE() && transcriptionSessions != nil {
		manager.Go("transcription-session-cleanup", func(ctx context.Context) error {
			return runTranscriptionSessionCleanupLoop(ctx, transcriptionSessions, 0)
		})
	}
	if modePolicy.IsIDE() {
		catalogRoot, err := deployments.DefaultCatalogRoot(cfg.Paths.SettaFilesRoot)
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		deploymentCatalog, err = deployments.NewCatalog(deployments.CatalogOptions{
			Root: catalogRoot,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		sharePublisher, err = deployments.NewSharePublisher(deployments.SharePublisherOptions{
			Catalog:        deploymentCatalog,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		appPublisher, err = deployments.NewAppPublisher(deployments.AppPublisherOptions{
			Catalog:        deploymentCatalog,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
	}
	if modePolicy.IsIDE() && pluginDiscovery != nil && pluginWorkerRuntime != nil {
		pluginProjectStateReader, err := plugins.NewRuntimeProjectStateReader(plugins.RuntimeProjectStateReaderOptions{
			ProjectState: projectRuntime,
			Deployment:   deploymentRuntime,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		initialPluginRuntime, err := plugins.NewBackendRouteRuntime(context.Background(), plugins.BackendRouteRuntimeOptions{
			DiscoveryService: pluginDiscovery,
			RuntimeProvider:  pluginWorkerRuntime,
			ListenerProducer: listenerProducer,
			ProjectStateRead: pluginProjectStateReader,
			ServerMode:       cfg.Server.Mode,
			Logger:           logger,
		})
		if err != nil {
			_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
			return nil, err
		}
		pluginBackendRoutes = plugins.NewBackendRuntimeHolder(initialPluginRuntime)
		pluginRuntimeRefresh = &pluginBackendRuntimeRefresher{
			service:          pluginMutationService,
			discovery:        pluginDiscovery,
			runtimeProvider:  pluginWorkerRuntime,
			listenerProducer: listenerProducer,
			projectStateRead: pluginProjectStateReader,
			serverMode:       cfg.Server.Mode,
			holder:           pluginBackendRoutes,
			lspRouter:        lspRouter,
			backendRegs:      pluginBackendRegs,
		}
		pluginMutationService.SetRestartCallback(func(ctx context.Context) (bool, error) {
			if pluginRuntimeRefresh == nil {
				return false, errors.New("plugin backend runtime refresher is not configured")
			}
			if _, err := pluginRuntimeRefresh.Refresh(ctx); err != nil {
				return false, err
			}
			return true, nil
		})
		pluginRouteService = newPluginMutationRuntimeService(pluginMutationService, pluginRuntimeRefresh)
	}
	if modePolicy.IsIDE() {
		mcpServer, err = mcpx.NewServer(mcpx.ServerOptions{
			Logger:                         logger,
			WorkspaceRoot:                  cfg.Paths.WorkspaceRoot,
			ProjectState:                   projectRuntime,
			CodegenTargetValidator:         codegenValidator,
			PythonCodegenSectionReconciler: pythonMaterializer,
			CodeUpdates:                    codeUpdates,
			SettingsState:                  settingsStateRuntime,
			SectionNames:                   renameRefactors,
			CallableSignatures:             lspSignature,
			PluginMutations:                pluginRouteService,
			PythonPackages:                 pythonPackages,
			LSPDiagnostics:                 lspDiagnostics,
			MCPStatuses:                    mcpClient,
			Terminals:                      terminalService,
			DocsRoot:                       filepath.Join(cfg.Paths.WorkspaceRoot, "docs"),
			TemporaryIDMapPath:             mcpx.TemporaryIDMapPath(cfg.Paths.RuntimeRoot),
			AgentProfiles:                  agentProfileStore,
			AgentRuns:                      agentRunService,
			UISettingReveals:               uiSettingRevealService,
			StateMachineRuns:               stateMachineRuntime,
		})
		if err != nil {
			_ = errors.Join(
				closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()),
				closePluginBackendRoutes(pluginBackendRoutes),
				terminalService.Close(context.Background()),
			)
			return nil, err
		}
	}
	if mcpServer != nil && pluginBackendRoutes != nil {
		registeredPluginToolNames, err := registerPluginMCPTools(mcpServer, pluginBackendRoutes.Current())
		if err != nil {
			_ = errors.Join(
				closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()),
				closePluginBackendRoutes(pluginBackendRoutes),
				terminalService.Close(context.Background()),
			)
			return nil, err
		}
		if pluginRuntimeRefresh != nil {
			pluginRuntimeRefresh.AttachMCPServer(mcpServer, registeredPluginToolNames)
		}
	}
	authRefreshWindowSeconds := int(authService.AuthCookieRefreshWindow() / time.Second)
	worktreeName := devworktree.ActiveName()
	statusReadyAt := time.Now().UTC()
	listenerBuiltInInvoker, err := newListenerBuiltInEndpointInvoker(authService, scriptableChatService)
	if err != nil {
		_ = errors.Join(
			closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()),
			closePluginBackendRoutes(pluginBackendRoutes),
			terminalService.Close(context.Background()),
		)
		return nil, err
	}
	handler, err := httpapi.NewHandler(httpapi.Dependencies{
		Logger: logger,
		Info: infoService{
			config:         cfg,
			authCookieName: authService.AuthCookieBaseName(),
		},
		Auth:           authService,
		TrustedOrigins: trustedOrigins,
		ModePolicy:     modes.NewPolicy(cfg.Server.Mode),
		RegisterRoot: func(r chi.Router) {
			if err := httpapi.RegisterPluginRootRoutes(r, httpapi.PluginRootRouteDependencies{
				Service:        pluginRouteService,
				BackendRuntime: pluginBackendRoutes,
			}); err != nil {
				panic(err)
			}
			if attachmentService != nil {
				if err := httpapi.RegisterAttachmentRootRoutes(r, httpapi.AttachmentRootRouteDependencies{
					ModePolicy:    modePolicy,
					ShareSessions: shareSessions,
					Deployment:    deploymentRuntime,
					Service:       attachmentService,
				}); err != nil {
					panic(err)
				}
			}
			if err := wsapi.RegisterRoutes(r, wsapi.RouteDependencies{
				Transport: wsapi.Dependencies{
					Auth:           authService,
					ModePolicy:     modePolicy,
					ShareSessions:  shareSessions,
					TrustedOrigins: trustedOrigins,
				},
				Deployment:              deploymentRuntime,
				ProjectState:            projectRuntime,
				Artifacts:               artifactService,
				ShareArtifacts:          shareArtifactService,
				WebsocketHub:            websocketHub,
				UISettingRevealResults:  uiSettingRevealResults,
				ListenerBroadcaster:     listenerBroadcaster,
				BuiltInListenerInvoker:  listenerBuiltInInvoker,
				ListenerEndpointInvoker: pluginBackendRoutes,
				ListenerProducer:        listenerProducer,
				Terminals:               terminalService,
			}); err != nil {
				panic(err)
			}
		},
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if mcpServer == nil {
				return
			}
			r.Handle("/mcp", mcpServer.Handler())
			r.Handle("/mcp/", mcpServer.Handler())
			if err := httpapi.RegisterMCPRootRoutes(r, httpapi.MCPRootRouteDependencies{
				ModePolicy: modePolicy,
				Server:     mcpServer,
			}); err != nil {
				panic(err)
			}
		},
		Register: func(r chi.Router) {
			if err := httpapi.RegisterStatusRoutes(r, httpapi.StatusRouteDependencies{
				ModePolicy:               modePolicy,
				SettaHome:                cfg.Paths.SettaHome,
				GlobalSettaFilesBase:     cfg.User.GlobalSettaFilesBase,
				ActiveSettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
				SettaFilesRoot:           cfg.Paths.SettaFilesRoot,
				RevealPath:               pathRevealService,
				AuthRefreshWindowSeconds: authRefreshWindowSeconds,
				WorktreeName:             worktreeName,
				ReadyAt:                  statusReadyAt,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterDocstringRoutes(r, httpapi.DocstringRouteDependencies{
				ModePolicy: modePolicy,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterSettingsRoutes(r, httpapi.SettingsRouteDependencies{
				ModePolicy:    modePolicy,
				SettingsState: settingsStateRuntime,
				WebsocketHub:  websocketHub,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterPluginRoutes(r, httpapi.PluginRouteDependencies{
				ModePolicy: modePolicy,
				Service:    pluginRouteService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterPluginBackendRoutes(r, httpapi.PluginBackendRouteDependencies{
				ModePolicy: modePolicy,
				Runtime:    pluginBackendRoutes,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterListenerRoutes(r, httpapi.ListenerRouteDependencies{
				ModePolicy:          modePolicy,
				ShareSessions:       shareSessions,
				ProjectState:        projectRuntime,
				Deployment:          deploymentRuntime,
				ListenerBroadcaster: listenerBroadcaster,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterDeploymentRoutes(r, httpapi.DeploymentRouteDependencies{
				ModePolicy: modePolicy,
				Deployment: deploymentRuntime,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterDeploymentIDERoutes(r, httpapi.DeploymentIDERouteDependencies{
				ModePolicy:     modePolicy,
				ProjectState:   projectRuntime,
				Catalog:        deploymentCatalog,
				SharePublisher: sharePublisher,
				AppPublisher:   appPublisher,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterLauncherHomeRoutes(r, httpapi.LauncherHomeRouteDependencies{
				ModePolicy:       modePolicy,
				DefaultSettaHome: cfg.Paths.SettaHome,
				Home:             launcherHome,
				OpenWorkspace:    launcherOpenWorkspace,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterLauncherManagementRoutes(r, httpapi.LauncherManagementRouteDependencies{
				ModePolicy:       modePolicy,
				DefaultSettaHome: cfg.Paths.SettaHome,
				Manager:          launcherManagement,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterWorkspaceLaunchRoutes(r, httpapi.WorkspaceLaunchRouteDependencies{
				ModePolicy: modePolicy,
				Auth:       authService,
				Intents:    launchIntentService,
				Launch:     localLaunchService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterBinaryRoutes(r, httpapi.BinaryRouteDependencies{
				ModePolicy: modePolicy,
				Store:      binaryStore,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAttachmentRoutes(r, httpapi.AttachmentRouteDependencies{
				ModePolicy:    modePolicy,
				ShareSessions: shareSessions,
				Deployment:    deploymentRuntime,
				Service:       attachmentService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterFileBrowserRoutes(r, httpapi.FileBrowserRouteDependencies{
				ModePolicy: modePolicy,
				Browser:    fileBrowserService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterArtifactRoutes(r, httpapi.ArtifactRouteDependencies{
				ModePolicy:     modePolicy,
				ShareSessions:  shareSessions,
				Artifacts:      artifactService,
				ShareArtifacts: shareArtifactService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterTerminalRoutes(r, httpapi.TerminalRouteDependencies{
				ModePolicy:    modePolicy,
				ShareSessions: shareSessions,
				Deployment:    deploymentRuntime,
				Terminals:     terminalService,
				RunCode:       runCodeService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterDetachedRunRoutes(r, httpapi.DetachedRunRouteDependencies{
				ModePolicy: modePolicy,
				Planner:    runPlanner,
				Runs:       detachedRunManager,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterProjectShellRoutes(r, httpapi.ProjectShellRouteDependencies{
				ModePolicy:    modePolicy,
				Shell:         projectShellService,
				Notifications: notificationService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterGitRoutes(r, httpapi.GitRouteDependencies{
				ModePolicy: modePolicy,
				Git:        gitReadService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterProjectRoutes(r, httpapi.ProjectRouteDependencies{
				ModePolicy:                     modePolicy,
				WorkspaceRoot:                  cfg.Paths.WorkspaceRoot,
				ProjectState:                   projectRuntime,
				PromptTemplates:                promptTemplateStore,
				ShareSessions:                  shareSessions,
				Deployment:                     deploymentRuntime,
				SettingsState:                  settingsStateRuntime,
				ChatSectionChatIDs:             chatSectionChatIDs,
				EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
				CodegenTargetValidator:         codegenValidator,
				PythonCodegenSectionReconciler: pythonMaterializer,
				CallableSignatures:             lspSignature,
				CodeUpdates:                    codeUpdates,
				RenameRefactors:                renameRefactors,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAppDefinitionRoutes(r, httpapi.AppDefinitionRouteDependencies{
				ModePolicy:   modePolicy,
				ProjectState: projectRuntime,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAIRoutes(r, httpapi.AIRouteDependencies{
				ModePolicy:            modePolicy,
				ManagedChats:          managedChatService,
				ExternalAgentSend:     externalAgentSend,
				ExternalAgentChats:    externalAgentChats,
				ExternalAgentFollow:   externalAgentFollow,
				ExternalAgentRuns:     externalAgentRuntime,
				TranscriptionProfiles: transcriptionProfiles,
				TranscriptionSessions: transcriptionSessions,
				Sessions:              authService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAgentProfileRoutes(r, httpapi.AgentProfileRouteDependencies{
				ModePolicy: modePolicy,
				Profiles:   agentProfileStore,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterPromptTemplateRoutes(r, httpapi.PromptTemplateRouteDependencies{
				ModePolicy: modePolicy,
				Templates:  promptTemplateStore,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAppGenSkillRoutes(r, httpapi.AppGenSkillRouteDependencies{
				ModePolicy: modePolicy,
				Service:    appGenSkillService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterExternalAgentConfigRoutes(r, httpapi.ExternalAgentConfigRouteDependencies{
				ModePolicy: modePolicy,
				Configs:    externalConfigService,
				Preflight:  externalPreflight,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterEngineConfigRoutes(r, httpapi.EngineConfigRouteDependencies{
				ModePolicy: modePolicy,
				Engines:    engineStore,
				LLM:        llmRuntime,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterTranscriptionProfileRoutes(r, httpapi.TranscriptionProfileRouteDependencies{
				ModePolicy: modePolicy,
				Profiles:   transcriptionProfiles,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterLLMRoutes(r, httpapi.LLMRouteDependencies{
				ModePolicy:   modePolicy,
				Service:      llmService,
				WebsocketHub: websocketHub,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAgenticSummaryCacheRoutes(r, httpapi.AgenticSummaryCacheRouteDependencies{
				ModePolicy:   modePolicy,
				ProjectState: projectRuntime,
				Statuses:     agenticSummaryStatus,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterAgentRunRoutes(r, httpapi.AgentRunRouteDependencies{
				ModePolicy: modePolicy,
				Profiles:   agentProfileStore,
				Runs:       agentRunStore,
				Managed:    agentRunRuntime,
				Chains:     runChainRuntime,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterMCPRoutes(r, httpapi.MCPRouteDependencies{
				ModePolicy:               modePolicy,
				LLMConfigPath:            mcpx.LLMConfigPath(cfg.Paths.SettaFilesRoot),
				ActiveSettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
				Client:                   mcpClient,
				ExternalStatusProvider:   externalAgentRuntime,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterLSPRoutes(r, httpapi.LSPRouteDependencies{
				ModePolicy:   modePolicy,
				ProjectState: projectRuntime,
				Diagnostics:  lspDiagnostics,
				Completions:  lspCompletion,
				Admin:        projectLSPSyncer,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		_ = errors.Join(
			closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()),
			closePluginBackendRoutes(pluginBackendRoutes),
			terminalService.Close(context.Background()),
		)
		return nil, err
	}
	listenerBuiltInInvoker.SetHandler(handler)
	if mcpClient != nil {
		mcpClient.Start(context.Background())
	}

	return &App{
		config:        cfg,
		logger:        logger,
		authService:   authService,
		runtime:       manager,
		projectStates: projectStates,
		deployment:    deploymentRuntime,
		shareSessions: shareSessions,
		terminals:     terminalService,
		binaryStore:   binaryStore,
		runCode:       runCodeService,
		agentRuns:     agentRunService,
		agentRuntime:  agentRunRuntime,
		runChains:     runChainRuntime,
		settingsState: settingsStateRuntime,
		websocketHub:  websocketHub,
		listeners:     listenerBroadcaster,
		lspSync:       projectLSPSyncer,
		watchCode:     watchCodeService,
		boundCode:     boundCodeService,
		mcpServer:     mcpServer,
		mcpClient:     mcpClient,
		pluginRoutes:  pluginBackendRoutes,
		handler:       handler,
	}, nil
}

func (a *App) Config() config.Config {
	return a.config
}

func (a *App) Handler() http.Handler {
	return a.handler
}

func (a *App) Runtime() *runtime.Manager {
	return a.runtime
}

func (a *App) Auth() *auth.Service {
	return a.authService
}

func (a *App) ProjectStates() *projectstate.Registry {
	return a.projectStates
}

func (a *App) SettingsState() *settingsstate.Runtime {
	return a.settingsState
}

func (a *App) DeploymentRuntime() *deployments.Runtime {
	return a.deployment
}

func (a *App) ShareSessions() modes.ShareSessionStore {
	return a.shareSessions
}

func (a *App) MCPServer() *mcpx.Server {
	return a.mcpServer
}

func registerPluginMCPTools(server *mcpx.Server, runtime *plugins.BackendRouteRuntime) ([]string, error) {
	if server == nil || runtime == nil {
		return nil, nil
	}

	registrations := pluginMCPToolRegistrations(runtime)
	for _, registration := range registrations {
		if _, err := server.RegisterTool(registration); err != nil {
			return nil, err
		}
	}
	return toolRegistrationNames(registrations), nil
}

func (a *App) MCPClient() *mcpx.Client {
	return a.mcpClient
}

func newAppNotificationID() (string, error) {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (a *App) Terminals() *terminals.Service {
	return a.terminals
}

func (a *App) BinaryStore() *binarypayload.Store {
	return a.binaryStore
}

func (a *App) RunCode() *runs.Service {
	return a.runCode
}

func (a *App) AgentRuns() *agentruns.Service {
	return a.agentRuns
}

func (a *App) ManagedAgentRuntime() *agentruns.Runtime {
	return a.agentRuntime
}

func (a *App) RunChainRuntime() *runchains.Runtime {
	return a.runChains
}

func (a *App) WebsocketHub() *realtime.WebsocketHub {
	return a.websocketHub
}

func (a *App) ListenerBroadcaster() *realtime.ListenerBroadcaster {
	return a.listeners
}

func (a *App) Shutdown(ctx context.Context) error {
	return errors.Join(
		closeProjectStateServices(a.projectStates, a.deployment, a.lspSync, a.watchCode, a.boundCode, ctx),
		closeMCPClient(a.mcpClient, ctx),
		closeSettingsState(a.settingsState),
		closePluginBackendRoutes(a.pluginRoutes),
		a.terminals.Close(ctx),
		a.runtime.Shutdown(ctx),
	)
}

type infoService struct {
	config         config.Config
	authCookieName string
}

func (s infoService) ServerMode(context.Context) string {
	return string(s.config.Server.Mode)
}

func (s infoService) RuntimeInfo(context.Context) httpapi.RuntimeInfo {
	return httpapi.RuntimeInfo{
		Mode: string(s.config.Server.Mode),
		Paths: httpapi.RuntimePaths{
			WorkspaceRoot:      s.config.Paths.WorkspaceRoot,
			DeploymentRoot:     s.config.Paths.DeploymentRoot,
			SettaHome:          s.config.Paths.SettaHome,
			ProfileLookupHome:  s.config.Paths.ProfileLookupHome,
			Profile:            s.config.Paths.ProfileName,
			SettaFilesRoot:     s.config.Paths.SettaFilesRoot,
			SettaFilesLocation: s.config.Paths.ActiveSettaFilesLocation(),
			RuntimeRoot:        s.config.Paths.RuntimeRoot,
		},
		Policy: httpapi.RuntimePathPolicy{
			GlobalSettaFilesBase: s.config.User.GlobalSettaFilesBase,
			AutoMode:             string(s.config.User.AutoMode),
		},
		Auth: httpapi.RuntimeAuth{
			AuthCookieName: s.authCookieName,
		},
	}
}

func closeProjectResources(projectStates *projectstate.Registry, deploymentRuntime *deployments.Runtime) error {
	return errors.Join(closeProjectStates(projectStates), closeDeploymentRuntime(deploymentRuntime))
}

func closePluginBackendRoutes(runtime *plugins.BackendRuntimeHolder) error {
	if runtime == nil {
		return nil
	}
	return runtime.Close()
}

func closeProjectStateServices(
	projectStates *projectstate.Registry,
	deploymentRuntime *deployments.Runtime,
	syncer *lsp.ProjectSynchronizer,
	watchService *watchcode.Service,
	boundCodeService *boundcode.Service,
	ctx context.Context,
) error {
	return errors.Join(
		closeBoundCodeService(boundCodeService),
		closeWatchCodeService(watchService),
		closeLSPProjectSynchronizer(syncer, ctx),
		closeProjectResources(projectStates, deploymentRuntime),
	)
}

func closeProjectStates(projectStates *projectstate.Registry) error {
	if projectStates == nil {
		return nil
	}
	return projectStates.Close()
}

func closeDeploymentRuntime(deploymentRuntime *deployments.Runtime) error {
	if deploymentRuntime == nil {
		return nil
	}
	return deploymentRuntime.Close()
}

func closeLSPProjectSynchronizer(syncer *lsp.ProjectSynchronizer, ctx context.Context) error {
	if syncer == nil {
		return nil
	}
	return syncer.Close(ctx)
}

func closeWatchCodeService(service *watchcode.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeBoundCodeService(service *boundcode.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func boundCodeServiceInputs(inputs []projectstate.BoundCodeFileInput) []boundcode.FileInput {
	serviceInputs := make([]boundcode.FileInput, 0, len(inputs))
	for _, input := range inputs {
		bindings := make([]boundcode.Binding, 0, len(input.Bindings))
		for _, binding := range input.Bindings {
			bindings = append(bindings, boundcode.Binding{
				ProjectID: binding.ProjectID,
				SectionID: binding.SectionID,
			})
		}
		serviceInputs = append(serviceInputs, boundcode.FileInput{
			Path:     input.Path,
			Bindings: bindings,
		})
	}
	return serviceInputs
}

func newInternalMCPClient(cfg config.Config, logger *slog.Logger, authService *auth.Service) (*mcpx.Client, error) {
	serverConfigs, err := mcpx.LoadServerConfigs(
		mcpx.LLMConfigPath(cfg.Paths.SettaFilesRoot),
		mcpx.LoadServerConfigsOptions{
			SettaServerURL: mcpx.BuildSettaServerURL(cfg.Server.Host, cfg.Server.Port),
		},
	)
	if err != nil {
		return nil, err
	}

	return mcpx.NewClient(mcpx.ClientOptions{
		Logger:  logger,
		Servers: serverConfigs,
		HeaderProvider: func(serverID string) (http.Header, error) {
			if serverID != mcpx.DefaultServerID {
				return nil, nil
			}
			return buildInternalMCPHeaders(authService)
		},
	})
}

func buildInternalMCPHeaders(authService *auth.Service) (http.Header, error) {
	if authService == nil {
		return nil, nil
	}
	session, ok := authService.CurrentSession()
	if !ok {
		return nil, auth.ErrMissingCurrentSession
	}
	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		return nil, err
	}
	cookieName, err := authService.CookieName(session.Metadata.ID)
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Cookie", cookieName+"="+token)
	return headers, nil
}

func closeMCPClient(client *mcpx.Client, ctx context.Context) error {
	if client == nil {
		return nil
	}
	return client.Close(ctx)
}

func closeSettingsState(runtime *settingsstate.Runtime) error {
	if runtime == nil {
		return nil
	}
	return runtime.Close()
}
