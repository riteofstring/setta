package app

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"setta/internal/artifactwatch"
	"setta/internal/boundcode"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/jsonsourcewatch"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/lspsignature"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectbackup"
	"setta/internal/projectstate"
	"setta/internal/pythonenv"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
	"setta/internal/watchcode"
)

type projectServices struct {
	projectStates            *projectstate.Registry
	deploymentRuntime        *deployments.Runtime
	projectRuntime           *projectstate.Runtime
	settingsStateRuntime     *settingsstate.Runtime
	codegenValidator         projectstate.CodegenTargetValidator
	lspDiagnostics           *projectstate.LSPDiagnosticsRegistry
	lspRouter                *lsp.Router
	projectLSPSyncer         *lsp.ProjectSynchronizer
	lspCompletion            *lspcompletion.Service
	lspSignature             *lspsignature.Service
	pythonMaterializer       *codegen.PythonMaterializer
	pluginMaterializer       *codegen.PluginMaterializer
	watchCodeServiceRef      *watchCodeServiceRef
	boundCodeService         *boundcode.Service
	watchCodeWarnings        *watchCodeWarningTracker
	codeUpdates              *codeUpdateService
	renameRefactors          *renameRefactorService
	plannerFilesRoot         string
	artifactsRoot            string
	shareSessions            modes.ShareSessionStore
	pluginDiscovery          *plugins.DiscoveryService
	pluginMutationService    *plugins.Service
	pluginRouteService       httpapi.PluginRouteService
	pythonPackages           *pythonenv.Runtime
	appSubsystemCapabilities *appSubsystemCapabilityState
	watchCodeCapabilities    *watchCodeCapabilityState
}

type projectWatchRefs struct {
	jsonSourceWatchService *jsonsourcewatch.Service
	artifactWatchService   *artifactwatch.Service
}

func closeInitializedProjectServices(services projectServices) error {
	return closeProjectStateServices(
		services.projectStates,
		services.deploymentRuntime,
		services.projectLSPSyncer,
		services.watchCodeServiceRef,
		services.boundCodeService,
		context.Background(),
	)
}

func initializeProjectServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	websocketHub *realtime.WebsocketHub,
	watchRefs *projectWatchRefs,
) (projectServices, error) {
	if modePolicy.IsDeployment() {
		return initializeDeploymentProjectServices(cfg)
	}

	services := projectServices{}
	services.watchCodeServiceRef = newWatchCodeServiceRef()
	if err := initializeWorkspacePluginServices(cfg, logger, &services); err != nil {
		return projectServices{}, err
	}
	if err := initializeWorkspaceLSPServices(cfg, logger, websocketHub, &services); err != nil {
		return projectServices{}, err
	}
	if err := openWorkspaceProjectServices(cfg, logger, websocketHub, watchRefs, &services); err != nil {
		return projectServices{}, err
	}
	if _, _, err := ensureProjectPluginFeatureCapabilities(&services); err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	if modePolicy.IsIDE() {
		if err := initializeIDEProjectEditingServices(cfg, logger, websocketHub, &services); err != nil {
			return projectServices{}, err
		}
	}
	return services, nil
}

