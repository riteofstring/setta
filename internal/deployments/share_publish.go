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

	snapshot := request.ProjectState.Snapshot()
	document := snapshot.Document.Clone()
	project, err := document.ProjectByID(request.ProjectID)
	if err != nil {
		return SharePublishResult{}, err
	}
	document.DefaultProjectID = project.ID

	policy, err := applySharePolicyOverrides(request.PolicyOverrides)
	if err != nil {
		return SharePublishResult{}, err
	}

	listenerConfig, err := p.copyListenerEntrypoint(strings.TrimSpace(request.ListenerEntrypoint), allocation.DeploymentRoot, request.ListenerEnabled)
	if err != nil {
		return SharePublishResult{}, err
	}

	publishedDocument := document.Clone()
	structuredDataPayloads, err := p.rewriteDocumentForDeployment(&publishedDocument, allocation.DeploymentRoot)
	if err != nil {
		return SharePublishResult{}, err
	}
	if err := stripPasswordValues(&publishedDocument); err != nil {
		return SharePublishResult{}, err
	}

	manifest, err := Manifest{
		Version:           1,
		DeploymentName:    allocation.DeploymentName,
		DeploymentType:    TypeShare,
		DefaultProjectID:  project.ID,
		DeploymentVersion: allocation.DeploymentVersion,
		CreatedAt:         p.now().UTC(),
		Listener:          listenerConfig,
	}.Normalized()
	if err != nil {
		return SharePublishResult{}, err
	}

	store, err := projectstate.NewStore(filepath.Join(allocation.DeploymentRoot, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		return SharePublishResult{}, fmt.Errorf("create deployment project store: %w", err)
	}
	if err := store.Save(ctx, publishedDocument); err != nil {
		return SharePublishResult{}, fmt.Errorf("save deployment project: %w", err)
	}
	for relativePath, payload := range structuredDataPayloads {
		targetPath, err := statefs.ResolveWithinRoot(allocation.DeploymentRoot, filepath.FromSlash(relativePath), "deployment structured data")
		if err != nil {
			return SharePublishResult{}, err
		}
		if err := writeStructuredDataPayload(targetPath, payload); err != nil {
			return SharePublishResult{}, err
		}
	}
	if err := writeJSONFile(filepath.Join(allocation.DeploymentRoot, "manifest.json"), manifest); err != nil {
		return SharePublishResult{}, fmt.Errorf("write deployment manifest: %w", err)
	}
	if err := writeJSONFile(filepath.Join(allocation.DeploymentRoot, "policy.json"), policy); err != nil {
		return SharePublishResult{}, fmt.Errorf("write deployment policy: %w", err)
	}

	success = true
	return SharePublishResult{
		Metadata: Metadata{
			DeploymentName:      allocation.DeploymentName,
			DeploymentVersion:   allocation.DeploymentVersion,
			DeploymentType:      TypeShare,
			DefaultProjectID:    project.ID,
			DefaultProjectName:  project.Name,
			CreatedAt:           manifest.CreatedAt,
			DeploymentRoot:      allocation.DeploymentRoot,
			PolicyPath:          filepath.Join(allocation.DeploymentRoot, "policy.json"),
			DeploymentVersionNo: mustParseDeploymentVersion(allocation.DeploymentVersion),
		},
		Manifest: manifest,
		Policy:   policy,
		Snapshot: publishedDocument,
	}, nil
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
	seenVariants := map[string]struct{}{}

	if err := p.rewriteProjectGeneratedCodeBinding(project, deploymentRoot, pathMaps.code); err != nil {
		return nil, err
	}

	sectionIDs := make([]string, 0, len(project.Sections))
	for sectionID := range project.Sections {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)

	for _, sectionID := range sectionIDs {
		section := project.Sections[sectionID]
		for _, variantID := range section.VariantIDs {
			if _, ok := seenVariants[variantID]; ok {
				continue
			}
			seenVariants[variantID] = struct{}{}

			payload, err := project.EffectiveSectionPayload(sectionID, variantID)
			if err != nil {
				return nil, err
			}
			if err := p.rewriteSectionPayload(project, sectionID, variantID, payload, deploymentRoot, pathMaps); err != nil {
				return nil, err
			}

			if stringField(payload, "type") != "Dict" || !boolField(payload, "isJsonSource") {
				continue
			}

			variant := project.SectionVariants[variantID]
			if strings.TrimSpace(variant.Name) == "" {
				continue
			}
			sourcePayload, err := buildJSONSourcePayload(*project, payload)
			if err != nil {
				return nil, err
			}
			structuredDataPayloads[filepath.ToSlash(variant.Name)] = mergeJSONObject(
				structuredDataPayloads[filepath.ToSlash(variant.Name)],
				sourcePayload,
			)
		}
	}

	return structuredDataPayloads, nil
}

