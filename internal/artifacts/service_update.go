package artifacts

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	binarypayload "setta/internal/binary"
	"setta/internal/statefs"
)

func (s *Service) buildUpdateAction(artifact RawArtifact, scope UploadScope) (updateAction, error) {
	artifactID, targetPath, err := s.resolveArtifactPath(artifact.ID)
	if err != nil {
		return updateAction{}, err
	}
	builder, ok := updateActionBuilders[artifact.Type]
	if !ok {
		return updateAction{}, unsupportedArtifactTypeError(artifact.Type)
	}
	return builder(s, artifactUpdateInput{
		artifact:   artifact,
		artifactID: artifactID,
		targetPath: targetPath,
		scope:      scope,
	})
}

func (s *Service) parseBinaryRef(artifactID string, artifact RawArtifact, payloadLabel string) (binarypayload.ContentRef, error) {
	if artifact.Value == nil {
		return binarypayload.ContentRef{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Artifact %s is missing a value.", artifactID),
		}
	}
	var ref binarypayload.ContentRef
	if err := json.Unmarshal(*artifact.Value, &ref); err != nil {
		return binarypayload.ContentRef{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Artifact %s has an invalid %s payload.", artifactID, payloadLabel),
		}
	}
	return ref, nil
}

func (s *Service) readBinaryContent(ref binarypayload.ContentRef) ([]byte, error) {
	content, err := s.binaryStore.ReadBytes(ref.ContentID)
	if err != nil {
		switch {
		case errors.Is(err, binarypayload.ErrInvalidContentID), errors.Is(err, binarypayload.ErrContentIDRequired):
			return nil, &Error{
				Kind:    ErrorBinaryPayloadInvalid,
				Message: "Invalid binary content id.",
			}
		case errors.Is(err, binarypayload.ErrPayloadNotFound):
			return nil, &Error{
				Kind:    ErrorBinaryPayloadNotFound,
				Message: "Binary payload not found.",
			}
		default:
			return nil, err
		}
	}
	return content, nil
}

func (s *Service) applyUpdateAction(action updateAction, strategy SaveConflictStrategy) (ArtifactSaveResult, error) {
	lastKnownHash := s.lastKnownHash(action.targetPath)
	if lastKnownHash != "" && lastKnownHash == action.payloadHash {
		return ArtifactSaveResult{
			ID:     action.artifactID,
			Type:   action.artifactType,
			Status: SaveStatusUnchanged,
		}, nil
	}

	currentHash, exists, err := fileHash(action.targetPath)
	if err != nil {
		return ArtifactSaveResult{}, err
	}

	resolution, err := s.resolveUpdateConflict(action.targetPath, lastKnownHash, currentHash, exists, strategy)
	if err != nil {
		return ArtifactSaveResult{}, err
	}
	if resolution.skipWrite {
		return buildArtifactSaveResult(action, resolution), nil
	}

	if err := statefs.AtomicWriteFile(action.targetPath, action.payload, defaultFileMode); err != nil {
		return ArtifactSaveResult{}, fmt.Errorf("write artifact: %w", err)
	}
	if err := s.cacheUpdatedArtifact(action); err != nil {
		return ArtifactSaveResult{}, err
	}

	return buildArtifactSaveResult(action, resolution), nil
}

func (s *Service) prepareImport(rawPath string, scope UploadScope) (preparedImport, error) {
	resolvedPath, err := s.resolveWorkspaceFile(rawPath)
	if err != nil {
		return preparedImport{}, err
	}
	content, err := readImportContent(rawPath, resolvedPath)
	if err != nil {
		return preparedImport{}, err
	}
	name := filepath.Base(resolvedPath)
	mimeType := guessMimeType(resolvedPath, "")
	if err := EnforceUploadPolicy(s.uploadPolicies, scope, name, mimeType, len(content)); err != nil {
		return preparedImport{}, err
	}
	artifactID, targetPath, err := s.newArtifactTargetPath(joinedExtensions(name))
	if err != nil {
		return preparedImport{}, err
	}
	return preparedImport{
		action: importAction{
			artifactID: artifactID,
			targetPath: targetPath,
			name:       name,
			mimeType:   mimeType,
			content:    content,
		},
		result: ImportFilesResponseItem{
			Kind:     "file",
			ID:       artifactID,
			Name:     name,
			MimeType: mimeType,
			Size:     len(content),
		},
	}, nil
}

func readImportContent(rawPath string, resolvedPath string) ([]byte, error) {
	info, err := os.Stat(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("File does not exist: %s", rawPath),
			}
		}
		return nil, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", rawPath),
		}
	}
	if info.IsDir() {
		return nil, &Error{
			Kind:    ErrorPathNotFile,
			Message: fmt.Sprintf("Path is not a file: %s", rawPath),
		}
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		return nil, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to read file: %s", rawPath),
		}
	}
	return content, nil
}