func initializeDeploymentProjectServices(cfg config.Config) (projectServices, error) {
	services := projectServices{}
	typeRegistry, err := NewDeploymentTypeRegistry(cfg)
	if err != nil {
		return projectServices{}, err
	}
	manifest, err := deployments.LoadManifest(cfg.Paths.DeploymentRoot)
	if err != nil {
		return projectServices{}, err
	}
	registration, err := typeRegistry.ResolveStartupRegistration(
		string(cfg.Server.Mode),
		manifest,
	)
	if err != nil {
		return projectServices{}, err
	}
	listenerPython, err := pythonenv.ResolveCurrentProcessInterpreter(os.LookupEnv)
	if err != nil {
		listenerPython = ""
	}
	services.deploymentRuntime, err = registration.OpenRuntime(
		context.Background(),
		deployments.RuntimeOptions{
			DeploymentRoot: cfg.Paths.DeploymentRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			ListenerHost:   cfg.Server.Host,
			ListenerPort:   cfg.Server.Port,
			ListenerPython: listenerPython,
		},
	)
	if err != nil {
		return projectServices{}, err
	}
	services.projectRuntime = services.deploymentRuntime.Base()
	services.plannerFilesRoot = services.deploymentRuntime.Paths().DeploymentRoot
	services.artifactsRoot = services.deploymentRuntime.Paths().ArtifactsRoot
	services.shareSessions = services.deploymentRuntime

	pluginStore, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  services.deploymentRuntime.Paths().DeploymentRoot,
		SettaFilesRoot: services.deploymentRuntime.Paths().DeploymentRoot,
		SettaHome:      services.deploymentRuntime.Paths().RuntimeRoot,
	})
	if err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	services.pluginDiscovery, err = plugins.NewDiscoveryService(
		plugins.DiscoveryServiceOptions{
			Store:            pluginStore,
			ServerMode:       cfg.Server.Mode,
			DeploymentScoped: true,
		},
	)
	if err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	services.pluginMutationService, err = plugins.NewService(plugins.ServiceOptions{
		Store:            pluginStore,
		DiscoveryService: services.pluginDiscovery,
		WorkspaceRoot:    services.deploymentRuntime.Paths().DeploymentRoot,
		SettaFilesRoot:   services.deploymentRuntime.Paths().DeploymentRoot,
		SettaHome:        services.deploymentRuntime.Paths().RuntimeRoot,
		ServerMode:       cfg.Server.Mode,
	})
	if err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	services.pluginRouteService = services.pluginMutationService
	return services, nil
}

func initializeWorkspacePluginServices(
	cfg config.Config,
	logger *slog.Logger,
	services *projectServices,
) error {
	pythonMaterializer, err := codegen.NewPythonMaterializer(
		codegen.PythonMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
		},
	)
	if err != nil {
		return err
	}
	services.pythonMaterializer = pythonMaterializer

	pythonPackages, err := pythonenv.NewRuntime(pythonenv.RuntimeOptions{})
	if err != nil {
		logger.Warn("python package inspection runtime unavailable", "error", err)
	}
	services.pythonPackages = pythonPackages

	pluginStore, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		SettaHome:      cfg.Paths.SettaHome,
	})
	if err != nil {
		return err
	}
	services.pluginDiscovery, err = plugins.NewDiscoveryService(
		plugins.DiscoveryServiceOptions{
			Store:                 pluginStore,
			ServerMode:            cfg.Server.Mode,
			PackageManagerRuntime: services.pythonPackages,
		},
	)
	if err != nil {
		return err
	}
	services.pluginMutationService, err = plugins.NewService(plugins.ServiceOptions{
		Store:            pluginStore,
		DiscoveryService: services.pluginDiscovery,
		WorkspaceRoot:    cfg.Paths.WorkspaceRoot,
		SettaFilesRoot:   cfg.Paths.SettaFilesRoot,
		SettaHome:        cfg.Paths.SettaHome,
		ServerMode:       cfg.Server.Mode,
		CandidateProvider: plugins.NewProductionCandidateProvider(
			plugins.ProductionCandidateProviderOptions{
				PackageManagerRuntime: services.pythonPackages,
				SettaFilesRoot:        cfg.Paths.SettaFilesRoot,
			},
		),
		PackageManagerRuntime: services.pythonPackages,
	})
	if err != nil {
		return err
	}
	services.pluginMaterializer, err = codegen.NewPluginMaterializer(
		codegen.PluginMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			Generator:      services.pluginMutationService,
		},
	)
	if err != nil {
		return err
	}
	services.codegenValidator = services.pluginMutationService
	services.pluginRouteService = services.pluginMutationService
	return nil
}

func initializeWorkspaceLSPServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	services.lspDiagnostics = projectstate.NewLSPDiagnosticsRegistry(
		projectstate.LSPDiagnosticsRegistryOptions{
			Logger: logger,
			OnChange: func(payload projectstate.LSPDiagnosticsPayload) {
				logger.Debug(
					"broadcast lsp diagnostics",
					slog.String("trace_event", "broadcast_lsp_diagnostics"),
					slog.String("project_id", strings.TrimSpace(payload.ProjectID)),
					slog.Int("code_section_count", len(payload.CodeSections)),
					slog.Int("generated_error_sections", len(payload.GenCode.Errors)),
					slog.Int("unmapped_generated_diagnostic_count", len(payload.UnmappedGenCode)),
				)
				_, _ = websocketHub.BroadcastJSON(
					context.Background(),
					realtime.NewLSPDiagnosticsMessage(payload),
					realtime.Selection{Type: realtime.ConnectionTypeFrontend},
				)
			},
		},
	)
	lspRouter, err := lsp.NewRouter(lsp.RouterOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		Environ:       os.Environ,
	})
	if err != nil {
		return err
	}
	services.lspRouter = lspRouter
	services.projectLSPSyncer, err = lsp.NewProjectSynchronizer(
		lsp.ProjectSynchronizerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			Service:        services.lspRouter,
			Diagnostics:    services.lspDiagnostics,
			WatchCodeProviderPluginID: func() (string, bool) {
				if services.watchCodeCapabilities == nil {
					return "", false
				}
				return services.watchCodeCapabilities.ActiveProviderPluginID()
			},
			Logger: logger,
		},
	)
	if err != nil {
		return err
	}
	services.lspCompletion, err = lspcompletion.NewService(
		lspcompletion.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			LSPService:     services.lspRouter,
		},
	)
	if err != nil {
		return err
	}
	services.lspSignature, err = lspsignature.NewService(lspsignature.ServiceOptions{
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
		LSPService:     services.lspRouter,
	})
	return err
}

func openWorkspaceProjectServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	watchRefs *projectWatchRefs,
	services *projectServices,
) error {
	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(cfg.Paths.RuntimeRoot)
	if err != nil {
		return err
	}
	services.projectStates, err = projectstate.OpenRegistryWithOptions(
		context.Background(),
		cfg.Paths.SettaFilesRoot,
		projectstate.StoreOptions{},
		projectstate.RegistryOptions{
			MainRuntime: projectstate.RuntimeOptions{
				PasswordSecrets:                passwordSecrets,
				PythonCodegenSectionReconciler: services.pythonMaterializer,
				WatchCodeProviderPluginID: func() (string, bool) {
					if services.watchCodeCapabilities == nil {
						return "", false
					}
					return services.watchCodeCapabilities.ActiveProviderPluginID()
				},
				WatchCodeIgnoredRoots: []string{
					cfg.Paths.SettaFilesRoot,
					cfg.Paths.RuntimeRoot,
				},
				BeforeSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					return handleProjectMainRuntimeBeforeSave(cfg, services, snapshot)
				},
				PersistedTransform: func(document projectstate.Document) (projectstate.Document, error) {
					if err := document.ClearJSONSourceValuesForPersistence(); err != nil {
						return document, err
					}
					return document, nil
				},
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					return handleProjectMainRuntimeAfterSave(cfg, logger, websocketHub, watchRefs, services, ctx, snapshot)
				},
			},
			SettingsRuntime: projectstate.RuntimeOptions{
				PasswordSecrets: passwordSecrets,
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					return handleProjectSettingsRuntimeAfterSave(services, websocketHub, ctx, snapshot)
				},
			},
		},
	)
	if err != nil {
		return err
	}
	services.projectRuntime = services.projectStates.Main()
	if _, err := services.projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.LoadAllJSONSourceVariantsFromDisk(cfg.Paths.WorkspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	}); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	settingsStateStore, err := settingsstate.NewStore(
		filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
		settingsstate.StoreOptions{
			SettingsProjectPath: services.projectStates.Paths().Settings,
		},
	)
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.settingsStateRuntime, err = settingsstate.OpenRuntime(context.Background(), settingsStateStore)
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	if err := bootstrapWorkspaceDefaultsInstallProfile(
		context.Background(),
		cfg.Paths.RuntimeRoot,
		services.settingsStateRuntime,
		services.pluginMutationService,
	); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	if err := settingsstate.EnsureProjectRuntimeBootstrapped(
		context.Background(),
		services.settingsStateRuntime,
		services.projectStates.Settings(),
	); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.plannerFilesRoot = cfg.Paths.SettaFilesRoot
	services.artifactsRoot = filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts")
	configureWorkspaceProjectAutoRefetchHandlers(logger, websocketHub, services)
	services.shareSessions = services.deploymentRuntime
	return nil
}

