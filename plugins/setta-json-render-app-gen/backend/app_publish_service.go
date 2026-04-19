package settajsonrenderappgenbackend

import (
	"context"
	"fmt"
	"os"

	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
)

type appPublisher struct {
	share          *deployments.SharePublisher
	contentService appDeploymentContentService
}

type preparedAppPublish struct {
	preparedProject   deployments.PreparedProjectPublish
	appSpec           any
	targetAppSpecPath string
	policy            deployments.Policy
}

func NewAppPublishService(
	options deployments.AppPublisherOptions,
	service projectstate.AppDefinitionRuntime,
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
		share:          sharePublisher,
		contentService: appDeploymentContentService{appDefinitionService: service},
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
		appdefinition.StoredDocumentAppDefinitionRaw(preparedProject.PublishedDocument),
	)
	if err != nil {
		return preparedAppPublish{}, err
	}
	preparedProject.PublishedDocument = appdefinition.WithStoredDocumentAppDefinition(
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