func (s *Service) persistImport(action importAction) error {
	if err := statefs.AtomicWriteFile(action.targetPath, action.content, defaultFileMode); err != nil {
		return fmt.Errorf("write imported artifact: %w", err)
	}
	ref, err := s.binaryStore.StoreBytes(action.content, action.mimeType, true)
	if err != nil {
		return err
	}
	s.storeFileCache(action.targetPath, FileArtifact{
		Type:  ArtifactTypeFile,
		ID:    action.artifactID,
		Value: ref,
	}, hashBytes(action.content))
	return nil
}

func buildFileUpdateAction(s *Service, input artifactUpdateInput) (updateAction, error) {
	return s.buildBinaryUpdateAction(input, "file", true)
}

func buildImageUpdateAction(s *Service, input artifactUpdateInput) (updateAction, error) {
	return s.buildBinaryUpdateAction(input, "binary", false)
}

func (s *Service) buildBinaryUpdateAction(input artifactUpdateInput, payloadLabel string, enforcePolicy bool) (updateAction, error) {
	ref, content, err := s.readUpdateBinaryContent(input.artifactID, input.artifact, payloadLabel)
	if err != nil {
		return updateAction{}, err
	}
	mimeType := guessMimeType(input.targetPath, ref.MimeType)
	if enforcePolicy {
		if err := EnforceUploadPolicy(s.uploadPolicies, input.scope, input.artifactID, mimeType, len(content)); err != nil {
			return updateAction{}, err
		}
	}
	return updateAction{
		artifactType: input.artifact.Type,
		artifactID:   input.artifactID,
		targetPath:   input.targetPath,
		mimeType:     mimeType,
		payload:      content,
		payloadHash:  hashBytes(content),
		binaryRef:    &ref,
	}, nil
}

func (s *Service) readUpdateBinaryContent(artifactID string, artifact RawArtifact, payloadLabel string) (binarypayload.ContentRef, []byte, error) {
	ref, err := s.parseBinaryRef(artifactID, artifact, payloadLabel)
	if err != nil {
		return binarypayload.ContentRef{}, nil, err
	}
	content, err := s.readBinaryContent(ref)
	if err != nil {
		return binarypayload.ContentRef{}, nil, err
	}
	return ref, content, nil
}

func buildChartUpdateAction(_ *Service, input artifactUpdateInput) (updateAction, error) {
	value, err := parseChartArtifactValue(input.artifactID, input.artifact.Value)
	if err != nil {
		return updateAction{}, err
	}
	csvContent, err := chartDataToCSV(value)
	if err != nil {
		return updateAction{}, invalidArtifactRequestf(input.artifactID, "has an invalid chart data payload.")
	}
	return updateAction{
		artifactType: input.artifact.Type,
		artifactID:   input.artifactID,
		targetPath:   input.targetPath,
		payload:      csvContent,
		payloadHash:  hashBytes(csvContent),
		chartValue:   cloneChartDataValues(value),
	}, nil
}

func parseChartArtifactValue(artifactID string, rawValue *json.RawMessage) (ChartDataValue, error) {
	if rawValue == nil {
		return nil, missingArtifactValueError(artifactID)
	}
	var value ChartDataValue
	if err := json.Unmarshal(*rawValue, &value); err != nil {
		return nil, invalidArtifactRequestf(artifactID, "has an invalid chart data payload.")
	}
	return value, nil
}

func buildJSONUpdateAction(_ *Service, input artifactUpdateInput) (updateAction, error) {
	canonicalJSON, err := parseJSONObjectValue(input.artifact.Type, input.artifactID, input.artifact.Value)
	if err != nil {
		return updateAction{}, err
	}
	return updateAction{
		artifactType: input.artifact.Type,
		artifactID:   input.artifactID,
		targetPath:   input.targetPath,
		payload:      canonicalJSON,
		payloadHash:  hashBytes(canonicalJSON),
		jsonValue:    canonicalJSON,
	}, nil
}

func parseJSONObjectValue(artifactType ArtifactType, artifactID string, rawValue *json.RawMessage) (json.RawMessage, error) {
	if rawValue == nil {
		return nil, missingArtifactValueError(artifactID)
	}
	canonicalJSON, err := canonicalizeArtifactJSONObject(artifactType, *rawValue)
	if err != nil {
		return nil, invalidArtifactRequestf(artifactID, "has an invalid JSON value.")
	}
	return canonicalJSON, nil
}

func (s *Service) lastKnownHash(targetPath string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.metadata[targetPath].LastKnownHash
}

