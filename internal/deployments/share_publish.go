package deployments

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	toml "github.com/pelletier/go-toml/v2"
	"gopkg.in/yaml.v3"

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

type preparedSharePublish struct {
	project                projectstate.Project
	policy                 Policy
	listenerConfig         *ListenerConfig
	publishedDocument      projectstate.Document
	structuredDataPayloads map[string]map[string]any
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

	allocation, err := p.catalog.Allocate(request.DeploymentName)
	if err != nil {
		return SharePublishResult{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(allocation.DeploymentRoot)
		}
	}()

	prepared, err := p.prepareSharePublish(request, allocation.DeploymentRoot)
	if err != nil {
		return SharePublishResult{}, err
	}

	manifest, err := Manifest{
		Version:           1,
		DeploymentName:    allocation.DeploymentName,
		DeploymentType:    TypeShare,
		DefaultProjectID:  prepared.project.ID,
		DeploymentVersion: allocation.DeploymentVersion,
		CreatedAt:         p.now().UTC(),
		Listener:          prepared.listenerConfig,
	}.Normalized()
	if err != nil {
		return SharePublishResult{}, err
	}
	if err := p.writeSharePublishOutput(
		ctx,
		allocation.DeploymentRoot,
		prepared.publishedDocument,
		prepared.structuredDataPayloads,
		manifest,
		prepared.policy,
	); err != nil {
		return SharePublishResult{}, err
	}

	success = true
	return SharePublishResult{
		Metadata: Metadata{
			DeploymentName:      allocation.DeploymentName,
			DeploymentVersion:   allocation.DeploymentVersion,
			DeploymentType:      TypeShare,
			DefaultProjectID:    prepared.project.ID,
			DefaultProjectName:  prepared.project.Name,
			CreatedAt:           manifest.CreatedAt,
			DeploymentRoot:      allocation.DeploymentRoot,
			PolicyPath:          filepath.Join(allocation.DeploymentRoot, "policy.json"),
			DeploymentVersionNo: mustParseDeploymentVersion(allocation.DeploymentVersion),
		},
		Manifest: manifest,
		Policy:   prepared.policy,
		Snapshot: prepared.publishedDocument,
	}, nil
}

func (p *SharePublisher) prepareSharePublish(
	request SharePublishRequest,
	deploymentRoot string,
) (preparedSharePublish, error) {
	snapshot := request.ProjectState.Snapshot()
	document := snapshot.Document.Clone()
	project, err := document.ProjectByID(request.ProjectID)
	if err != nil {
		return preparedSharePublish{}, err
	}
	document.DefaultProjectID = project.ID

	policy, err := applySharePolicyOverrides(request.PolicyOverrides)
	if err != nil {
		return preparedSharePublish{}, err
	}
	listenerConfig, err := p.copyListenerEntrypoint(strings.TrimSpace(request.ListenerEntrypoint), deploymentRoot, request.ListenerEnabled)
	if err != nil {
		return preparedSharePublish{}, err
	}

	publishedDocument := document.Clone()
	structuredDataPayloads, err := p.rewriteDocumentForDeployment(&publishedDocument, deploymentRoot)
	if err != nil {
		return preparedSharePublish{}, err
	}
	if err := stripPasswordValues(&publishedDocument); err != nil {
		return preparedSharePublish{}, err
	}

	return preparedSharePublish{
		project:                project,
		policy:                 policy,
		listenerConfig:         listenerConfig,
		publishedDocument:      publishedDocument,
		structuredDataPayloads: structuredDataPayloads,
	}, nil
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

func (p *SharePublisher) rewriteDocumentForDeployment(document *projectstate.Document, deploymentRoot string) (map[string]map[string]any, error) {
	pathMaps := publishPathMaps{
		artifact: map[string]string{},
		code:     map[string]string{},
		json:     map[string]string{},
	}
	structuredDataPayloads := map[string]map[string]any{}

	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		payloads, err := p.rewriteProjectForDeployment(&project, deploymentRoot, pathMaps)
		if err != nil {
			return nil, fmt.Errorf("rewrite deployment project %q: %w", projectID, err)
		}
		document.Projects[projectID] = project
		for relativePath, payload := range payloads {
			existing, ok := structuredDataPayloads[relativePath]
			if !ok {
				structuredDataPayloads[relativePath] = cloneJSONObject(payload)
				continue
			}
			structuredDataPayloads[relativePath] = mergeJSONObject(existing, payload)
		}
	}

	return structuredDataPayloads, nil
}

