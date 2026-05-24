package artifacts

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

func (s *Service) loadCachedImage(rawPath string) (*ImageArtifact, error) {
	artifactID, resolvedPath, err := s.resolveCachedPath(rawPath)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, nil
	}
	hash := hashBytes(content)

	s.mu.RLock()
	if cached, ok := s.images[resolvedPath]; ok {
		if metadata := s.metadata[resolvedPath]; metadata.LastKnownHash == hash {
			cloned := cached
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	mimeType := guessMimeType(resolvedPath, "")
	ref, err := s.binaryStore.StoreBytes(content, mimeType, true)
	if err != nil {
		return nil, err
	}
	artifact := ImageArtifact{
		Type:  ArtifactTypeImage,
		ID:    artifactID,
		Value: ref,
	}
	cached := s.commitImageCache(resolvedPath, artifact, hash)
	cloned := cached
	return &cloned, nil
}

func (s *Service) loadCachedChart(rawPath string) (*ChartDataArtifact, error) {
	artifactID, resolvedPath, err := s.resolveCachedPath(rawPath)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, nil
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return nil, nil
	}
	hash := hashBytes(content)

	s.mu.RLock()
	if cached, ok := s.chartData[resolvedPath]; ok {
		if metadata := s.metadata[resolvedPath]; metadata.LastKnownHash == hash {
			cloned := cloneChartDataArtifact(cached)
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	value, err := parseChartCSV(content)
	if err != nil {
		return nil, nil
	}
	artifact := ChartDataArtifact{
		Type:  ArtifactTypeChartData,
		ID:    artifactID,
		Value: value,
	}
	s.storeChartCache(resolvedPath, artifact, hash)
	cloned := cloneChartDataArtifact(artifact)
	return &cloned, nil
}

func (s *Service) loadCachedJSON(rawPath string, artifactType ArtifactType) (*JSONArtifact, error) {
	artifactID, resolvedPath, err := s.resolveCachedPath(rawPath)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, nil
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return nil, nil
	}
	hash := hashBytes(content)

	s.mu.RLock()
	if cached, ok := s.jsonArtifacts[resolvedPath]; ok && cached.Type == artifactType {
		if metadata := s.metadata[resolvedPath]; metadata.LastKnownHash == hash {
			cloned := cloneJSONArtifact(cached)
			s.mu.RUnlock()
			return &cloned, nil
		}
	}
	s.mu.RUnlock()

	canonicalJSON, err := canonicalizeArtifactJSONObject(artifactType, content)
	if err != nil {
		return nil, nil
	}
	artifact := JSONArtifact{
		Type:  artifactType,
		ID:    artifactID,
		Value: canonicalJSON,
	}
	s.storeJSONCache(resolvedPath, artifact, hash)
	cloned := cloneJSONArtifact(artifact)
	return &cloned, nil
}

func (s *Service) resolveWorkspaceFile(raw string) (string, error) {
	resolved, err := statefs.ResolveWithinRoot(s.workspaceRoot, raw, "File path")
	if err != nil {
		return "", &Error{
			Kind:    ErrorPathForbidden,
			Message: err.Error(),
		}
	}
	return resolved, nil
}

func (s *Service) resolveCachedPath(raw string) (string, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "artifact path must be a non-empty string",
		}
	}

	if artifactID, resolvedPath, err := s.resolveArtifactPath(trimmed); err == nil {
		return artifactID, resolvedPath, nil
	} else {
		var artifactErr *Error
		if !errors.As(err, &artifactErr) || artifactErr.Kind != ErrorPathForbidden {
			return "", "", err
		}
	}

	resolvedPath, err := s.resolveWorkspaceFile(trimmed)
	if err != nil {
		return "", "", err
	}
	return trimmed, resolvedPath, nil
}

