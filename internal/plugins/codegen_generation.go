package plugins

import (
	"context"
	"fmt"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

type ResolvedPluginCodegenTarget struct {
	Language          string
	DefaultFileName   string
	ImplementationKey string
}

var windowsDrivePrefixPattern = regexp.MustCompile(`^[A-Za-z]:`)

func (s *Service) ResolvePluginCodegenTarget(
	_ context.Context,
	language string,
) (ResolvedPluginCodegenTarget, bool, error) {
	if s == nil {
		return ResolvedPluginCodegenTarget{}, false, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return ResolvedPluginCodegenTarget{}, false, err
	}

	match, ok, err := findRegisteredCodegenTargetMatch(snapshot.Plugins, language)
	if err != nil {
		return ResolvedPluginCodegenTarget{}, false, err
	}
	if !ok {
		return ResolvedPluginCodegenTarget{}, false, nil
	}
	return ResolvedPluginCodegenTarget{
		Language:          match.Target.Language,
		DefaultFileName:   match.Target.DefaultFileName,
		ImplementationKey: registeredCodegenTargetImplementationKey(match),
	}, true, nil
}

func (s *Service) GeneratePluginCodegenTarget(
	ctx context.Context,
	language string,
	projectState map[string]any,
	targetOptions map[string]any,
) ([]GeneratedCodegenFile, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return nil, err
	}

	match, ok, err := findRegisteredCodegenTargetMatch(snapshot.Plugins, language)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrRegisteredCodegenTargetNotFound, language)
	}

	return invokeGoBackendCodegenTarget(
		ctx,
		match.Entry.SourcePath,
		*match.Entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, BackendBuildRootName),
		match.Target,
		projectState,
		targetOptions,
	)
}

func registeredCodegenTargetImplementationKey(match registeredCodegenTargetMatch) string {
	sourceDigest := ""
	if match.Entry.SourceDigestSHA256 != nil {
		sourceDigest = strings.TrimSpace(*match.Entry.SourceDigestSHA256)
	}
	if sourceDigest == "" {
		sourceDigest = strings.TrimSpace(match.Entry.SourcePath)
	}
	return strings.Join([]string{
		strings.TrimSpace(match.Entry.PluginID),
		strings.TrimSpace(match.Target.TargetID),
		strings.TrimSpace(match.Target.Language),
		sourceDigest,
	}, ":")
}

func normalizeGeneratedCodegenFiles(
	target PluginRegisteredCodegenTarget,
	files []backendRuntimeCodegenFile,
) ([]GeneratedCodegenFile, error) {
	normalizedFiles := make([]GeneratedCodegenFile, 0, len(files))
	seenPaths := make(map[string]struct{}, len(files))
	for _, file := range files {
		relativePath := ""
		if file.RelativePath != nil {
			relativePath = *file.RelativePath
		}
		normalizedPath, err := normalizeGeneratedCodegenRelativePath(relativePath, target.DefaultFileName)
		if err != nil {
			return nil, err
		}
		if _, exists := seenPaths[normalizedPath]; exists {
			return nil, newServiceError(
				ServiceErrorCodeBackendRuntimeInvalid,
				"Plugin codegen output path is duplicated: %s",
				normalizedPath,
			)
		}
		seenPaths[normalizedPath] = struct{}{}
		if file.Content == nil {
			return nil, newServiceError(
				ServiceErrorCodeBackendRuntimeInvalid,
				"Plugin codegen output content is required for %s",
				normalizedPath,
			)
		}
		normalizedFiles = append(normalizedFiles, GeneratedCodegenFile{
			RelativePath: normalizedPath,
			Content:      *file.Content,
		})
	}
	return normalizedFiles, nil
}

func normalizeGeneratedCodegenRelativePath(raw string, defaultFileName string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		value = strings.TrimSpace(defaultFileName)
	}
	value = strings.ReplaceAll(value, `\`, `/`)
	if value == "" {
		return "", newServiceError(ServiceErrorCodeBackendRuntimeInvalid, "Plugin codegen output path cannot be empty.")
	}
	if path.IsAbs(value) || strings.HasPrefix(value, "//") || windowsDrivePrefixPattern.MatchString(value) {
		return "", newServiceError(
			ServiceErrorCodeBackendRuntimeInvalid,
			"Plugin codegen output path cannot be absolute: %s",
			value,
		)
	}

	parts := make([]string, 0, len(strings.Split(value, "/")))
	for _, part := range strings.Split(value, "/") {
		switch part {
		case "", ".":
			continue
		case "..":
			return "", newServiceError(
				ServiceErrorCodeBackendRuntimeInvalid,
				"Plugin codegen output path cannot escape target root: %s",
				value,
			)
		default:
			parts = append(parts, part)
		}
	}
	if len(parts) == 0 {
		return "", newServiceError(ServiceErrorCodeBackendRuntimeInvalid, "Plugin codegen output path cannot be empty.")
	}
	return strings.Join(parts, "/"), nil
}
