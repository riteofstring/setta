package settajsonrenderappgenbackend

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/deployments"
	"setta/internal/plugins"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type appPublisher struct {
	share            *deployments.SharePublisher
	contentService   appDeploymentContentService
	pluginID         string
	pluginSourcePath string
	enabledPluginIDs []string
	pluginConfigByID map[string]any
	storage          appdefinition.DocumentStorage
}

type preparedAppPublish struct {
	preparedProject   deployments.PreparedProjectPublish
	appSpec           any
	targetAppSpecPath string
	policy            deployments.Policy
}

func NewAppPublishService(
	options deployments.AppPublisherOptions,
	service appdefinition.Runtime,
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
	return &appPublisher{
		share: sharePublisher,
		contentService: appDeploymentContentService{
			appDefinitionService: service,
			appSpecStore:         appspec.ForPlugin(pluginID),
		},
		pluginID:         strings.TrimSpace(pluginID),
		pluginSourcePath: strings.TrimSpace(options.PluginSourcePath),
		enabledPluginIDs: append([]string(nil), options.EnabledPluginIDs...),
		pluginConfigByID: options.PluginConfigByID,
		storage:          appdefinition.StorageForPlugin(pluginID),
	}, nil
}

func (p *appPublisher) Publish(
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

	prepared, err := p.prepareAppPublish(ctx, request, allocation.DeploymentRoot)
	if err != nil {
		return deployments.AppPublishResult{}, err
	}
	manifest, err := p.newAppManifest(allocation, prepared.preparedProject)
	if err != nil {
		return deployments.AppPublishResult{}, err
	}
	if err := p.writeAppPublishOutput(ctx, allocation.DeploymentRoot, prepared, manifest); err != nil {
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

func (p *appPublisher) prepareAppPublish(
	ctx context.Context,
	request deployments.AppPublishRequest,
	deploymentRoot string,
) (preparedAppPublish, error) {
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
		return preparedAppPublish{}, err
	}

	appDefinition, appSpec, targetAppSpecPath, err := p.contentService.PreparePublishedAppDefinition(
		ctx,
		p.share.SettaFilesRoot(),
		p.storage.StoredDocumentAppDefinitionRaw(preparedProject.PublishedDocument),
	)
	if err != nil {
		return preparedAppPublish{}, err
	}
	preparedProject.PublishedDocument = p.storage.WithStoredDocumentAppDefinition(
		preparedProject.PublishedDocument,
		appDefinition,
	)

	policy, err := applyAppPolicyOverrides(request.PolicyOverrides)
	if err != nil {
		return preparedAppPublish{}, err
	}

	return preparedAppPublish{
		preparedProject:   preparedProject,
		appSpec:           appSpec,
		targetAppSpecPath: targetAppSpecPath,
		policy:            policy,
	}, nil
}

func (p *appPublisher) newAppManifest(
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

func (p *appPublisher) writeAppPublishOutput(
	ctx context.Context,
	deploymentRoot string,
	prepared preparedAppPublish,
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
	if err := p.contentService.WritePublishedAppSpec(
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

func (p *appPublisher) packageProviderPlugin(deploymentRoot string) error {
	if p == nil || strings.TrimSpace(p.pluginID) == "" || strings.TrimSpace(p.pluginSourcePath) == "" {
		return deployments.ErrAppPublishProviderSourceRequired
	}
	targetRoot := filepath.Join(deploymentRoot, ".setta_plugins", p.pluginID)
	if err := plugins.CopyDirectoryTree(p.pluginSourcePath, targetRoot); err != nil {
		return fmt.Errorf("package app deployment provider %q: %w", p.pluginID, err)
	}
	pluginState := plugins.PluginsStateFile{
		EnabledPluginIDs: append([]string(nil), p.enabledPluginIDs...),
		PluginConfigByID: p.pluginConfigByID,
	}
	if len(pluginState.EnabledPluginIDs) == 0 {
		pluginState.EnabledPluginIDs = []string{p.pluginID}
	}
	if pluginState.PluginConfigByID == nil {
		pluginState.PluginConfigByID = map[string]any{}
	}
	pluginsStatePayload, err := json.MarshalIndent(pluginState, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal deployment plugins state: %w", err)
	}
	pluginsStatePayload = append(pluginsStatePayload, '\n')
	if err := os.WriteFile(
		filepath.Join(deploymentRoot, "plugins_state.json"),
		pluginsStatePayload,
		0o644,
	); err != nil {
		return fmt.Errorf("write deployment plugins state: %w", err)
	}
	return nil
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