func handleProjectMainRuntimeBeforeSave(
	cfg config.Config,
	services *projectServices,
	snapshot projectstate.Snapshot,
) error {
	if err := projectstate.SaveJSONSourceFiles(snapshot.Document, cfg.Paths.WorkspaceRoot); err != nil {
		return err
	}
	settingsDocument := settingsstate.Document(nil)
	if services.settingsStateRuntime != nil {
		settingsDocument = services.settingsStateRuntime.Snapshot().Document
	}
	autoBackupPolicy, err := settingsstate.AutoBackupPolicyForDocument(settingsDocument)
	if err != nil {
		return err
	}
	_, _, err = projectbackup.MaybeCreateBackup(
		projectbackup.ProjectPath(cfg.Paths.SettaFilesRoot),
		projectbackup.BackupDir(cfg.Paths.SettaFilesRoot),
		projectbackup.AutoBackupOptions{
			Enabled:          autoBackupPolicy.Enabled,
			FrequencySeconds: autoBackupPolicy.FrequencySeconds,
			KeepLastN:        autoBackupPolicy.KeepLastN,
		},
	)
	return err
}

func handleProjectMainRuntimeAfterSave(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	watchRefs *projectWatchRefs,
	services *projectServices,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	if err := syncProjectAfterSaveInputs(cfg, watchRefs, services, snapshot); err != nil {
		return err
	}
	if err := materializeProjectAfterSave(logger, services, ctx, snapshot); err != nil {
		return err
	}
	return broadcastProjectValidationErrors(websocketHub, ctx, snapshot)
}

func syncProjectAfterSaveInputs(
	cfg config.Config,
	watchRefs *projectWatchRefs,
	services *projectServices,
	snapshot projectstate.Snapshot,
) error {
	if err := syncWatchCodeServiceConfigs(services, snapshot.Document); err != nil {
		return err
	}
	if err := syncJSONSourceWatchInputs(watchRefs.jsonSourceWatchService, snapshot.Document, cfg.Paths.WorkspaceRoot); err != nil {
		return err
	}
	if err := syncArtifactWatchInputs(watchRefs.artifactWatchService, snapshot.Document, cfg.Paths.SettaFilesRoot); err != nil {
		return err
	}
	if services.watchCodeWarnings != nil {
		services.watchCodeWarnings.ReconcileDocument(snapshot.Document)
	}
	if services.boundCodeService != nil {
		inputs, err := projectstate.PythonBoundCodeFileInputs(snapshot.Document, cfg.Paths.WorkspaceRoot)
		if err != nil {
			return err
		}
		if err := services.boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
			return err
		}
	}
	return nil
}

func materializeProjectAfterSave(
	logger *slog.Logger,
	services *projectServices,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	if err := services.pythonMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
		return err
	}
	if services.pluginMaterializer != nil {
		if err := services.pluginMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
			return err
		}
	}
	if err := services.projectLSPSyncer.MaterializeDocument(ctx, snapshot.Document); err != nil {
		logger.Warn("project lsp sync failed after save", "error", err)
	}
	if err := services.lspDiagnostics.PruneDocument(snapshot.Document); err != nil {
		return err
	}
	return nil
}