func (p *SharePublisher) rewriteProjectForDeployment(
	project *projectstate.Project,
	deploymentRoot string,
	pathMaps publishPathMaps,
) (map[string]map[string]any, error) {
	structuredDataPayloads := map[string]map[string]any{}
	if err := p.rewriteProjectGeneratedCodeBinding(project, deploymentRoot, pathMaps.code); err != nil {
		return nil, err
	}

	seenVariants := map[string]struct{}{}
	for _, target := range orderedProjectSectionVariants(project) {
		if !markProjectVariantSeen(seenVariants, target.variantID) {
			continue
		}

		relativePath, sourcePayload, err := p.rewriteProjectVariantForDeployment(
			project,
			target.sectionID,
			target.variantID,
			deploymentRoot,
			pathMaps,
		)
		if err != nil {
			return nil, err
		}
		if relativePath == "" {
			continue
		}
		structuredDataPayloads[relativePath] = mergeJSONObject(structuredDataPayloads[relativePath], sourcePayload)
	}

	return structuredDataPayloads, nil
}

type projectSectionVariantTarget struct {
	sectionID string
	variantID string
}

func orderedProjectSectionVariants(project *projectstate.Project) []projectSectionVariantTarget {
	sectionIDs := make([]string, 0, len(project.Sections))
	for sectionID := range project.Sections {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)

	targets := make([]projectSectionVariantTarget, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		for _, variantID := range project.Sections[sectionID].VariantIDs {
			targets = append(targets, projectSectionVariantTarget{
				sectionID: sectionID,
				variantID: variantID,
			})
		}
	}
	return targets
}

func markProjectVariantSeen(seenVariants map[string]struct{}, variantID string) bool {
	if _, ok := seenVariants[variantID]; ok {
		return false
	}
	seenVariants[variantID] = struct{}{}
	return true
}

func (p *SharePublisher) rewriteProjectVariantForDeployment(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	deploymentRoot string,
	pathMaps publishPathMaps,
) (string, map[string]any, error) {
	payload, err := project.EffectiveSectionPayload(sectionID, variantID)
	if err != nil {
		return "", nil, err
	}
	if err := p.rewriteSectionPayload(project, sectionID, variantID, payload, deploymentRoot, pathMaps); err != nil {
		return "", nil, err
	}
	return p.buildStructuredDataPayloadForVariant(project, variantID, payload)
}

func (p *SharePublisher) buildStructuredDataPayloadForVariant(
	project *projectstate.Project,
	variantID string,
	payload map[string]any,
) (string, map[string]any, error) {
	if stringField(payload, "type") != "Dict" || !boolField(payload, "isJsonSource") {
		return "", nil, nil
	}

	relativePath := structuredDataVariantPath(*project, variantID)
	if relativePath == "" {
		return "", nil, nil
	}
	sourcePayload, err := buildJSONSourcePayload(*project, payload)
	if err != nil {
		return "", nil, err
	}
	return relativePath, sourcePayload, nil
}

func structuredDataVariantPath(project projectstate.Project, variantID string) string {
	variant := project.SectionVariants[variantID]
	if strings.TrimSpace(variant.Name) == "" {
		return ""
	}
	return filepath.ToSlash(variant.Name)
}

func (p *SharePublisher) rewriteSectionPayload(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMaps publishPathMaps,
) error {
	if err := p.rewriteSectionArtifactPathFields(project, sectionID, variantID, payload, deploymentRoot, pathMaps.artifact); err != nil {
		return err
	}
	if err := p.rewriteSectionCodeFileBinding(project, sectionID, variantID, payload, deploymentRoot, pathMaps.code); err != nil {
		return err
	}
	if err := p.rewriteSectionDrawLayersField(project, sectionID, variantID, payload, deploymentRoot, pathMaps.artifact); err != nil {
		return err
	}
	if err := p.rewriteSectionMessagesField(project, sectionID, variantID, payload, deploymentRoot, pathMaps.artifact); err != nil {
		return err
	}
	if err := p.rewriteSectionBranchesField(project, sectionID, variantID, payload, deploymentRoot, pathMaps.artifact); err != nil {
		return err
	}
	if err := p.rewriteSectionCodeObjectPayloads(project, sectionID, payload, deploymentRoot, pathMaps.artifact); err != nil {
		return err
	}
	return p.rewriteSectionJSONSourceVariant(project, variantID, payload, deploymentRoot, pathMaps.json)
}

