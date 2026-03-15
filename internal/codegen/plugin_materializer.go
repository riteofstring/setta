package codegen

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"setta/internal/codegencontracts"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const pluginCodegenRootDirName = "plugin_codegen"

var (
	ErrPluginCodegenSettaFilesRootRequired = errors.New("codegen: plugin codegen setta files root is required")
	ErrPluginCodegenGeneratorRequired      = errors.New("codegen: plugin codegen generator is required")

	pluginMaterializerWindowsDrivePrefixPattern = regexp.MustCompile(`^[A-Za-z]:`)
)

type PluginCodegenGenerator interface {
	ResolvePluginCodegenTarget(context.Context, string) (codegencontracts.PluginTargetResolution, bool, error)
	GeneratePluginCodegenTarget(context.Context, string, map[string]any, map[string]any) ([]codegencontracts.PluginGeneratedFile, error)
}

type PluginMaterializerOptions struct {
	SettaFilesRoot string
	Generator      PluginCodegenGenerator
}

type PluginMaterializer struct {
	settaFilesRoot string
	generator      PluginCodegenGenerator

	mu             sync.Mutex
	stateByProject map[string]pluginMaterializerProjectState
}

type pluginMaterializerProjectState struct {
	OutputRoot string
	Targets    map[string]pluginMaterializerTargetState
}

type pluginMaterializerTargetState struct {
	Fingerprint  string
	OutputHashes map[string]string
	OutputStats  map[string]pluginMaterializerOutputStat
}

type pluginMaterializerOutputStat struct {
	Size        int64
	ModTimeUnix int64
}

type pluginMaterializerResolvedTarget struct {
	projectTarget projectstate.ProjectCodegenTarget
	resolved      codegencontracts.PluginTargetResolution
	targetOptions map[string]any
}

func NewPluginMaterializer(options PluginMaterializerOptions) (*PluginMaterializer, error) {
	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, ErrPluginCodegenSettaFilesRootRequired
	}
	if options.Generator == nil {
		return nil, ErrPluginCodegenGeneratorRequired
	}
	return &PluginMaterializer{
		settaFilesRoot: settaFilesRoot,
		generator:      options.Generator,
		stateByProject: map[string]pluginMaterializerProjectState{},
	}, nil
}

func (m *PluginMaterializer) MaterializeDocument(ctx context.Context, document projectstate.Document) error {
	if m == nil {
		return ErrPluginCodegenSettaFilesRootRequired
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	nextStateByProject := make(map[string]pluginMaterializerProjectState, len(projectIDs))
	expectedOutputRoots := map[string]struct{}{}
	for _, projectID := range projectIDs {
		if err := ctx.Err(); err != nil {
			return err
		}
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return err
		}
		projectState, ok, err := m.materializeProjectLocked(ctx, project, m.stateByProject[projectID])
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		nextStateByProject[projectID] = projectState
		expectedOutputRoots[projectState.OutputRoot] = struct{}{}
	}

	for projectID, previousState := range m.stateByProject {
		if _, ok := nextStateByProject[projectID]; ok {
			continue
		}
		if err := removePluginOutputRoot(previousState.OutputRoot); err != nil {
			return err
		}
	}
	if err := pruneStalePluginGeneratedOutputs(m.settaFilesRoot, expectedOutputRoots); err != nil {
		return err
	}

	m.stateByProject = nextStateByProject
	return nil
}