func broadcastProjectValidationErrors(
	websocketHub *realtime.WebsocketHub,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	validationErrors, err := projectstate.CollectAllNameValidationErrors(snapshot.Document)
	if err != nil {
		return err
	}
	for _, validationError := range validationErrors {
		if _, err := websocketHub.BroadcastJSON(
			ctx,
			realtime.NewNameValidationErrorsMessage(validationError),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
	}
	return nil
}

func handleProjectSettingsRuntimeAfterSave(
	services *projectServices,
	websocketHub *realtime.WebsocketHub,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	if services.settingsStateRuntime == nil {
		return errors.New("settings state runtime is not configured")
	}

	currentSettings := services.settingsStateRuntime.Snapshot().Document
	nextSettings, err := settingsstate.ApplySettingsProjectDocument(currentSettings, snapshot.Document)
	if err != nil {
		return err
	}
	if reflect.DeepEqual(currentSettings, nextSettings) {
		return nil
	}

	settingsSnapshot, err := services.settingsStateRuntime.ReplaceAndSave(ctx, nextSettings)
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
}

func configureWorkspaceProjectAutoRefetchHandlers(
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) {
	services.projectLSPSyncer.SetCallableAutoRefetchHandlers(
		func(ctx context.Context, projectID string, sectionIDs []string) {
			if err := refetchCallableParamsAndBroadcast(
				ctx,
				services.projectStates.Main(),
				websocketHub,
				projectID,
				sectionIDs,
				services.lspSignature,
			); err != nil {
				logger.Error("lsp callable auto-refetch after symbol resolution failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
			}
		},
		func(ctx context.Context, projectID string, sectionIDs []string) {
			enabled, err := settingsstate.AutoRefetchCallableParamsOnLSPMismatchEnabled(services.settingsStateRuntime.Snapshot().Document)
			if err != nil {
				logger.Error("lsp callable mismatch refetch policy lookup failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
				return
			}
			if !enabled {
				return
			}
			if err := refetchCallableParamsAndBroadcast(
				ctx,
				services.projectStates.Main(),
				websocketHub,
				projectID,
				sectionIDs,
				services.lspSignature,
			); err != nil {
				logger.Error("lsp callable auto-refetch after mismatch failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
			}
		},
	)
}

func initializeIDEProjectEditingServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	if services.watchCodeWarnings == nil {
		services.watchCodeWarnings = newWatchCodeWarningTracker(services.watchCodeCapabilities.ActiveProviderPluginID)
	}
	if err := reconcileIDEWatchCodeService(context.Background(), cfg, logger, websocketHub, services); err != nil {
		return err
	}
	if err := initializeIDECodeMutationServices(cfg, logger, websocketHub, services); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	return nil
}

func reconcileIDEWatchCodeService(
	ctx context.Context,
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	if services == nil || services.watchCodeCapabilities == nil {
		return nil
	}
	if services.watchCodeServiceRef == nil {
		services.watchCodeServiceRef = newWatchCodeServiceRef()
	}
	providerPluginID, providerActive := services.watchCodeCapabilities.ActiveProviderPluginID()
	if !providerActive {
		return services.watchCodeServiceRef.Close()
	}
	currentService := services.watchCodeServiceRef.Current()
	if currentService == nil || services.watchCodeServiceRef.CurrentProviderID() != providerPluginID {
		watchCodeService, err := newIDEWatchCodeService(cfg, logger, websocketHub, services)
		if err != nil {
			return err
		}
		if err := services.watchCodeServiceRef.Replace(providerPluginID, watchCodeService); err != nil {
			_ = watchCodeService.Close()
			return err
		}
	}
	if services.projectStates == nil {
		return nil
	}
	return syncWatchCodeServiceConfigs(services, services.projectStates.Main().Snapshot().Document)
}

func newIDEWatchCodeService(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) (*watchcode.Service, error) {
	watchCodeService, err := watchcode.NewService(watchcode.ServiceOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		OnFileUpdate: func(ctx context.Context, update watchcode.FileUpdate) error {
			providerPluginID, ok := services.watchCodeCapabilities.ActiveProviderPluginID()
			if !ok {
				return nil
			}
			signatureObserver := newWatchCodeSignatureObserver(services.lspSignature)
			snapshot, didUpdate, err := services.projectStates.Main().ApplyWatchCodeFileUpdate(
				ctx,
				providerPluginID,
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
			for _, message := range services.watchCodeWarnings.ConsumeNotifications(snapshot.Document, update.ConfigID, signatureObserver.Attempts()) {
				if _, err := websocketHub.BroadcastJSON(ctx, message, realtime.Selection{Type: realtime.ConnectionTypeFrontend}); err != nil {
					return err
				}
			}
			if didUpdate {
				return broadcastFrontendProjectStateUpdate(
					ctx,
					services.projectStates.Main(),
					websocketHub,
					snapshot,
					update.ConfigID,
				)
			}
			return nil
		},
		OnFileDelete: func(ctx context.Context, request watchcode.DeleteRequest) error {
			providerPluginID, ok := services.watchCodeCapabilities.ActiveProviderPluginID()
			if !ok {
				return nil
			}
			snapshot, didUpdate, err := services.projectStates.Main().ApplyWatchCodeFileDelete(
				ctx,
				providerPluginID,
				request.ConfigID,
				request.Path,
				cfg.Paths.WorkspaceRoot,
			)
			if err != nil {
				return err
			}
			services.watchCodeWarnings.ReconcileDocument(snapshot.Document)
			if didUpdate {
				return broadcastFrontendProjectStateUpdate(
					ctx,
					services.projectStates.Main(),
					websocketHub,
					snapshot,
					request.ConfigID,
				)
			}
			return nil
		},
		OnError: func(err error) {
			logger.Error("watch code runtime failed", "error", err)
		},
	})
	if err != nil {
		return nil, err
	}
	return watchCodeService, nil
}

func syncWatchCodeServiceConfigs(services *projectServices, document projectstate.Document) error {
	if services == nil || services.watchCodeServiceRef == nil {
		return nil
	}
	configs := map[string]watchcode.ConfigInputs{}
	if services.watchCodeCapabilities != nil {
		if providerPluginID, ok := services.watchCodeCapabilities.ActiveProviderPluginID(); ok {
			var err error
			configs, err = projectstate.WatchCodeConfigInputs(document, providerPluginID)
			if err != nil {
				return err
			}
		}
	}
	return services.watchCodeServiceRef.SyncConfigs(configs)
}

func initializeIDECodeMutationServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	codeUpdates, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:          services.projectRuntime,
		LSPSync:               services.projectLSPSyncer,
		CallableSignatures:    services.lspSignature,
		WorkspaceRoot:         cfg.Paths.WorkspaceRoot,
		WatchCodeCapabilities: services.watchCodeCapabilities,
		WatchCodeWarnings:     services.watchCodeWarnings,
		WebsocketHub:          websocketHub,
		Logger:                logger,
	})
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.codeUpdates = codeUpdates
	services.renameRefactors, err = newRenameRefactorService(renameRefactorServiceOptions{
		ProjectState: services.projectRuntime,
		Settings:     services.settingsStateRuntime,
		WebsocketHub: websocketHub,
	})
	if err != nil {
		return err
	}
	services.boundCodeService, err = boundcode.NewService(boundcode.ServiceOptions{
		OnFileUpdate: func(ctx context.Context, update boundcode.FileUpdate) error {
			return services.codeUpdates.ReloadBoundCodeFile(ctx, update.Raw, update.Bindings)
		},
		OnError: func(err error) {
			logger.Error("bound code file runtime failed", "error", err)
		},
	})
	if err != nil {
		return err
	}
	inputs, err := projectstate.PythonBoundCodeFileInputs(
		services.projectStates.Main().Snapshot().Document,
		cfg.Paths.WorkspaceRoot,
	)
	if err != nil {
		return err
	}
	if err := services.boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
		return err
	}
	return nil
}