func (p *SharePublisher) rewriteSectionArtifactPathFields(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	for _, fieldName := range []string{"imagePath", "dataPath", "renderedImagePath"} {
		if err := p.rewriteSectionArtifactPathField(project, sectionID, variantID, fieldName, payload, deploymentRoot, pathMap); err != nil {
			return err
		}
	}
	return nil
}

func (p *SharePublisher) rewriteSectionArtifactPathField(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	fieldName string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	sourcePath := stringField(payload, fieldName)
	if sourcePath == "" {
		return nil
	}
	rebased, err := p.copyArtifactPath(sourcePath, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	return project.SetSectionFieldForVariant(sectionID, variantID, fieldName, rebased)
}

func (p *SharePublisher) rewriteSectionCodeFileBinding(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	bindingObject, ok := objectField(payload, "codeFileBinding")
	if !ok {
		return nil
	}
	bindingPath := stringField(bindingObject, "canonical_path")
	if bindingPath == "" {
		return nil
	}
	rebased, err := p.copyCodePath(bindingPath, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	bindingObject["canonical_path"] = rebased
	return project.SetSectionFieldForVariant(sectionID, variantID, "codeFileBinding", bindingObject)
}

func (p *SharePublisher) rewriteSectionDrawLayersField(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	layers, changed, err := p.rewriteDrawLayers(payload, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	if !changed {
		return nil
	}
	return project.SetSectionFieldForVariant(sectionID, variantID, "layers", layers)
}

func (p *SharePublisher) rewriteSectionMessagesField(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	messages, changed, err := p.rewriteChatMessagesField(payload, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	if !changed {
		return nil
	}
	return project.SetSectionFieldForVariant(sectionID, variantID, "messages", messages)
}

func (p *SharePublisher) rewriteSectionBranchesField(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	branches, changed, err := p.rewriteChatBranchesField(payload, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	if !changed {
		return nil
	}
	return project.SetSectionFieldForVariant(sectionID, variantID, "branches", branches)
}

func (p *SharePublisher) rewriteSectionJSONSourceVariant(
	project *projectstate.Project,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	if !boolField(payload, "isJsonSource") {
		return nil
	}

	variant, ok := project.SectionVariants[variantID]
	if !ok {
		return fmt.Errorf("%w: %q", projectstate.ErrSectionVariantNotFound, variantID)
	}
	if strings.TrimSpace(variant.Name) == "" {
		return nil
	}
	rebased, err := p.rebaseJSONSourcePath(variant.Name, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	variant.Name = rebased
	project.SectionVariants[variantID] = variant
	return nil
}

func (p *SharePublisher) rewriteProjectGeneratedCodeBinding(
	project *projectstate.Project,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	if project.GeneratedCodeBinding == nil {
		return nil
	}

	rebased, err := p.copyCodePath(project.GeneratedCodeBinding.Path, deploymentRoot, pathMap)
	if err != nil {
		return err
	}
	project.GeneratedCodeBinding = &projectstate.CodeFileBinding{
		Path:        rebased,
		AccessMode:  project.GeneratedCodeBinding.AccessMode,
		AutoBinding: project.GeneratedCodeBinding.AutoBinding,
	}
	return nil
}

func (p *SharePublisher) rewriteChatMessagesField(
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) ([]any, bool, error) {
	rawMessages, ok := payload["messages"].([]any)
	if !ok {
		return nil, false, nil
	}
	return p.rewriteChatMessages(rawMessages, deploymentRoot, pathMap)
}

func (p *SharePublisher) rewriteChatBranchesField(
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) (map[string]any, bool, error) {
	rawBranches, ok := payload["branches"].(map[string]any)
	if !ok {
		return nil, false, nil
	}

	changed := false
	updatedBranches := make(map[string]any, len(rawBranches))
	for branchID, rawBranch := range rawBranches {
		branchObject, ok := rawBranch.(map[string]any)
		if !ok {
			updatedBranches[branchID] = rawBranch
			continue
		}

		nextBranch := cloneJSONObject(branchObject)
		updatedMessages, branchChanged, err := p.rewriteChatMessagesField(nextBranch, deploymentRoot, pathMap)
		if err != nil {
			return nil, false, err
		}
		if branchChanged {
			nextBranch["messages"] = updatedMessages
			changed = true
		}
		updatedBranches[branchID] = nextBranch
	}

	return updatedBranches, changed, nil
}

func (p *SharePublisher) rewriteChatMessages(
	messages []any,
	deploymentRoot string,
	pathMap map[string]string,
) ([]any, bool, error) {
	changed := false
	updatedMessages := make([]any, len(messages))
	for messageIndex, rawMessage := range messages {
		messageObject, ok := rawMessage.(map[string]any)
		if !ok {
			updatedMessages[messageIndex] = rawMessage
			continue
		}

		nextMessage := cloneJSONObject(messageObject)
		attachments, changedAttachments, err := p.rewriteArtifactAttachmentList(rawAttachmentList(nextMessage["attachments"]), deploymentRoot, pathMap, false)
		if err != nil {
			return nil, false, err
		}
		if changedAttachments {
			nextMessage["attachments"] = attachments
			changed = true
		}
		updatedMessages[messageIndex] = nextMessage
	}

	return updatedMessages, changed, nil
}

func (p *SharePublisher) rewriteSectionCodeObjectPayloads(
	project *projectstate.Project,
	sectionID string,
	sectionPayload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
) error {
	codeObjVariantMap := stringMapField(sectionPayload, "codeObjVariantMap")
	if len(codeObjVariantMap) == 0 {
		return nil
	}

	codeObjIDs := make([]string, 0, len(codeObjVariantMap))
	for codeObjID := range codeObjVariantMap {
		codeObjIDs = append(codeObjIDs, codeObjID)
	}
	sort.Strings(codeObjIDs)

	for _, codeObjID := range codeObjIDs {
		payload, _, _, _, err := project.ResolveSectionCodeObject(sectionID, codeObjID)
		if err != nil {
			return err
		}
		if stringField(payload, "type") != "DropzoneParam" {
			continue
		}

		rewrittenValue, changed, err := p.rewriteDropzoneValue(rawStringField(payload, "value"), deploymentRoot, pathMap)
		if err != nil {
			return err
		}
		if !changed {
			continue
		}
		if err := project.SetSectionCodeObjectValue(sectionID, codeObjID, rewrittenValue); err != nil {
			return err
		}
	}

	return nil
}

func (p *SharePublisher) rewriteDropzoneValue(
	rawValue string,
	deploymentRoot string,
	pathMap map[string]string,
) (string, bool, error) {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return rawValue, false, nil
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return rawValue, false, nil
	}

	attachments, changed, err := p.rewriteArtifactAttachmentList(rawAttachmentList(payload["attachments"]), deploymentRoot, pathMap, true)
	if err != nil {
		return "", false, err
	}
	if !changed {
		return rawValue, false, nil
	}
	payload["attachments"] = attachments

	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", false, err
	}
	return string(encoded), true, nil
}

func (p *SharePublisher) rewriteArtifactAttachmentList(
	rawAttachments []any,
	deploymentRoot string,
	pathMap map[string]string,
	requireFileKind bool,
) ([]any, bool, error) {
	if len(rawAttachments) == 0 {
		return nil, false, nil
	}

	changed := false
	updatedAttachments := make([]any, len(rawAttachments))
	for attachmentIndex, rawAttachment := range rawAttachments {
		attachmentObject, ok := rawAttachment.(map[string]any)
		if !ok {
			updatedAttachments[attachmentIndex] = rawAttachment
			continue
		}

		nextAttachment := cloneJSONObject(attachmentObject)
		if requireFileKind && stringField(nextAttachment, "kind") != "file" {
			updatedAttachments[attachmentIndex] = nextAttachment
			continue
		}

		attachmentID := stringField(nextAttachment, "id")
		if attachmentID == "" {
			updatedAttachments[attachmentIndex] = nextAttachment
			continue
		}

		rebased, err := p.copyArtifactPath(attachmentID, deploymentRoot, pathMap)
		if err != nil {
			return nil, false, err
		}
		nextAttachment["id"] = rebased
		changed = true
		updatedAttachments[attachmentIndex] = nextAttachment
	}

	return updatedAttachments, changed, nil
}

func rawAttachmentList(value any) []any {
	attachments, ok := value.([]any)
	if !ok {
		return nil
	}
	return attachments
}

func (p *SharePublisher) rewriteDrawLayers(payload map[string]any, deploymentRoot string, pathMap map[string]string) ([]any, bool, error) {
	layers, ok := rawDrawLayerList(payload["layers"])
	if !ok {
		return nil, false, nil
	}

	return p.rewriteDrawLayerList(layers, deploymentRoot, pathMap)
}

func rawDrawLayerList(value any) ([]any, bool) {
	layers, ok := value.([]any)
	return layers, ok
}

func (p *SharePublisher) rewriteDrawLayerList(
	layers []any,
	deploymentRoot string,
	pathMap map[string]string,
) ([]any, bool, error) {
	changed := false
	updatedLayers := make([]any, len(layers))
	for layerIndex, rawLayer := range layers {
		updatedLayer, layerChanged, err := p.rewriteDrawLayer(rawLayer, deploymentRoot, pathMap)
		if err != nil {
			return nil, false, err
		}
		updatedLayers[layerIndex] = updatedLayer
		if layerChanged {
			changed = true
		}
	}

	return updatedLayers, changed, nil
}

func (p *SharePublisher) rewriteDrawLayer(
	rawLayer any,
	deploymentRoot string,
	pathMap map[string]string,
) (any, bool, error) {
	layerObject, ok := rawLayer.(map[string]any)
	if !ok {
		return rawLayer, false, nil
	}

	nextLayer := cloneJSONObject(layerObject)
	updatedElements, changed, err := p.rewriteDrawElements(nextLayer["elements"], deploymentRoot, pathMap)
	if err != nil {
		return nil, false, err
	}
	if updatedElements != nil {
		nextLayer["elements"] = updatedElements
	}
	return nextLayer, changed, nil
}

func (p *SharePublisher) rewriteDrawElements(
	rawElements any,
	deploymentRoot string,
	pathMap map[string]string,
) ([]any, bool, error) {
	elements, ok := rawElements.([]any)
	if !ok {
		return nil, false, nil
	}

	changed := false
	updatedElements := make([]any, len(elements))
	for elementIndex, rawElement := range elements {
		updatedElement, elementChanged, err := p.rewriteDrawElement(rawElement, deploymentRoot, pathMap)
		if err != nil {
			return nil, false, err
		}
		updatedElements[elementIndex] = updatedElement
		if elementChanged {
			changed = true
		}
	}
	return updatedElements, changed, nil
}

func (p *SharePublisher) rewriteDrawElement(
	rawElement any,
	deploymentRoot string,
	pathMap map[string]string,
) (any, bool, error) {
	elementObject, ok := rawElement.(map[string]any)
	if !ok {
		return rawElement, false, nil
	}

	nextElement := cloneJSONObject(elementObject)
	changed, err := p.rewriteArtifactObjectFields(nextElement, deploymentRoot, pathMap, "dataPath", "transformId")
	if err != nil {
		return nil, false, err
	}
	return nextElement, changed, nil
}

func (p *SharePublisher) rewriteArtifactObjectFields(
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
	fieldNames ...string,
) (bool, error) {
	changed := false
	for _, fieldName := range fieldNames {
		fieldChanged, err := p.rewriteArtifactObjectField(payload, fieldName, deploymentRoot, pathMap)
		if err != nil {
			return false, err
		}
		if fieldChanged {
			changed = true
		}
	}
	return changed, nil
}

func (p *SharePublisher) rewriteArtifactObjectField(
	payload map[string]any,
	fieldName string,
	deploymentRoot string,
	pathMap map[string]string,
) (bool, error) {
	sourcePath := stringField(payload, fieldName)
	if sourcePath == "" {
		return false, nil
	}

	rebased, err := p.copyArtifactPath(sourcePath, deploymentRoot, pathMap)
	if err != nil {
		return false, err
	}
	payload[fieldName] = rebased
	return true, nil
}

func buildJSONSourcePayload(project projectstate.Project, sectionPayload map[string]any) (map[string]any, error) {
	payload := map[string]any{}
	keyPath := stringSliceField(sectionPayload, "jsonSourceKeys")
	addKeyPath(payload, keyPath)

	topLevelParamID := stringField(sectionPayload, "topLevelParamId")
	if topLevelParamID == "" {
		return payload, nil
	}

	codeObjVariantMap := stringMapField(sectionPayload, "codeObjVariantMap")
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		return nil, err
	}

	for _, childID := range stringSliceField(rootPayload, "children") {
		if err := buildJSONSourcePayloadForCodeObject(payload, keyPath, project, codeObjVariantMap, childID); err != nil {
			return nil, err
		}
	}
	return payload, nil
}

func buildJSONSourcePayloadForCodeObject(
	root map[string]any,
	parentPath []string,
	project projectstate.Project,
	codeObjVariantMap map[string]string,
	codeObjID string,
) error {
	payload, codeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(codeObj.Name) == "" {
		return projectstate.ErrCodeObjNameRequired
	}

	currentPath := append(append([]string(nil), parentPath...), codeObj.Name)
	children := stringSliceField(payload, "children")
	if len(children) == 0 {
		setKeyPathValue(root, currentPath, tryJSONValue(rawStringField(payload, "value")))
		return nil
	}

	addKeyPath(root, currentPath)
	for _, childID := range children {
		if err := buildJSONSourcePayloadForCodeObject(root, currentPath, project, codeObjVariantMap, childID); err != nil {
			return err
		}
	}
	return nil
}

func (p *SharePublisher) copyListenerEntrypoint(source string, deploymentRoot string, enabled bool) (*ListenerConfig, error) {
	if source == "" {
		return nil, nil
	}
	sourcePath, err := p.resolveSourcePath(source)
	if err != nil {
		return nil, err
	}
	targetPath := filepath.Join(deploymentRoot, "listener", "app.py")
	if err := copyFile(sourcePath, targetPath); err != nil {
		return nil, err
	}
	return &ListenerConfig{
		Entrypoint: filepath.ToSlash(filepath.Join("listener", "app.py")),
		Enabled:    enabled,
	}, nil
}

func (p *SharePublisher) copyArtifactPath(source string, deploymentRoot string, pathMap map[string]string) (string, error) {
	return p.copyFileIntoDeployment(source, deploymentRoot, pathMap, p.artifactsRoot, filepath.Join(deploymentRoot, "artifacts"), false)
}

func (p *SharePublisher) copyCodePath(source string, deploymentRoot string, pathMap map[string]string) (string, error) {
	return p.copyFileIntoDeployment(source, deploymentRoot, pathMap, p.codeRoot, filepath.Join(deploymentRoot, "code"), false)
}

func (p *SharePublisher) rebaseJSONSourcePath(source string, deploymentRoot string, pathMap map[string]string) (string, error) {
	trimmedSource := strings.TrimSpace(source)
	if trimmedSource == "" {
		return "", nil
	}
	if existing, ok := pathMap[trimmedSource]; ok {
		return existing, nil
	}

	sourcePath, err := p.resolveSourcePath(trimmedSource)
	if err != nil {
		return "", err
	}
	targetPath, err := p.targetPathForDeploymentFile(sourcePath, filepath.Join(deploymentRoot, "json_sources"), p.jsonSourcesRoot, true)
	if err != nil {
		return "", err
	}
	relative := deploymentRelativePath(targetPath, deploymentRoot)
	pathMap[trimmedSource] = relative
	return relative, nil
}

func (p *SharePublisher) copyFileIntoDeployment(
	source string,
	deploymentRoot string,
	pathMap map[string]string,
	preferredSourceRoot string,
	targetRoot string,
	hashByContent bool,
) (string, error) {
	trimmedSource := strings.TrimSpace(source)
	if trimmedSource == "" {
		return "", nil
	}
	if existing, ok := pathMap[trimmedSource]; ok {
		return existing, nil
	}

	sourcePath, err := p.resolveSourcePath(trimmedSource)
	if err != nil {
		return "", err
	}
	targetPath, err := p.targetPathForDeploymentFile(sourcePath, targetRoot, preferredSourceRoot, hashByContent)
	if err != nil {
		return "", err
	}
	if err := copyFile(sourcePath, targetPath); err != nil {
		return "", err
	}
	relative := deploymentRelativePath(targetPath, deploymentRoot)
	pathMap[trimmedSource] = relative
	return relative, nil
}

func (p *SharePublisher) targetPathForDeploymentFile(
	sourcePath string,
	targetRoot string,
	preferredSourceRoot string,
	hashByContent bool,
) (string, error) {
	if relativePath, ok := relativeWithinRoot(preferredSourceRoot, sourcePath); ok {
		return filepath.Join(targetRoot, relativePath), nil
	}

	digest, err := fileDigestPrefix(sourcePath, hashByContent)
	if err != nil {
		return "", err
	}
	base := filepath.Base(sourcePath)
	extension := filepath.Ext(base)
	stem := strings.TrimSuffix(base, extension)
	if stem == "" {
		stem = "file"
	}
	return filepath.Join(targetRoot, stem+"_"+digest+extension), nil
}

func (p *SharePublisher) resolveSourcePath(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ErrStructuredDataPathInvalid
	}
	if filepath.IsAbs(trimmed) {
		return statefs.NormalizePath(trimmed, "")
	}

	normalizedRelative := filepath.Clean(filepath.FromSlash(trimmed))
	if isManagedSettaFilesRelativePath(normalizedRelative) {
		return statefs.ResolveWithinRoot(p.settaFilesRoot, normalizedRelative, "deployment source path")
	}
	return statefs.ResolveWithinRoot(p.workspaceRoot, normalizedRelative, "deployment source path")
}

func isManagedSettaFilesRelativePath(path string) bool {
	parts := strings.Split(filepath.ToSlash(path), "/")
	if len(parts) == 0 {
		return false
	}
	switch parts[0] {
	case "artifacts", "code", "json_sources":
		return true
	default:
		return false
	}
}

func relativeWithinRoot(root string, candidate string) (string, bool) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return "", false
	}
	resolvedCandidate, err := statefs.NormalizePath(candidate, "")
	if err != nil {
		return "", false
	}

	relativePath, err := filepath.Rel(resolvedRoot, resolvedCandidate)
	if err != nil {
		return "", false
	}
	if relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
		return "", false
	}
	return relativePath, true
}

