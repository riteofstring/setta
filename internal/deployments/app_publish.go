package deployments

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/appspec"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

var (
	ErrAppPublisherRequired           = errors.New("app deployment publisher is required")
	ErrAppPublishProjectStateRequired = errors.New("app deployment publish project runtime is required")
	ErrAppPublishAppDefinitionMissing = errors.New("app definition is required to publish an app deployment")
	ErrAppPublishAppSpecPathRequired  = errors.New("app spec path is required to publish an app deployment")
	ErrAppPublishAppSpecNotFound      = errors.New("app spec was not found for app deployment publish")
	ErrAppPublishAppSpecInvalid       = errors.New("app spec is invalid for app deployment publish")
)

type AppPublisherOptions = SharePublisherOptions

type AppPolicyOverrides = SharePolicyOverrides

type AppPublishRequest struct {
	ProjectState       *projectstate.Runtime
	ProjectID          string
	DeploymentName     string
	PolicyOverrides    *AppPolicyOverrides
	ListenerEntrypoint string
	ListenerEnabled    bool
}

type AppPublishResult struct {
	Metadata Metadata
	Manifest Manifest
	Policy   Policy
	Snapshot projectstate.Document
}

type AppPublishValidationError struct {
	Issues []appspec.AppValidationIssue
}

func (e *AppPublishValidationError) Error() string {
	if e == nil || len(e.Issues) == 0 {
		return ErrAppPublishAppSpecInvalid.Error()
	}

	limit := len(e.Issues)
	if limit > 3 {
		limit = 3
	}
	messages := make([]string, 0, limit)
	for _, issue := range e.Issues[:limit] {
		message := strings.TrimSpace(issue.Message)
		if message == "" {
			continue
		}
		messages = append(messages, message)
	}
	if len(messages) == 0 {
		return ErrAppPublishAppSpecInvalid.Error()
	}
	if len(e.Issues) > limit {
		return ErrAppPublishAppSpecInvalid.Error() + ": " + strings.Join(messages, "; ") + fmt.Sprintf(" (+%d more)", len(e.Issues)-limit)
	}
	return ErrAppPublishAppSpecInvalid.Error() + ": " + strings.Join(messages, "; ")
}

func (e *AppPublishValidationError) Unwrap() error {
	return ErrAppPublishAppSpecInvalid
}

type AppPublisher struct {
	share *SharePublisher
}

type preparedAppPublish struct {
	project                projectstate.Project
	appSpec                any
	targetAppSpecPath      string
	policy                 Policy
	listenerConfig         *ListenerConfig
	publishedDocument      projectstate.Document
	structuredDataPayloads map[string]map[string]any
}

func NewAppPublisher(options AppPublisherOptions) (*AppPublisher, error) {
	sharePublisher, err := NewSharePublisher(options)
	if err != nil {
		return nil, err
	}
	return &AppPublisher{share: sharePublisher}, nil
}

func (p *AppPublisher) Publish(ctx context.Context, request AppPublishRequest) (AppPublishResult, error) {
	if p == nil || p.share == nil {
		return AppPublishResult{}, ErrAppPublisherRequired
	}
	if request.ProjectState == nil {
		return AppPublishResult{}, ErrAppPublishProjectStateRequired
	}

	allocation, err := p.share.catalog.Allocate(request.DeploymentName)
	if err != nil {
		return AppPublishResult{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(allocation.DeploymentRoot)
		}
	}()

	prepared, err := p.prepareAppPublish(ctx, request, allocation.DeploymentRoot)
	if err != nil {
		return AppPublishResult{}, err
	}
	manifest, err := p.newAppManifest(allocation, prepared.project, prepared.listenerConfig)
	if err != nil {
		return AppPublishResult{}, err
	}
	if err := p.writeAppPublishOutput(ctx, allocation.DeploymentRoot, prepared, manifest); err != nil {
		return AppPublishResult{}, err
	}

	success = true
	return AppPublishResult{
		Metadata: p.buildAppPublishMetadata(allocation, prepared.project, manifest.CreatedAt),
		Manifest: manifest,
		Policy:   prepared.policy,
		Snapshot: prepared.publishedDocument,
	}, nil
}

func (p *AppPublisher) prepareAppPublish(
	ctx context.Context,
	request AppPublishRequest,
	deploymentRoot string,
) (preparedAppPublish, error) {
	snapshot := request.ProjectState.Snapshot()
	document := snapshot.Document.Clone()
	project, err := document.ProjectByID(request.ProjectID)
	if err != nil {
		return preparedAppPublish{}, err
	}
	document.DefaultProjectID = project.ID

	appDefinition, appSpec, targetAppSpecPath, err := p.preparePublishedAppDefinition(ctx, request.ProjectState, document.AppDefinition)
	if err != nil {
		return preparedAppPublish{}, err
	}
	document.AppDefinition = appDefinition

	policy, err := applyAppPolicyOverrides(request.PolicyOverrides)
	if err != nil {
		return preparedAppPublish{}, err
	}
	listenerConfig, err := p.share.copyListenerEntrypoint(strings.TrimSpace(request.ListenerEntrypoint), deploymentRoot, request.ListenerEnabled)
	if err != nil {
		return preparedAppPublish{}, err
	}

	publishedDocument := document.Clone()
	structuredDataPayloads, err := p.share.rewriteDocumentForDeployment(&publishedDocument, deploymentRoot)
	if err != nil {
		return preparedAppPublish{}, err
	}
	if err := stripPasswordValues(&publishedDocument); err != nil {
		return preparedAppPublish{}, err
	}

	return preparedAppPublish{
		project:                project,
		appSpec:                appSpec,
		targetAppSpecPath:      targetAppSpecPath,
		policy:                 policy,
		listenerConfig:         listenerConfig,
		publishedDocument:      publishedDocument,
		structuredDataPayloads: structuredDataPayloads,
	}, nil
}

