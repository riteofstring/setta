package deployments

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/projectstate"
)

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