func (s *Service) resolveArtifactPath(raw string) (string, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "artifact path must be a non-empty string",
		}
	}
	var resolved string
	var err error
	if filepath.IsAbs(trimmed) {
		resolved, err = statefs.NormalizePath(trimmed, "")
		if err != nil {
			return "", "", &Error{
				Kind:    ErrorInvalidRequest,
				Message: "Invalid artifact id.",
			}
		}
		if _, err := statefs.EnsureWithinRoot(s.artifactsRoot, resolved, "artifact path"); err != nil {
			return "", "", &Error{
				Kind:    ErrorPathForbidden,
				Message: err.Error(),
			}
		}
	} else {
		resolved, err = statefs.ResolveWithinRoot(s.settaFilesRoot, trimmed, "artifact path")
		if err != nil {
			return "", "", &Error{
				Kind:    ErrorPathForbidden,
				Message: err.Error(),
			}
		}
		if _, err := statefs.EnsureWithinRoot(s.artifactsRoot, resolved, "artifact path"); err != nil {
			return "", "", &Error{
				Kind:    ErrorPathForbidden,
				Message: err.Error(),
			}
		}
	}
	artifactID, err := s.normalizeResolvedArtifactID(resolved)
	if err != nil {
		return "", "", err
	}
	return artifactID, resolved, nil
}

func (s *Service) normalizeResolvedArtifactID(resolvedPath string) (string, error) {
	relative, err := filepath.Rel(s.settaFilesRoot, resolvedPath)
	if err != nil {
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Invalid artifact path.",
		}
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", &Error{
			Kind:    ErrorPathForbidden,
			Message: fmt.Sprintf("artifact path must be within %s", s.settaFilesRoot),
		}
	}
	return filepath.ToSlash(relative), nil
}

func (s *Service) newArtifactTargetPath(extension string) (string, string, error) {
	trimmedExtension := strings.TrimSpace(extension)
	if trimmedExtension == "" {
		trimmedExtension = ".bin"
	}
	if !strings.HasPrefix(trimmedExtension, ".") {
		trimmedExtension = "." + trimmedExtension
	}
	for range 8 {
		id, err := newArtifactID(trimmedExtension)
		if err != nil {
			return "", "", err
		}
		targetPath, err := statefs.ResolveWithinRoot(s.settaFilesRoot, id, "artifact path")
		if err != nil {
			return "", "", err
		}
		if _, err := os.Stat(targetPath); errors.Is(err, os.ErrNotExist) {
			return id, targetPath, nil
		}
	}
	return "", "", fmt.Errorf("allocate artifact id: exhausted collision retries")
}

func (s *Service) createConflictBackup(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read conflict backup source: %w", err)
	}
	backupPath := conflictBackupPath(path, s.timeNow())
	if err := statefs.AtomicWriteFile(backupPath, content, defaultFileMode); err != nil {
		return "", fmt.Errorf("write conflict backup: %w", err)
	}
	return backupPath, nil
}

func (s *Service) commitImageCache(path string, artifact ImageArtifact, hash string) ImageArtifact {
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.images[path]; ok {
		metadata, hasMetadata := s.metadata[path]
		if hasMetadata && metadata.LastKnownHash == hash {
			if existing.Value.ContentID != artifact.Value.ContentID {
				if _, err := s.binaryStore.ResolvePath(existing.Value.ContentID); err == nil {
					_ = s.binaryStore.Delete(artifact.Value.ContentID)
					return existing
				}
				_ = s.binaryStore.Delete(existing.Value.ContentID)
			}
			s.images[path] = artifact
			s.metadata[path] = artifactMetadata{LastKnownHash: hash}
			return artifact
		}
		if existing.Value.ContentID != artifact.Value.ContentID {
			_ = s.binaryStore.Delete(existing.Value.ContentID)
		}
	}
	s.images[path] = artifact
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
	return artifact
}

func (s *Service) storeImageCache(path string, artifact ImageArtifact, hash string) {
	_ = s.commitImageCache(path, artifact, hash)
}

func (s *Service) storeChartCache(path string, artifact ChartDataArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.chartData[path] = cloneChartDataArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeJSONCache(path string, artifact JSONArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jsonArtifacts[path] = cloneJSONArtifact(artifact)
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}

func (s *Service) storeFileCache(path string, artifact FileArtifact, hash string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.files[path]; ok && existing.Value.ContentID != artifact.Value.ContentID {
		_ = s.binaryStore.Delete(existing.Value.ContentID)
	}
	s.files[path] = artifact
	s.metadata[path] = artifactMetadata{LastKnownHash: hash}
}