func (m *PluginMaterializer) materializeProjectLocked(
	ctx context.Context,
	project projectstate.Project,
	previousState pluginMaterializerProjectState,
) (pluginMaterializerProjectState, bool, error) {
	outputRoot := pluginCodegenOutputRoot(m.settaFilesRoot, project.Name)
	if previousState.OutputRoot != "" && previousState.OutputRoot != outputRoot {
		if err := removePluginOutputRoot(previousState.OutputRoot); err != nil {
			return pluginMaterializerProjectState{}, false, err
		}
	}

	resolvedTargets, err := m.resolveProjectTargets(ctx, project)
	if err != nil {
		return pluginMaterializerProjectState{}, false, err
	}
	if len(resolvedTargets) == 0 {
		if err := removePluginOutputRoot(outputRoot); err != nil {
			return pluginMaterializerProjectState{}, false, err
		}
		return pluginMaterializerProjectState{}, false, nil
	}

	currentTargetDirNames := make(map[string]struct{}, len(resolvedTargets))
	for _, target := range resolvedTargets {
		currentTargetDirNames[pluginCodegenTargetDirName(target.projectTarget.Language)] = struct{}{}
	}
	if err := removeUnexpectedPluginTargetDirs(outputRoot, currentTargetDirNames); err != nil {
		return pluginMaterializerProjectState{}, false, err
	}

	projectPayload, err := pluginProjectPayload(project)
	if err != nil {
		return pluginMaterializerProjectState{}, false, err
	}
	projectHash, err := hashJSONValue(projectPayload)
	if err != nil {
		return pluginMaterializerProjectState{}, false, err
	}

	nextTargets := make(map[string]pluginMaterializerTargetState, len(resolvedTargets))
	for _, target := range resolvedTargets {
		if err := ctx.Err(); err != nil {
			return pluginMaterializerProjectState{}, false, err
		}
		language := target.projectTarget.Language
		targetRoot := filepath.Join(outputRoot, pluginCodegenTargetDirName(language))
		fingerprint, err := buildPluginTargetFingerprint(projectHash, language, target.targetOptions, target.resolved.ImplementationKey)
		if err != nil {
			return pluginMaterializerProjectState{}, false, err
		}

		previousTargetState, hadPreviousTarget := previousState.Targets[language]
		if hadPreviousTarget && previousTargetState.Fingerprint == fingerprint {
			cachedOutputsExist, outputStats, err := cachedPluginOutputsExist(targetRoot, previousTargetState.OutputHashes, previousTargetState.OutputStats)
			if err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
			if cachedOutputsExist {
				nextTargets[language] = pluginMaterializerTargetState{
					Fingerprint:  fingerprint,
					OutputHashes: clonePluginStringMap(previousTargetState.OutputHashes),
					OutputStats:  outputStats,
				}
				continue
			}
		}

		if !hadPreviousTarget {
			if err := removePluginOutputRoot(targetRoot); err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
		}

		generatedFiles, err := m.generator.GeneratePluginCodegenTarget(ctx, language, projectPayload, target.targetOptions)
		if err != nil {
			return pluginMaterializerProjectState{}, false, err
		}
		outputHashes := make(map[string]string, len(generatedFiles))
		expectedPaths := make(map[string]struct{}, len(generatedFiles))
		for _, file := range generatedFiles {
			normalizedRelativePath, err := normalizePluginGeneratedRelativePath(file.RelativePath)
			if err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
			outputPath, err := resolvePluginGeneratedOutputPath(targetRoot, normalizedRelativePath)
			if err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
			if err := preparePluginOutputPathForWrite(targetRoot, outputPath); err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
			if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
				return pluginMaterializerProjectState{}, false, fmt.Errorf("create plugin codegen parent dir %s: %w", filepath.Dir(outputPath), err)
			}

			expectedPaths[normalizedRelativePath] = struct{}{}
			outputHashes[normalizedRelativePath] = hashPluginGeneratedContent(file.Content)
			existingContent, err := os.ReadFile(outputPath)
			switch {
			case err == nil && string(existingContent) == file.Content:
				continue
			case err == nil, errors.Is(err, os.ErrNotExist):
				if err := statefs.AtomicWriteFile(outputPath, []byte(file.Content), 0o644); err != nil {
					return pluginMaterializerProjectState{}, false, fmt.Errorf("write plugin generated output %s: %w", outputPath, err)
				}
			default:
				return pluginMaterializerProjectState{}, false, fmt.Errorf("read plugin generated output %s: %w", outputPath, err)
			}
		}

		staleRelativePaths := previousRelativePaths(previousTargetState.OutputHashes, expectedPaths)
		for _, relativePath := range staleRelativePaths {
			stalePath, err := resolvePluginGeneratedOutputPath(targetRoot, relativePath)
			if err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
			if err := removePluginGeneratedFile(stalePath); err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
			if err := pruneEmptyPluginOutputDirectories(filepath.Dir(stalePath), targetRoot); err != nil {
				return pluginMaterializerProjectState{}, false, err
			}
		}
		if err := pruneUnexpectedPluginOutputs(targetRoot, expectedPaths); err != nil {
			return pluginMaterializerProjectState{}, false, err
		}
		outputStats, err := collectPluginOutputStats(targetRoot, expectedPaths)
		if err != nil {
			return pluginMaterializerProjectState{}, false, err
		}
		nextTargets[language] = pluginMaterializerTargetState{
			Fingerprint:  fingerprint,
			OutputHashes: outputHashes,
			OutputStats:  outputStats,
		}
	}

	return pluginMaterializerProjectState{
		OutputRoot: outputRoot,
		Targets:    nextTargets,
	}, true, nil
}