func copyFile(sourcePath string, targetPath string) error {
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read source file: %w", err)
	}
	return statefs.AtomicWriteFile(targetPath, content, publishFileMode)
}

func deploymentRelativePath(targetPath string, deploymentRoot string) string {
	relativePath, err := filepath.Rel(deploymentRoot, targetPath)
	if err != nil {
		return filepath.ToSlash(filepath.Base(targetPath))
	}
	return filepath.ToSlash(relativePath)
}

func fileDigestPrefix(path string, hashByContent bool) (string, error) {
	input := []byte(path)
	if hashByContent {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			file, err := os.Open(path)
			if err != nil {
				return "", err
			}
			defer file.Close()
			content, err := io.ReadAll(file)
			if err != nil {
				return "", err
			}
			input = content
		}
	}
	sum := md5.Sum(input)
	return hex.EncodeToString(sum[:])[:8], nil
}

func writeJSONFile(path string, payload any) error {
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return statefs.AtomicWriteFile(path, content, publishFileMode)
}

func writeStructuredDataPayload(path string, payload map[string]any) error {
	if payload == nil {
		payload = map[string]any{}
	}
	if err := validateJSONValue(payload, path); err != nil {
		return err
	}

	extension := strings.ToLower(filepath.Ext(path))
	var content []byte
	var err error
	switch extension {
	case ".json":
		content, err = json.MarshalIndent(payload, "", "  ")
		if err == nil {
			content = append(content, '\n')
		}
	case ".yaml", ".yml":
		content, err = yaml.Marshal(payload)
	case ".toml":
		content, err = toml.Marshal(payload)
	default:
		return fmt.Errorf("%w: %s", ErrStructuredDataExtensionUnsupported, path)
	}
	if err != nil {
		return err
	}
	if len(content) == 0 || content[len(content)-1] != '\n' {
		content = append(content, '\n')
	}
	return statefs.AtomicWriteFile(path, content, publishFileMode)
}

