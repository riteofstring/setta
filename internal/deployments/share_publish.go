package deployments

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

var (
	ErrSharePublisherCatalogRequired        = errors.New("share deployment publisher catalog is required")
	ErrSharePublisherSettaFilesRootRequired = errors.New("share deployment publisher setta_files root is required")
	ErrSharePublisherWorkspaceRootRequired  = errors.New("share deployment publisher workspace root is required")
	ErrSharePublishProjectStateRequired     = errors.New("share deployment publish project runtime is required")
	ErrStructuredDataPathInvalid            = errors.New("structured data path is invalid")
	ErrStructuredDataExtensionUnsupported   = errors.New("structured data extension is unsupported")
	ErrStructuredDataRootObjectRequired     = errors.New("structured data payload must be a JSON object")
)

const publishFileMode = 0o644

type SharePolicyOverrides struct {
	AllowParamChanges   *bool            `json:"allowParamChanges,omitempty"`
	AllowVariantChanges *bool            `json:"allowVariantChanges,omitempty"`
	AllowLayoutChanges  *bool            `json:"allowLayoutChanges,omitempty"`
	AllowRun            *bool            `json:"allowRun,omitempty"`
	AllowLLM            *bool            `json:"allowLLM,omitempty"`
	AllowExternalLinks  *bool            `json:"allowExternalLinks,omitempty"`
	AllowFileDownloads  *bool            `json:"allowFileDownloads,omitempty"`
	AllowMultipleRuns   *bool            `json:"allowMultipleRuns,omitempty"`
	RunSnapshotMode     *RunSnapshotMode `json:"runSnapshotMode,omitempty"`
}

type SharePublishRequest struct {
	ProjectState       *projectstate.Runtime
	ProjectID          string
	DeploymentName     string
	PolicyOverrides    *SharePolicyOverrides
	ListenerEntrypoint string
	ListenerEnabled    bool
}

type SharePublishResult struct {
	Metadata Metadata
	Manifest Manifest
	Policy   Policy
	Snapshot projectstate.Document
}

type ProjectPublishPreparationOptions struct {
	ProjectState       *projectstate.Runtime
	ProjectID          string
	ListenerEntrypoint string
	ListenerEnabled    bool
}

type ProjectPublishDocumentPreparationOptions struct {
	Document           projectstate.Document
	ProjectID          string
	ListenerEntrypoint string
	ListenerEnabled    bool
}

type PreparedProjectPublish struct {
	Project                projectstate.Project
	ListenerConfig         *ListenerConfig
	PublishedDocument      projectstate.Document
	StructuredDataPayloads map[string]map[string]any
}

type SharePublisherOptions struct {
	Catalog        *Catalog
	SettaFilesRoot string
	WorkspaceRoot  string
	Now            func() time.Time
}

type SharePublisher struct {
	catalog         *Catalog
	settaFilesRoot  string
	workspaceRoot   string
	artifactsRoot   string
	codeRoot        string
	jsonSourcesRoot string
	now             func() time.Time
}

type publishPathMaps struct {
	artifact map[string]string
	code     map[string]string
	json     map[string]string
}

func NewSharePublisher(options SharePublisherOptions) (*SharePublisher, error) {
	if options.Catalog == nil {
		return nil, ErrSharePublisherCatalogRequired
	}

	settaFilesRoot, err := statefs.NormalizePath(strings.TrimSpace(options.SettaFilesRoot), "")
	if err != nil {
		return nil, ErrSharePublisherSettaFilesRootRequired
	}
	workspaceRoot, err := statefs.NormalizePath(strings.TrimSpace(options.WorkspaceRoot), "")
	if err != nil {
		return nil, ErrSharePublisherWorkspaceRootRequired
	}

	now := options.Now
	if now == nil {
		now = time.Now
	}

	return &SharePublisher{
		catalog:         options.Catalog,
		settaFilesRoot:  settaFilesRoot,
		workspaceRoot:   workspaceRoot,
		artifactsRoot:   filepath.Join(settaFilesRoot, "artifacts"),
		codeRoot:        filepath.Join(settaFilesRoot, "code"),
		jsonSourcesRoot: filepath.Join(settaFilesRoot, "json_sources"),
		now:             now,
	}, nil
}

func (p *SharePublisher) Publish(ctx context.Context, request SharePublishRequest) (SharePublishResult, error) {
	if p == nil {
		return SharePublishResult{}, ErrSharePublisherCatalogRequired
	}
	if request.ProjectState == nil {
		return SharePublishResult{}, ErrSharePublishProjectStateRequired
	}

	allocation, err := p.Allocate(request.DeploymentName)
	if err != nil {
		return SharePublishResult{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(allocation.DeploymentRoot)
		}
	}()

	prepared, err := p.PrepareProjectPublish(ProjectPublishPreparationOptions{
		ProjectState:       request.ProjectState,
		ProjectID:          request.ProjectID,
		ListenerEntrypoint: request.ListenerEntrypoint,
		ListenerEnabled:    request.ListenerEnabled,
	}, allocation.DeploymentRoot)
	if err != nil {
		return SharePublishResult{}, err
	}
	policy, err := applySharePolicyOverrides(request.PolicyOverrides)
	if err != nil {
		return SharePublishResult{}, err
	}

	manifest, err := Manifest{
		Version:           1,
		DeploymentName:    allocation.DeploymentName,
		DeploymentType:    TypeShare,
		DefaultProjectID:  prepared.Project.ID,
		DeploymentVersion: allocation.DeploymentVersion,
		CreatedAt:         p.Now(),
		Listener:          prepared.ListenerConfig,
	}.Normalized()
	if err != nil {
		return SharePublishResult{}, err
	}
	if err := p.WriteProjectPublishOutput(ctx, allocation.DeploymentRoot, prepared, manifest, policy); err != nil {
		return SharePublishResult{}, err
	}

	success = true
	return SharePublishResult{
		Metadata: MetadataFromAllocation(
			allocation,
			TypeShare,
			prepared.Project,
			manifest.CreatedAt,
		),
		Manifest: manifest,
		Policy:   policy,
		Snapshot: prepared.PublishedDocument,
	}, nil
}