func (p *AppPublisher) newAppManifest(
	allocation Allocation,
	project projectstate.Project,
	listenerConfig *ListenerConfig,
) (Manifest, error) {
	return Manifest{
		Version:           1,
		DeploymentName:    allocation.DeploymentName,
		DeploymentType:    TypeApp,
		DefaultProjectID:  project.ID,
		DeploymentVersion: allocation.DeploymentVersion,
		CreatedAt:         p.share.now().UTC(),
		Listener:          listenerConfig,
	}.Normalized()
}

func (p *AppPublisher) writeAppPublishOutput(
	ctx context.Context,
	deploymentRoot string,
	prepared preparedAppPublish,
	manifest Manifest,
) error {
	store, err := projectstate.NewStore(filepath.Join(deploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		return fmt.Errorf("create deployment project store: %w", err)
	}
	if err := store.Save(ctx, prepared.publishedDocument); err != nil {
		return fmt.Errorf("save deployment project: %w", err)
	}
	if err := appspec.Write(deploymentRoot, prepared.targetAppSpecPath, prepared.appSpec); err != nil {
		return fmt.Errorf("write deployment app spec: %w", err)
	}
	for relativePath, payload := range prepared.structuredDataPayloads {
		targetPath, err := statefs.ResolveWithinRoot(deploymentRoot, filepath.FromSlash(relativePath), "deployment structured data")
		if err != nil {
			return err
		}
		if err := writeStructuredDataPayload(targetPath, payload); err != nil {
			return err
		}
	}
	if err := writeJSONFile(filepath.Join(deploymentRoot, "manifest.json"), manifest); err != nil {
		return fmt.Errorf("write deployment manifest: %w", err)
	}
	if err := writeJSONFile(filepath.Join(deploymentRoot, "policy.json"), prepared.policy); err != nil {
		return fmt.Errorf("write deployment policy: %w", err)
	}
	return nil
}

func (p *AppPublisher) buildAppPublishMetadata(
	allocation Allocation,
	project projectstate.Project,
	createdAt time.Time,
) Metadata {
	return Metadata{
		DeploymentName:      allocation.DeploymentName,
		DeploymentVersion:   allocation.DeploymentVersion,
		DeploymentType:      TypeApp,
		DefaultProjectID:    project.ID,
		DefaultProjectName:  project.Name,
		CreatedAt:           createdAt,
		DeploymentRoot:      allocation.DeploymentRoot,
		PolicyPath:          filepath.Join(allocation.DeploymentRoot, "policy.json"),
		DeploymentVersionNo: mustParseDeploymentVersion(allocation.DeploymentVersion),
	}
}

func (p *AppPublisher) preparePublishedAppDefinition(
	ctx context.Context,
	runtime *projectstate.Runtime,
	appDefinition *projectstate.AppDefinition,
) (*projectstate.AppDefinition, any, string, error) {
	if appDefinition == nil {
		return nil, nil, "", ErrAppPublishAppDefinitionMissing
	}

	current := appDefinition.Clone()
	if strings.TrimSpace(current.AppSpecPath) == "" {
		return nil, nil, "", ErrAppPublishAppSpecPathRequired
	}

	projectRoot := p.share.settaFilesRoot
	targetAppSpecPath, err := appspec.NormalizePath(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, nil, "", fmt.Errorf("%w: %v", ErrAppPublishAppSpecInvalid, err)
	}
	appSpec, err := appspec.Read(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, nil, "", fmt.Errorf("%w: %v", ErrAppPublishAppSpecInvalid, err)
	}
	if appSpec == nil {
		return nil, nil, "", ErrAppPublishAppSpecNotFound
	}

	validationResult, err := runtime.ValidateAppDefinition(ctx, projectstate.ValidateAppDefinitionInput{
		AppSpec: appSpec,
	})
	if err != nil {
		return nil, nil, "", err
	}
	if len(validationResult.Errors) != 0 {
		return nil, nil, "", &AppPublishValidationError{
			Issues: append([]appspec.AppValidationIssue(nil), validationResult.Errors...),
		}
	}

	current.AppSpecPath = targetAppSpecPath
	return &current, appSpec, targetAppSpecPath, nil
}

func applyAppPolicyOverrides(overrides *AppPolicyOverrides) (Policy, error) {
	policy := DefaultAppPolicy()
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