func (m *PluginMaterializer) resolveProjectTargets(
	ctx context.Context,
	project projectstate.Project,
) ([]pluginMaterializerResolvedTarget, error) {
	resolvedTargets := make([]pluginMaterializerResolvedTarget, 0, len(project.CodegenTargets))
	for _, target := range project.CodegenTargets {
		if target.Language == string(projectstate.CodeLanguagePython) {
			continue
		}
		resolved, ok, err := m.generator.ResolvePluginCodegenTarget(ctx, target.Language)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		targetOptions, err := pluginCodegenTargetOptions(target)
		if err != nil {
			return nil, err
		}
		resolvedTargets = append(resolvedTargets, pluginMaterializerResolvedTarget{
			projectTarget: target,
			resolved:      resolved,
			targetOptions: targetOptions,
		})
	}
	sort.Slice(resolvedTargets, func(i int, j int) bool {
		return resolvedTargets[i].projectTarget.Language < resolvedTargets[j].projectTarget.Language
	})
	return resolvedTargets, nil
}

func pluginCodegenOutputRoot(settaFilesRoot string, projectName string) string {
	return filepath.Join(projectstate.ProjectCodeSectionsRoot(settaFilesRoot, projectName), pluginCodegenRootDirName)
}

func pluginCodegenTargetDirName(targetID string) string {
	normalizedChars := make([]rune, 0, len(targetID))
	for _, char := range targetID {
		switch {
		case char >= 'a' && char <= 'z':
			normalizedChars = append(normalizedChars, char)
		case char >= 'A' && char <= 'Z':
			normalizedChars = append(normalizedChars, char)
		case char >= '0' && char <= '9':
			normalizedChars = append(normalizedChars, char)
		case char == '-' || char == '_' || char == '.':
			normalizedChars = append(normalizedChars, char)
		default:
			normalizedChars = append(normalizedChars, '_')
		}
	}
	normalized := strings.Trim(string(normalizedChars), "_")
	if normalized == "" {
		normalized = "_"
	}
	digest := sha256.Sum256([]byte(targetID))
	return normalized + "__" + hex.EncodeToString(digest[:])[:12]
}