func (p *SharePublisher) Allocate(deploymentName string) (Allocation, error) {
	if p == nil || p.catalog == nil {
		return Allocation{}, ErrSharePublisherCatalogRequired
	}
	return p.catalog.Allocate(deploymentName)
}

func (p *SharePublisher) SettaFilesRoot() string {
	if p == nil {
		return ""
	}
	return p.settaFilesRoot
}

func (p *SharePublisher) Now() time.Time {
	if p == nil || p.now == nil {
		return time.Time{}
	}
	return p.now().UTC()
}

func MetadataFromAllocation(
	allocation Allocation,
	deploymentType Type,
	project projectstate.Project,
	createdAt time.Time,
) Metadata {
	return Metadata{
		DeploymentName:      allocation.DeploymentName,
		DeploymentVersion:   allocation.DeploymentVersion,
		DeploymentType:      deploymentType,
		DefaultProjectID:    project.ID,
		DefaultProjectName:  project.Name,
		CreatedAt:           createdAt,
		DeploymentRoot:      allocation.DeploymentRoot,
		PolicyPath:          filepath.Join(allocation.DeploymentRoot, "policy.json"),
		DeploymentVersionNo: mustParseDeploymentVersion(allocation.DeploymentVersion),
	}
}

func (p *SharePublisher) PrepareProjectPublish(
	options ProjectPublishPreparationOptions,
	deploymentRoot string,
) (PreparedProjectPublish, error) {
	if p == nil {
		return PreparedProjectPublish{}, ErrSharePublisherCatalogRequired
	}
	if options.ProjectState == nil {
		return PreparedProjectPublish{}, ErrSharePublishProjectStateRequired
	}

	snapshot := options.ProjectState.Snapshot()
	return p.PrepareProjectPublishDocument(ProjectPublishDocumentPreparationOptions{
		Document:           snapshot.Document,
		ProjectID:          options.ProjectID,
		ListenerEntrypoint: options.ListenerEntrypoint,
		ListenerEnabled:    options.ListenerEnabled,
	}, deploymentRoot)
}

func (p *SharePublisher) PrepareProjectPublishDocument(
	options ProjectPublishDocumentPreparationOptions,
	deploymentRoot string,
) (PreparedProjectPublish, error) {
	if p == nil {
		return PreparedProjectPublish{}, ErrSharePublisherCatalogRequired
	}

	document := options.Document.Clone()
	project, err := document.ProjectByID(options.ProjectID)
	if err != nil {
		return PreparedProjectPublish{}, err
	}
	document.DefaultProjectID = project.ID

	listenerConfig, err := p.copyListenerEntrypoint(strings.TrimSpace(options.ListenerEntrypoint), deploymentRoot, options.ListenerEnabled)
	if err != nil {
		return PreparedProjectPublish{}, err
	}

	publishedDocument := document.Clone()
	structuredDataPayloads, err := p.rewriteDocumentForDeployment(&publishedDocument, deploymentRoot)
	if err != nil {
		return PreparedProjectPublish{}, err
	}
	if err := stripPasswordValues(&publishedDocument); err != nil {
		return PreparedProjectPublish{}, err
	}

	return PreparedProjectPublish{
		Project:                project,
		ListenerConfig:         listenerConfig,
		PublishedDocument:      publishedDocument,
		StructuredDataPayloads: structuredDataPayloads,
	}, nil
}

func (p *SharePublisher) WriteProjectPublishOutput(
	ctx context.Context,
	deploymentRoot string,
	prepared PreparedProjectPublish,
	manifest Manifest,
	policy Policy,
) error {
	if p == nil {
		return ErrSharePublisherCatalogRequired
	}
	return p.writeSharePublishOutput(
		ctx,
		deploymentRoot,
		prepared.PublishedDocument,
		prepared.StructuredDataPayloads,
		manifest,
		policy,
	)
}

func (p *SharePublisher) writeSharePublishOutput(
	ctx context.Context,
	deploymentRoot string,
	publishedDocument projectstate.Document,
	structuredDataPayloads map[string]map[string]any,
	manifest Manifest,
	policy Policy,
) error {
	store, err := projectstate.NewStore(filepath.Join(deploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		return fmt.Errorf("create deployment project store: %w", err)
	}
	if err := store.Save(ctx, publishedDocument); err != nil {
		return fmt.Errorf("save deployment project: %w", err)
	}
	for relativePath, payload := range structuredDataPayloads {
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
	if err := writeJSONFile(filepath.Join(deploymentRoot, "policy.json"), policy); err != nil {
		return fmt.Errorf("write deployment policy: %w", err)
	}
	return nil
}

func applySharePolicyOverrides(overrides *SharePolicyOverrides) (Policy, error) {
	policy := DefaultPolicy()
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
