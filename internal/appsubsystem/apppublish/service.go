package apppublish

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/deployments"
	"setta/internal/plugins"
)

type service struct {
	share           *deployments.SharePublisher
	contentService  deploymentContentService
	pluginID        string
	packageProvider deployments.AppProviderPackageFunc
	storage         appdefinition.DocumentStorage
}

type preparedPublish struct {
	preparedProject   deployments.PreparedProjectPublish
	appSpec           any
	targetAppSpecPath string
	policy            deployments.Policy
}

func NewService(
	options deployments.AppPublisherOptions,
	appDefinitionService appdefinition.Runtime,
	pluginID string,
) (deployments.AppPublishService, error) {
	sharePublisher, err := deployments.NewSharePublisher(deployments.SharePublisherOptions{
		Catalog:        options.Catalog,
		SettaFilesRoot: options.SettaFilesRoot,
		WorkspaceRoot:  options.WorkspaceRoot,
		Now:            options.Now,
	})
	if err != nil {
		return nil, err
	}
	trimmedPluginID := strings.TrimSpace(pluginID)
	appSpecStore, err := appspec.ForPlugin(trimmedPluginID)
	if err != nil {
		return nil, err
	}
	storage, err := appdefinition.StorageForPlugin(trimmedPluginID)
	if err != nil {
		return nil, err
	}
	return &service{
		share: sharePublisher,
		contentService: deploymentContentService{
			appDefinitionService: appDefinitionService,
			appSpecStore:         appSpecStore,
		},
		pluginID:        trimmedPluginID,
		packageProvider: appProviderPackageFunc(options),
		storage:         storage,
	}, nil
}

func (p *service) Publish(
	ctx context.Context,
	request deployments.AppPublishRequest,
) (deployments.AppPublishResult, error) {
	if p == nil || p.share == nil {
		return deployments.AppPublishResult{}, deployments.ErrAppPublisherRequired
	}
	if request.ProjectState == nil {
		return deployments.AppPublishResult{}, deployments.ErrAppPublishProjectStateRequired
	}

	allocation, err := p.share.Allocate(request.DeploymentName)
	if err != nil {
		return deployments.AppPublishResult{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(allocation.DeploymentRoot)
		}
	}()

	prepared, err := p.prepare(ctx, request, allocation.DeploymentRoot)
	if err != nil {
		return deployments.AppPublishResult{}, err
	}
	manifest, err := p.newManifest(allocation, prepared.preparedProject)
	if err != nil {
		return deployments.AppPublishResult{}, err
	}
	if err := p.writeOutput(ctx, allocation.DeploymentRoot, prepared, manifest); err != nil {
		return deployments.AppPublishResult{}, err
	}

	success = true
	return deployments.AppPublishResult{
		Metadata: deployments.MetadataFromAllocation(
			allocation,
			deployments.TypeApp,
			prepared.preparedProject.Project,
			manifest.CreatedAt,
		),
		Manifest: manifest,
		Policy:   prepared.policy,
		Snapshot: prepared.preparedProject.PublishedDocument,
	}, nil
}

func (p *service) prepare(
	ctx context.Context,
	request deployments.AppPublishRequest,
	deploymentRoot string,
) (preparedPublish, error) {
	preparedProject, err := p.share.PrepareProjectPublish(
		deployments.ProjectPublishPreparationOptions{
			ProjectState:       request.ProjectState,
			ProjectID:          request.ProjectID,
			ListenerEntrypoint: request.ListenerEntrypoint,
			ListenerEnabled:    request.ListenerEnabled,
		},
		deploymentRoot,
	)
	if err != nil {
		return preparedPublish{}, err
	}

	appDefinition, appSpec, targetAppSpecPath, err := p.contentService.preparePublishedAppDefinition(
		ctx,
		p.share.SettaFilesRoot(),
		p.storage.StoredDocumentAppDefinitionRaw(preparedProject.PublishedDocument),
	)
	if err != nil {
		return preparedPublish{}, err
	}
	preparedProject.PublishedDocument = p.storage.WithStoredDocumentAppDefinition(
		preparedProject.PublishedDocument,
		appDefinition,
	)

	policy, err := applyAppPolicyOverrides(request.PolicyOverrides)
	if err != nil {
		return preparedPublish{}, err
	}

	return preparedPublish{
		preparedProject:   preparedProject,
		appSpec:           appSpec,
		targetAppSpecPath: targetAppSpecPath,
		policy:            policy,
	}, nil
}