func (s *Service) resolveUpdateConflict(targetPath string, lastKnownHash string, currentHash string, exists bool, strategy SaveConflictStrategy) (updateConflictResolution, error) {
	resolution := updateConflictResolution{status: SaveStatusSaved}
	if lastKnownHash == "" || currentHash == lastKnownHash {
		return resolution, nil
	}
	switch strategy {
	case SaveConflictStrategySkip:
		return updateConflictResolution{
			status:    SaveStatusSkipped,
			message:   stringPtr("Skipped save due to detected external changes."),
			skipWrite: true,
		}, nil
	case SaveConflictStrategyBackup:
		backupPath, err := s.createResolvedConflictBackup(targetPath, exists)
		if err != nil {
			return updateConflictResolution{}, err
		}
		return updateConflictResolution{
			status:     SaveStatusConflict,
			backupPath: backupPath,
			message:    conflictBackupMessage(backupPath),
		}, nil
	case SaveConflictStrategyOverwrite:
		return updateConflictResolution{
			status:  SaveStatusConflict,
			message: stringPtr("External changes detected. Overwriting per requested strategy."),
		}, nil
	default:
		return updateConflictResolution{}, invalidConflictStrategyError(strategy)
	}
}

func (s *Service) createResolvedConflictBackup(targetPath string, exists bool) (*string, error) {
	if !exists {
		return nil, nil
	}
	createdBackup, err := s.createConflictBackup(targetPath)
	if err != nil {
		return nil, err
	}
	normalizedBackup, err := s.normalizeResolvedArtifactID(createdBackup)
	if err != nil {
		return nil, nil
	}
	return &normalizedBackup, nil
}

func conflictBackupMessage(backupPath *string) *string {
	if backupPath == nil {
		return stringPtr("External changes detected.")
	}
	return stringPtr(fmt.Sprintf("External changes detected. Previous contents copied to %s.", *backupPath))
}

func buildArtifactSaveResult(action updateAction, resolution updateConflictResolution) ArtifactSaveResult {
	return ArtifactSaveResult{
		ID:         action.artifactID,
		Type:       action.artifactType,
		Status:     resolution.status,
		BackupPath: resolution.backupPath,
		Message:    resolution.message,
	}
}

func (s *Service) cacheUpdatedArtifact(action updateAction) error {
	switch action.artifactType {
	case ArtifactTypeFile:
		ref, err := requireBinaryUpdateRef(action)
		if err != nil {
			return err
		}
		s.storeFileCache(action.targetPath, FileArtifact{
			Type:  ArtifactTypeFile,
			ID:    action.artifactID,
			Value: ref,
		}, action.payloadHash)
	case ArtifactTypeImage:
		ref, err := requireBinaryUpdateRef(action)
		if err != nil {
			return err
		}
		s.storeImageCache(action.targetPath, ImageArtifact{
			Type:  ArtifactTypeImage,
			ID:    action.artifactID,
			Value: ref,
		}, action.payloadHash)
	case ArtifactTypeChartData:
		s.storeChartCache(action.targetPath, ChartDataArtifact{
			Type:  ArtifactTypeChartData,
			ID:    action.artifactID,
			Value: cloneChartDataValues(action.chartValue),
		}, action.payloadHash)
	case ArtifactTypeBrushStroke, ArtifactTypeDrawAreaLayerItemTransform:
		s.storeJSONCache(action.targetPath, JSONArtifact{
			Type:  action.artifactType,
			ID:    action.artifactID,
			Value: cloneRawJSON(action.jsonValue),
		}, action.payloadHash)
	default:
		return unsupportedArtifactTypeError(action.artifactType)
	}
	return nil
}

func requireBinaryUpdateRef(action updateAction) (binarypayload.ContentRef, error) {
	if action.binaryRef == nil {
		return binarypayload.ContentRef{}, missingArtifactBinaryPayloadError(action.artifactID)
	}
	return *action.binaryRef, nil
}

func missingArtifactValueError(artifactID string) error {
	return invalidArtifactRequestf(artifactID, "is missing a value.")
}

func missingArtifactBinaryPayloadError(artifactID string) error {
	return invalidArtifactRequestf(artifactID, "is missing a binary payload.")
}

func unsupportedArtifactTypeError(artifactType ArtifactType) error {
	return &Error{
		Kind:    ErrorArtifactTypeUnsupported,
		Message: fmt.Sprintf("Artifact type %s is not supported.", artifactType),
	}
}

func invalidConflictStrategyError(strategy SaveConflictStrategy) error {
	return &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Invalid conflict strategy: %q", strategy),
	}
}

func invalidArtifactRequestf(artifactID string, format string, args ...any) error {
	return &Error{
		Kind:    ErrorInvalidRequest,
		Message: fmt.Sprintf("Artifact %s "+format, append([]any{artifactID}, args...)...),
	}
}

func stringPtr(value string) *string {
	return &value
}