func validateJSONValue(value any, path string) error {
	switch typed := value.(type) {
	case map[string]any:
		for key, item := range typed {
			if strings.TrimSpace(key) == "" && key != "" {
				return fmt.Errorf("%w: %s", ErrStructuredDataRootObjectRequired, path)
			}
			if err := validateJSONValue(item, path+"."+key); err != nil {
				return err
			}
		}
	case []any:
		for index, item := range typed {
			if err := validateJSONValue(item, fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
	case nil, string, bool, float64, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
	default:
		return fmt.Errorf("%w: %s (%T)", ErrStructuredDataRootObjectRequired, path, value)
	}
	return nil
}

func stripPasswordValues(document *projectstate.Document) error {
	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		for implID, impl := range project.CodeObjImpls {
			if strings.TrimSpace(impl.Type) != "PasswordParam" {
				continue
			}
			payload := map[string]any{
				"id":   impl.ID,
				"type": impl.Type,
			}
			if len(impl.Payload) > 0 {
				if err := json.Unmarshal(impl.Payload, &payload); err != nil {
					return err
				}
			}
			payload["value"] = ""
			payload["defaultVal"] = ""
			payload["hasSecret"] = false
			raw, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			impl.Payload = raw
			project.CodeObjImpls[implID] = impl
		}
		document.Projects[projectID] = project
	}

	return nil
}

func objectField(object map[string]any, key string) (map[string]any, bool) {
	value, ok := object[key]
	if !ok {
		return nil, false
	}
	typed, ok := value.(map[string]any)
	return typed, ok
}

func stringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(typed)
}

func rawStringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return typed
}

func boolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	typed, ok := value.(bool)
	return ok && typed
}

func stringSliceField(object map[string]any, key string) []string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawValues, ok := value.([]any)
	if !ok {
		return nil
	}
	values := make([]string, 0, len(rawValues))
	for _, rawValue := range rawValues {
		typed, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			continue
		}
		values = append(values, trimmed)
	}
	return values
}

func stringMapField(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return map[string]string{}
	}
	rawMap, ok := value.(map[string]any)
	if !ok {
		return map[string]string{}
	}
	output := make(map[string]string, len(rawMap))
	for rawKey, rawValue := range rawMap {
		typed, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			continue
		}
		output[rawKey] = trimmed
	}
	return output
}

func addKeyPath(root map[string]any, keyPath []string) {
	current := root
	for _, key := range keyPath {
		next, ok := current[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			current[key] = next
		}
		current = next
	}
}

func setKeyPathValue(root map[string]any, keyPath []string, value any) {
	if len(keyPath) == 0 {
		return
	}
	current := root
	for _, key := range keyPath[:len(keyPath)-1] {
		next, ok := current[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			current[key] = next
		}
		current = next
	}
	current[keyPath[len(keyPath)-1]] = cloneJSONValue(value)
}

func tryJSONValue(raw string) any {
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return raw
	}
	return value
}

func mergeJSONObject(base map[string]any, overlay map[string]any) map[string]any {
	if base == nil {
		return cloneJSONObject(overlay)
	}
	merged := cloneJSONObject(base)
	for key, value := range overlay {
		if baseObject, ok := merged[key].(map[string]any); ok {
			if overlayObject, ok := value.(map[string]any); ok {
				merged[key] = mergeJSONObject(baseObject, overlayObject)
				continue
			}
		}
		merged[key] = cloneJSONValue(value)
	}
	return merged
}

func cloneJSONObject(source map[string]any) map[string]any {
	if source == nil {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneJSONValue(value)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneJSONObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneJSONValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func mustParseDeploymentVersion(value string) int {
	number, _ := parseDeploymentVersion(value)
	return number
}