func (p *service) newManifest(
	allocation deployments.Allocation,
	prepared deployments.PreparedProjectPublish,
) (deployments.Manifest, error) {
	return deployments.Manifest{
		Version:           1,
		DeploymentName:    allocation.DeploymentName,
		DeploymentType:    deployments.TypeApp,
		DefaultProjectID:  prepared.Project.ID,
		DeploymentVersion: allocation.DeploymentVersion,
		CreatedAt:         p.share.Now(),
		Listener:          prepared.ListenerConfig,
	}.Normalized()
}

func (p *service) writeOutput(
	ctx context.Context,
	deploymentRoot string,
	prepared preparedPublish,
	manifest deployments.Manifest,
) error {
	if err := p.share.WriteProjectPublishOutput(
		ctx,
		deploymentRoot,
		prepared.preparedProject,
		manifest,
		prepared.policy,
	); err != nil {
		return err
	}
	if err := p.contentService.writePublishedAppSpec(
		deploymentRoot,
		prepared.targetAppSpecPath,
		prepared.appSpec,
	); err != nil {
		return fmt.Errorf("write deployment app spec: %w", err)
	}
	if err := p.packageProviderPlugin(deploymentRoot); err != nil {
		return err
	}
	return nil
}

func (p *service) packageProviderPlugin(deploymentRoot string) error {
	if p == nil || strings.TrimSpace(p.pluginID) == "" || p.packageProvider == nil {
		return deployments.ErrAppPublishProviderSourceRequired
	}
	targetRoot := filepath.Join(deploymentRoot, ".setta_plugins", p.pluginID)
	pluginState, err := p.packageProvider(targetRoot)
	if err != nil {
		return fmt.Errorf("package app deployment provider %q: %w", p.pluginID, err)
	}
	if len(pluginState.EnabledPluginIDs) == 0 {
		pluginState.EnabledPluginIDs = []string{p.pluginID}
	}
	if pluginState.PluginConfigByID == nil {
		pluginState.PluginConfigByID = map[string]any{}
	}
	encodedState, err := json.MarshalIndent(pluginState, "", "  ")
	if err != nil {
		return fmt.Errorf("encode packaged plugin state: %w", err)
	}
	encodedState = append(encodedState, '\n')
	if err := os.WriteFile(
		filepath.Join(deploymentRoot, "plugins_state.json"),
		encodedState,
		0o644,
	); err != nil {
		return fmt.Errorf("write packaged plugin state: %w", err)
	}
	return nil
}

func appProviderPackageFunc(options deployments.AppPublisherOptions) deployments.AppProviderPackageFunc {
	if options.PackageProviderPlugin != nil {
		return options.PackageProviderPlugin
	}

	sourcePath := strings.TrimSpace(options.PluginSourcePath)
	enabledPluginIDs := append([]string(nil), options.EnabledPluginIDs...)
	pluginConfigByID := options.PluginConfigByID
	return func(targetRoot string) (deployments.AppProviderPackageState, error) {
		if sourcePath == "" {
			return deployments.AppProviderPackageState{}, deployments.ErrAppPublishProviderSourceRequired
		}
		if err := plugins.CopyDirectoryTree(sourcePath, targetRoot); err != nil {
			return deployments.AppProviderPackageState{}, err
		}
		return deployments.AppProviderPackageState{
			EnabledPluginIDs: append([]string(nil), enabledPluginIDs...),
			PluginConfigByID: pluginConfigByID,
		}, nil
	}
}

func applyAppPolicyOverrides(
	overrides *deployments.AppPolicyOverrides,
) (deployments.Policy, error) {
	policy := deployments.DefaultAppPolicy()
	if overrides == nil {
		return policy.Normalized()
	}
	if overrides.AllowParamChanges != nil {
		policy.AllowParamChanges = *overrides.AllowParamChanges
	}
	if overrides.AllowVariantChanges != nil {
		policy.AllowVariantChanges = *overrides.AllowVariantChanges
	}
	if overrides.AllowLayoutChanges != nil {
		policy.AllowLayoutChanges = *overrides.AllowLayoutChanges
	}
	if overrides.AllowRun != nil {
		policy.AllowRun = *overrides.AllowRun
	}
	if overrides.AllowLLM != nil {
		policy.AllowLLM = *overrides.AllowLLM
	}
	if overrides.AllowExternalLinks != nil {
		policy.AllowExternalLinks = *overrides.AllowExternalLinks
	}
	if overrides.AllowFileDownloads != nil {
		policy.AllowFileDownloads = *overrides.AllowFileDownloads
	}
	if overrides.AllowMultipleRuns != nil {
		policy.AllowMultipleRuns = *overrides.AllowMultipleRuns
	}
	if overrides.RunSnapshotMode != nil {
		policy.RunSnapshotMode = *overrides.RunSnapshotMode
	}
	return policy.Normalized()
}