func (p *SharePublisher) rewriteSectionPayload(
	project *projectstate.Project,
	sectionID string,
	variantID string,
	payload map[string]any,
	deploymentRoot string,
	pathMaps publishPathMaps,
) error {
	if imagePath := stringField(payload, "imagePath"); imagePath != "" {
		rebased, err := p.copyArtifactPath(imagePath, deploymentRoot, pathMaps.artifact)
		if err != nil {
			return err
		}
		if err := project.SetSectionFieldForVariant(sectionID, variantID, "imagePath", rebased); err != nil {
			return err
		}
	}
	if dataPath := stringField(payload, "dataPath"); dataPath != "" {
		rebased, err := p.copyArtifactPath(dataPath, deploymentRoot, pathMaps.artifact)
		if err != nil {
			return err
		}
		if err := project.SetSectionFieldForVariant(sectionID, variantID, "dataPath", rebased); err != nil {
			return err
		}
	}
	if renderedImagePath := stringField(payload, "renderedImagePath"); renderedImagePath != "" {
		rebased, err := p.copyArtifactPath(renderedImagePath, deploymentRoot, pathMaps.artifact)
		if err != nil {
			return err
		}
		if err := project.SetSectionFieldForVariant(sectionID, variantID, "renderedImagePath", rebased); err != nil {
			return err
		}
	}

	if bindingObject, ok := objectField(payload, "codeFileBinding"); ok {
		bindingPath := stringField(bindingObject, "canonical_path")
		if bindingPath != "" {
			rebased, err := p.copyCodePath(bindingPath, deploymentRoot, pathMaps.code)
			if err != nil {
				return err
			}
			bindingObject["canonical_path"] = rebased
			if err := project.SetSectionFieldForVariant(sectionID, variantID, "codeFileBinding", bindingObject); err != nil {
				return err
			}
		}
	}

	layers, changedLayers, err := p.rewriteDrawLayers(payload, deploymentRoot, pathMaps.artifact)
	if err != nil {
		return err
	}
	if changedLayers {
		if err := project.SetSectionFieldForVariant(sectionID, variantID, "layers", layers); err != nil {
			return err
		}
	}

	messages, changedMessages, err := p.rewriteChatMessagesField(payload, deploymentRoot, pathMaps.artifact)
	if err != nil {
		return err
	}
	if changedMessages {
		if err := project.SetSectionFieldForVariant(sectionID, variantID, "messages", messages); err != nil {
			return err
		}
	}

	branches, changedBranches, err := p.rewriteChatBranchesField(payload, deploymentRoot, pathMaps.artifact)
	if err != nil {
		return err
	}
	if changedBranches {
		if err := project.SetSectionFieldForVariant(sectionID, variantID, "branches", branches); err != nil {
			return err
		}
	}

	if err := p.rewriteSectionCodeObjectPayloads(project, sectionID, payload, deploymentRoot, pathMaps.artifact); err != nil {
		return err
	}

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
	rebased, err := p.rebaseJSONSourcePath(variant.Name, deploymentRoot, pathMaps.json)
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
	rawLayers, ok := payload["layers"]
	if !ok {
		return nil, false, nil
	}
	layers, ok := rawLayers.([]any)
	if !ok {
		return nil, false, nil
	}

	changed := false
	updatedLayers := make([]any, len(layers))
	for layerIndex, rawLayer := range layers {
		layerObject, ok := rawLayer.(map[string]any)
		if !ok {
			updatedLayers[layerIndex] = rawLayer
			continue
		}
		nextLayer := cloneJSONObject(layerObject)
		rawElements, ok := nextLayer["elements"].([]any)
		if !ok {
			updatedLayers[layerIndex] = nextLayer
			continue
		}

		updatedElements := make([]any, len(rawElements))
		for elementIndex, rawElement := range rawElements {
			elementObject, ok := rawElement.(map[string]any)
			if !ok {
				updatedElements[elementIndex] = rawElement
				continue
			}
			nextElement := cloneJSONObject(elementObject)
			if dataPath := stringField(nextElement, "dataPath"); dataPath != "" {
				rebased, err := p.copyArtifactPath(dataPath, deploymentRoot, pathMap)
				if err != nil {
					return nil, false, err
				}
				nextElement["dataPath"] = rebased
				changed = true
			}
			if transformID := stringField(nextElement, "transformId"); transformID != "" {
				rebased, err := p.copyArtifactPath(transformID, deploymentRoot, pathMap)
				if err != nil {
					return nil, false, err
				}
				nextElement["transformId"] = rebased
				changed = true
			}
			updatedElements[elementIndex] = nextElement
		}
		nextLayer["elements"] = updatedElements
		updatedLayers[layerIndex] = nextLayer
	}

	return updatedLayers, changed, nil
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