func normalizePluginGeneratedRelativePath(relativePath string) (string, error) {
	value := strings.TrimSpace(relativePath)
	value = strings.ReplaceAll(value, `\`, `/`)
	if value == "" {
		return "", fmt.Errorf("plugin codegen output path cannot be empty")
	}
	if path.IsAbs(value) || strings.HasPrefix(value, "//") || pluginMaterializerWindowsDrivePrefixPattern.MatchString(value) {
		return "", fmt.Errorf("plugin codegen output path cannot be absolute: %s", value)
	}

	parts := make([]string, 0, len(strings.Split(value, "/")))
	for _, part := range strings.Split(value, "/") {
		switch part {
		case "", ".":
			continue
		case "..":
			return "", fmt.Errorf("plugin codegen output path cannot escape target root: %s", value)
		default:
			parts = append(parts, part)
		}
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("plugin codegen output path cannot be empty")
	}
	return strings.Join(parts, "/"), nil
}

func resolvePluginGeneratedOutputPath(targetRoot string, relativePath string) (string, error) {
	normalizedRelativePath, err := normalizePluginGeneratedRelativePath(relativePath)
	if err != nil {
		return "", err
	}
	resolvedTargetRoot, err := statefs.NormalizePath(targetRoot, "")
	if err != nil {
		return "", err
	}
	candidate := filepath.Join(resolvedTargetRoot, filepath.FromSlash(normalizedRelativePath))
	resolvedCandidate, err := statefs.NormalizePath(candidate, "")
	if err != nil {
		return "", err
	}
	if _, err := statefs.EnsureWithinRoot(resolvedTargetRoot, resolvedCandidate, "plugin codegen output path"); err != nil {
		return "", fmt.Errorf("plugin codegen output path escapes target root: %s", normalizedRelativePath)
	}
	return resolvedCandidate, nil
}

func preparePluginOutputPathForWrite(targetRoot string, outputPath string) error {
	parentPaths := []string{}
	current := filepath.Dir(outputPath)
	for {
		relative, err := filepath.Rel(targetRoot, current)
		if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
			break
		}
		if relative == "." {
			break
		}
		parentPaths = append(parentPaths, current)
		current = filepath.Dir(current)
	}
	for index := len(parentPaths) - 1; index >= 0; index-- {
		parentPath := parentPaths[index]
		info, err := os.Lstat(parentPath)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return fmt.Errorf("stat plugin codegen parent path %s: %w", parentPath, err)
		}
		if info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			if err := os.Remove(parentPath); err != nil {
				return fmt.Errorf("remove plugin codegen parent path %s: %w", parentPath, err)
			}
		}
	}

	info, err := os.Lstat(outputPath)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("stat plugin codegen output path %s: %w", outputPath, err)
	case info.Mode()&os.ModeSymlink != 0:
		return os.Remove(outputPath)
	case info.Mode().IsRegular():
		return nil
	case info.IsDir():
		return os.RemoveAll(outputPath)
	default:
		return os.Remove(outputPath)
	}
}

func cachedPluginOutputsExist(
	targetRoot string,
	outputHashes map[string]string,
	outputStats map[string]pluginMaterializerOutputStat,
) (bool, map[string]pluginMaterializerOutputStat, error) {
	info, err := os.Stat(targetRoot)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return false, map[string]pluginMaterializerOutputStat{}, nil
	case err != nil:
		return false, nil, fmt.Errorf("stat plugin codegen target root %s: %w", targetRoot, err)
	case !info.IsDir():
		return false, map[string]pluginMaterializerOutputStat{}, nil
	}

	expectedPaths := make(map[string]struct{}, len(outputHashes))
	for relativePath := range outputHashes {
		normalizedRelativePath, err := normalizePluginGeneratedRelativePath(relativePath)
		if err != nil {
			return false, nil, err
		}
		expectedPaths[normalizedRelativePath] = struct{}{}
	}
	discoveredPaths, err := collectPluginOutputRelativePaths(targetRoot)
	if err != nil {
		return false, nil, err
	}
	if !stringSetEqual(discoveredPaths, expectedPaths) {
		return false, map[string]pluginMaterializerOutputStat{}, nil
	}

	observedStats, err := collectPluginOutputStats(targetRoot, expectedPaths)
	if err != nil {
		return false, nil, err
	}
	expectedStats := normalizeOutputStats(outputStats)
	if outputStatsEqual(observedStats, expectedStats) {
		return true, observedStats, nil
	}

	for relativePath, expectedHash := range outputHashes {
		outputPath, err := resolvePluginGeneratedOutputPath(targetRoot, relativePath)
		if err != nil {
			return false, nil, err
		}
		outputContent, err := os.ReadFile(outputPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return false, map[string]pluginMaterializerOutputStat{}, nil
			}
			return false, nil, fmt.Errorf("read plugin generated output %s: %w", outputPath, err)
		}
		if hashPluginGeneratedContent(string(outputContent)) != expectedHash {
			return false, map[string]pluginMaterializerOutputStat{}, nil
		}
	}
	return true, observedStats, nil
}

func collectPluginOutputRelativePaths(targetRoot string) (map[string]struct{}, error) {
	relativePaths := map[string]struct{}{}
	if err := filepath.WalkDir(targetRoot, func(outputPath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relativePath, err := filepath.Rel(targetRoot, outputPath)
		if err != nil {
			return err
		}
		normalizedRelativePath, err := normalizePluginGeneratedRelativePath(filepath.ToSlash(relativePath))
		if err != nil {
			return err
		}
		relativePaths[normalizedRelativePath] = struct{}{}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("walk plugin codegen output root %s: %w", targetRoot, err)
	}
	return relativePaths, nil
}

func collectPluginOutputStats(
	targetRoot string,
	relativePaths map[string]struct{},
) (map[string]pluginMaterializerOutputStat, error) {
	outputStats := make(map[string]pluginMaterializerOutputStat, len(relativePaths))
	for relativePath := range relativePaths {
		outputPath, err := resolvePluginGeneratedOutputPath(targetRoot, relativePath)
		if err != nil {
			return nil, err
		}
		info, err := os.Stat(outputPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return map[string]pluginMaterializerOutputStat{}, nil
			}
			return nil, fmt.Errorf("stat plugin generated output %s: %w", outputPath, err)
		}
		if !info.Mode().IsRegular() {
			return map[string]pluginMaterializerOutputStat{}, nil
		}
		outputStats[relativePath] = pluginMaterializerOutputStat{
			Size:        info.Size(),
			ModTimeUnix: info.ModTime().UnixNano(),
		}
	}
	return outputStats, nil
}

func pruneUnexpectedPluginOutputs(targetRoot string, expectedPaths map[string]struct{}) error {
	discoveredPaths, err := collectPluginOutputRelativePaths(targetRoot)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return err
	}
	for relativePath := range discoveredPaths {
		if _, ok := expectedPaths[relativePath]; ok {
			continue
		}
		outputPath, err := resolvePluginGeneratedOutputPath(targetRoot, relativePath)
		if err != nil {
			return err
		}
		if err := removePluginGeneratedFile(outputPath); err != nil {
			return err
		}
		if err := pruneEmptyPluginOutputDirectories(filepath.Dir(outputPath), targetRoot); err != nil {
			return err
		}
	}
	return nil
}

func pruneEmptyPluginOutputDirectories(directory string, stopRoot string) error {
	current := directory
	for current != stopRoot {
		entries, err := os.ReadDir(current)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return fmt.Errorf("read plugin codegen directory %s: %w", current, err)
		}
		if len(entries) != 0 {
			return nil
		}
		if err := os.Remove(current); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return fmt.Errorf("remove empty plugin codegen directory %s: %w", current, err)
		}
		current = filepath.Dir(current)
	}
	return nil
}

func removeUnexpectedPluginTargetDirs(outputRoot string, expectedDirNames map[string]struct{}) error {
	entries, err := os.ReadDir(outputRoot)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("read plugin codegen output root %s: %w", outputRoot, err)
	}
	for _, entry := range entries {
		if _, ok := expectedDirNames[entry.Name()]; ok {
			continue
		}
		if err := os.RemoveAll(filepath.Join(outputRoot, entry.Name())); err != nil {
			return fmt.Errorf("remove stale plugin codegen target dir %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func pruneStalePluginGeneratedOutputs(settaFilesRoot string, expectedOutputRoots map[string]struct{}) error {
	sectionsRoot := filepath.Join(settaFilesRoot, "code", "sections")
	projectEntries, err := os.ReadDir(sectionsRoot)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("read plugin codegen sections root %s: %w", sectionsRoot, err)
	}
	for _, projectEntry := range projectEntries {
		pluginRoot := filepath.Join(sectionsRoot, projectEntry.Name(), pluginCodegenRootDirName)
		if _, ok := expectedOutputRoots[pluginRoot]; ok {
			continue
		}
		if err := removePluginOutputRoot(pluginRoot); err != nil {
			return err
		}
	}
	return nil
}

func removePluginGeneratedFile(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove plugin generated output %s: %w", path, err)
	}
	return nil
}

func removePluginOutputRoot(path string) error {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("remove plugin codegen output root %s: %w", path, err)
	}
	return nil
}

func pluginCodegenTargetOptions(target projectstate.ProjectCodegenTarget) (map[string]any, error) {
	if len(target.Payload) == 0 {
		return map[string]any{}, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(target.Payload, &payload); err != nil {
		return nil, fmt.Errorf("decode project codegen target %q payload: %w", target.Language, err)
	}
	if payload == nil {
		return map[string]any{}, nil
	}
	rawOptions, ok := payload["options"]
	if !ok || rawOptions == nil {
		return map[string]any{}, nil
	}
	options, ok := rawOptions.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("project codegen target %q options must be an object", target.Language)
	}
	return cloneAnyMap(options), nil
}

func pluginProjectPayload(project projectstate.Project) (map[string]any, error) {
	encoded, err := json.Marshal(project)
	if err != nil {
		return nil, fmt.Errorf("encode project %s for plugin codegen: %w", project.ID, err)
	}
	var payload map[string]any
	if err := json.Unmarshal(encoded, &payload); err != nil {
		return nil, fmt.Errorf("decode project %s for plugin codegen: %w", project.ID, err)
	}
	return payload, nil
}

func buildPluginTargetFingerprint(
	projectHash string,
	targetLanguage string,
	targetOptions map[string]any,
	implementationKey string,
) (string, error) {
	targetOptionsHash, err := hashJSONValue(targetOptions)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(strings.Join([]string{
		projectHash,
		targetLanguage,
		targetOptionsHash,
		implementationKey,
	}, "|")))
	return hex.EncodeToString(sum[:]), nil
}

func hashJSONValue(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("encode plugin codegen fingerprint payload: %w", err)
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func hashPluginGeneratedContent(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

func previousRelativePaths(previousHashes map[string]string, expectedPaths map[string]struct{}) []string {
	if len(previousHashes) == 0 {
		return nil
	}
	staleRelativePaths := make([]string, 0, len(previousHashes))
	for relativePath := range previousHashes {
		normalizedRelativePath, err := normalizePluginGeneratedRelativePath(relativePath)
		if err != nil {
			continue
		}
		if _, ok := expectedPaths[normalizedRelativePath]; ok {
			continue
		}
		staleRelativePaths = append(staleRelativePaths, normalizedRelativePath)
	}
	sort.Strings(staleRelativePaths)
	return staleRelativePaths
}

func normalizeOutputStats(
	outputStats map[string]pluginMaterializerOutputStat,
) map[string]pluginMaterializerOutputStat {
	normalized := make(map[string]pluginMaterializerOutputStat, len(outputStats))
	for relativePath, stats := range outputStats {
		normalizedRelativePath, err := normalizePluginGeneratedRelativePath(relativePath)
		if err != nil {
			continue
		}
		normalized[normalizedRelativePath] = stats
	}
	return normalized
}

func outputStatsEqual(
	left map[string]pluginMaterializerOutputStat,
	right map[string]pluginMaterializerOutputStat,
) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok || leftValue != rightValue {
			return false
		}
	}
	return true
}

func stringSetEqual(left map[string]struct{}, right map[string]struct{}) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if _, ok := right[key]; !ok {
			return false
		}
	}
	return true
}

func clonePluginStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneAnyMap(values map[string]any) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
